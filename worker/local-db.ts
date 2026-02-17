import { prisma } from "@/lib/prisma";

const prismaClient = prisma as any;

export type WorkerJob = {
  id: string;
  userId: string;
  status: string;
  sourcePath: string;
  sourceDurationSec: number;
  cropConfig: unknown;
  transcript: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FinalizeExport = {
  jobId: string;
  userId: string;
  clipId: string;
  clipPath: string;
  clipUrl: string;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  reason: string;
  providerMetadata: Record<string, unknown>;
  expiresAt: Date;
};

export async function recoverStaleProcessingJobs(staleTimeoutMinutes: number) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - staleTimeoutMinutes * 60 * 1000);

  await prismaClient.job.updateMany({
    where: {
      status: "PROCESSING",
      processingStartedAt: { lt: staleCutoff }
    },
    data: {
      status: "READY_TO_PROCESS",
      errorMessage: null,
      processingStage: "QUEUED",
      processingProgress: 1,
      processingNote: `Recovered stale PROCESSING job after ${staleTimeoutMinutes} minutes.`,
      processingStartedAt: null,
      updatedAt: now
    }
  });
}

export async function findNextReadyJob() {
  const now = new Date();
  return prismaClient.job.findFirst({
    where: {
      status: "READY_TO_PROCESS",
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function claimJob(jobId: string) {
  const now = new Date();
  const claim = await prismaClient.job.updateMany({
    where: {
      id: jobId,
      status: "READY_TO_PROCESS"
    },
    data: {
      status: "PROCESSING",
      processingStartedAt: now,
      processingStage: "PROCESSING",
      processingProgress: 2,
      processingNote: "Local worker claimed this job.",
      updatedAt: now
    }
  });

  if (claim.count === 0) return null;
  return prismaClient.job.findUnique({ where: { id: jobId } });
}

export async function updateJobProgress(jobId: string, stage: string, progress: number, note?: string) {
  await prismaClient.job.update({
    where: { id: jobId },
    data: {
      processingStage: stage,
      processingProgress: progress,
      processingNote: note || null,
      updatedAt: new Date()
    }
  });
}

export async function finalizeJob(
  jobId: string,
  exportsRows: FinalizeExport[],
  suggestions: unknown,
  transcriptText: string
) {
  const now = new Date();
  await prismaClient.$transaction(async (tx: any) => {
    await tx.jobExport.deleteMany({ where: { jobId } });

    if (exportsRows.length) {
      await tx.jobExport.createMany({
        data: exportsRows.map((item) => ({
          jobId: item.jobId,
          userId: item.userId,
          clipId: item.clipId,
          clipPath: item.clipPath,
          clipUrl: item.clipUrl,
          title: item.title,
          description: item.description,
          hashtags: item.hashtags,
          hook: item.hook,
          reason: item.reason,
          providerMetadata: item.providerMetadata,
          expiresAt: item.expiresAt
        }))
      });
    }

    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        suggestions: suggestions as object,
        transcript: transcriptText,
        finishedAt: now,
        processingStage: "DONE",
        processingProgress: 100,
        processingNote: "Local worker finished processing.",
        errorMessage: null,
        updatedAt: now
      }
    });
  });
}

export async function failJob(jobId: string, errorMessage: string) {
  const now = new Date();
  await prismaClient.job.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      errorMessage,
      finishedAt: now,
      processingStage: "FAILED",
      processingProgress: 0,
      processingNote: errorMessage,
      updatedAt: now
    }
  });
}
