import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { isWorkerAuthorized } from "@/lib/internal-worker-auth";
import { canConsumeMinutes, consumeMinutes } from "@/lib/usage";

const exportSchema = z.object({
  clipId: z.string().min(1),
  mp4Path: z.string().min(1),
  srtPath: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  title: z.string().min(1),
  hook: z.string().min(1),
  reason: z.string().optional()
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  measuredDurationSec: z.number().positive(),
  exports: z.array(exportSchema).max(5)
});

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id,user_id,status")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "PROCESSING") {
    return NextResponse.json({ error: `Job is ${job.status}, expected PROCESSING` }, { status: 409 });
  }

  const usedMinutes = Math.ceil(parsed.data.measuredDurationSec / 60);
  const usage = await canConsumeMinutes(job.user_id, usedMinutes);
  if (!usage.ok) {
    await supabaseAdmin
      .from("jobs")
      .update({
        status: "FAILED",
        error_message: `Insufficient minutes. Remaining ${usage.remaining} min.`,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);
    return NextResponse.json({ error: "Insufficient minutes" }, { status: 402 });
  }

  const exportExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  for (const item of parsed.data.exports) {
    const { data: signedUrl } = await supabaseAdmin.storage.from("exports").createSignedUrl(item.mp4Path, 72 * 60 * 60);

    await supabaseAdmin.from("job_exports").upsert(
      {
        job_id: job.id,
        user_id: job.user_id,
        clip_id: item.clipId,
        clip_path: item.mp4Path,
        clip_url: signedUrl?.signedUrl || "",
        title: item.title,
        description: `${item.hook}${item.reason ? `\n\n${item.reason}` : ""}`,
        hashtags: ["#tutorial", "#shorts"],
        hook: item.hook,
        reason: item.reason || "",
        provider_metadata: {
          source: {
            startSec: item.startSec,
            endSec: item.endSec,
            srtPath: item.srtPath
          }
        },
        expires_at: exportExpiresAt
      },
      { onConflict: "job_id,clip_id" }
    );
  }

  const nowIso = new Date().toISOString();
  const jobExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const doneWithTelemetry = await supabaseAdmin
    .from("jobs")
    .update({
      status: "DONE",
      source_duration_sec: Math.round(parsed.data.measuredDurationSec),
      processing_stage: "DONE",
      processing_progress: 100,
      processing_note: "Clip generation complete",
      finished_at: nowIso,
      expires_at: jobExpiresAt,
      updated_at: nowIso,
      suggestions: parsed.data.exports
    })
    .eq("id", job.id);

  if (doneWithTelemetry.error?.message?.includes("processing_stage")) {
    await supabaseAdmin
      .from("jobs")
      .update({
        status: "DONE",
        source_duration_sec: Math.round(parsed.data.measuredDurationSec),
        finished_at: nowIso,
        expires_at: jobExpiresAt,
        updated_at: nowIso,
        suggestions: parsed.data.exports
      })
      .eq("id", job.id);
  }

  await consumeMinutes(job.user_id, usedMinutes, job.id);

  return NextResponse.json({ ok: true, exportsCount: parsed.data.exports.length, usedMinutes });
}
