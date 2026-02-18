import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getJobForUser } from "@/lib/db";
import fs from "node:fs/promises";
import { isLocalSourcePath, toLocalFilePath } from "@/lib/source-path";

const patchSchema = z.object({
  status: z.enum(["UPLOADED", "READY_TO_PROCESS", "FAILED"]).optional(),
  clipStyle: z.enum(["Balanced", "Hooky", "Educational", "Story"]).optional(),
  genre: z.enum(["Tutorial", "Podcast", "Talking Head", "Interview", "Demo", "Other"]).optional(),
  clipCount: z.number().int().min(1).max(10).optional(),
  clipLengthMaxS: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).optional(),
  autoHook: z.boolean().optional(),
  includeMomentText: z.string().max(300).optional(),
  timeframeStartS: z.number().min(0).nullable().optional(),
  timeframeEndS: z.number().min(0).nullable().optional(),
  presetId: z.string().max(100).nullable().optional(),
  templateId: z.string().uuid().nullable().optional()
});

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJobForUser(params.jobId, user.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJobForUser(params.jobId, user.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (
    parsed.data.timeframeStartS !== undefined &&
    parsed.data.timeframeEndS !== undefined &&
    parsed.data.timeframeStartS !== null &&
    parsed.data.timeframeEndS !== null &&
    parsed.data.timeframeEndS <= parsed.data.timeframeStartS
  ) {
    return NextResponse.json({ error: "timeframeEndS must be greater than timeframeStartS" }, { status: 400 });
  }
  const hasConfigUpdate =
    parsed.data.clipStyle !== undefined ||
    parsed.data.genre !== undefined ||
    parsed.data.clipCount !== undefined ||
    parsed.data.clipLengthMaxS !== undefined ||
    parsed.data.autoHook !== undefined ||
    parsed.data.includeMomentText !== undefined ||
    parsed.data.timeframeStartS !== undefined ||
    parsed.data.timeframeEndS !== undefined ||
    parsed.data.presetId !== undefined ||
    parsed.data.templateId !== undefined;
  if (!parsed.data.status && !hasConfigUpdate) return NextResponse.json({ ok: true });

  if (
    parsed.data.status === "READY_TO_PROCESS" &&
    ["PROCESSING", "DONE"].includes(job.status)
  ) {
    return NextResponse.json({ ok: true, skipped: `already ${job.status}` });
  }

  const updatePayload = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.status
      ? {
          processing_stage: parsed.data.status === "UPLOADED" ? "UPLOADED" : parsed.data.status === "READY_TO_PROCESS" ? "QUEUED" : null,
          processing_progress: parsed.data.status === "UPLOADED" ? 0 : parsed.data.status === "READY_TO_PROCESS" ? 1 : 0,
          processing_note:
            parsed.data.status === "UPLOADED"
              ? "Upload complete. Ready to generate clips."
              : parsed.data.status === "READY_TO_PROCESS"
                ? "Queued for processing."
                : null
        }
      : {}),
    ...(parsed.data.clipStyle !== undefined ? { clip_style: parsed.data.clipStyle } : {}),
    ...(parsed.data.genre !== undefined ? { genre: parsed.data.genre } : {}),
    ...(parsed.data.clipCount !== undefined ? { desired_clip_count: parsed.data.clipCount } : {}),
    ...(parsed.data.clipLengthMaxS !== undefined ? { clip_length_max_s: parsed.data.clipLengthMaxS } : {}),
    ...(parsed.data.autoHook !== undefined ? { auto_hook: parsed.data.autoHook } : {}),
    ...(parsed.data.includeMomentText !== undefined ? { include_moment_text: parsed.data.includeMomentText } : {}),
    ...(parsed.data.timeframeStartS !== undefined ? { timeframe_start_s: parsed.data.timeframeStartS } : {}),
    ...(parsed.data.timeframeEndS !== undefined ? { timeframe_end_s: parsed.data.timeframeEndS } : {}),
    ...(parsed.data.presetId !== undefined ? { preset_id: parsed.data.presetId } : {}),
    ...(parsed.data.templateId !== undefined ? { template_id: parsed.data.templateId } : {}),
    updated_at: new Date().toISOString()
  };

  let { error } = await supabaseAdmin
    .from("jobs")
    .update(updatePayload)
    .eq("id", params.jobId)
    .eq("user_id", user.id);

  if (error?.message?.includes("processing_stage") || error?.message?.includes("desired_clip_count")) {
    const fallback = await supabaseAdmin
      .from("jobs")
      .update({
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.clipStyle !== undefined ? { clip_style: parsed.data.clipStyle } : {}),
        ...(parsed.data.genre !== undefined ? { genre: parsed.data.genre } : {}),
        ...(parsed.data.clipLengthMaxS !== undefined ? { clip_length_max_s: parsed.data.clipLengthMaxS } : {}),
        ...(parsed.data.autoHook !== undefined ? { auto_hook: parsed.data.autoHook } : {}),
        ...(parsed.data.includeMomentText !== undefined ? { include_moment_text: parsed.data.includeMomentText } : {}),
        ...(parsed.data.timeframeStartS !== undefined ? { timeframe_start_s: parsed.data.timeframeStartS } : {}),
        ...(parsed.data.timeframeEndS !== undefined ? { timeframe_end_s: parsed.data.timeframeEndS } : {}),
        ...(parsed.data.presetId !== undefined ? { preset_id: parsed.data.presetId } : {}),
        ...(parsed.data.templateId !== undefined ? { template_id: parsed.data.templateId } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", params.jobId)
      .eq("user_id", user.id);
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJobForUser(params.jobId, user.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "PROCESSING") {
    return NextResponse.json({ error: "Job em processamento. Aguarde finalizar para excluir." }, { status: 409 });
  }

  const { data: exportsRows, error: exportsError } = await supabaseAdmin
    .from("job_exports")
    .select("clip_path,provider_metadata")
    .eq("job_id", params.jobId)
    .eq("user_id", user.id);
  if (exportsError) return NextResponse.json({ error: exportsError.message }, { status: 500 });

  const exportPaths = new Set<string>();
  for (const row of exportsRows || []) {
    if (typeof row.clip_path === "string" && row.clip_path.trim()) exportPaths.add(row.clip_path);
    const metadata = (row.provider_metadata || {}) as Record<string, unknown>;
    const srtPath = metadata.subtitles_path;
    const assPath = metadata.subtitles_ass_path;
    if (typeof srtPath === "string" && srtPath.trim()) exportPaths.add(srtPath);
    if (typeof assPath === "string" && assPath.trim()) exportPaths.add(assPath);
  }

  if (job.source_path) {
    if (isLocalSourcePath(job.source_path)) {
      const localPath = toLocalFilePath(job.source_path);
      if (localPath) {
        await fs.rm(localPath, { force: true }).catch(() => undefined);
      }
    } else {
      await supabaseAdmin.storage.from("uploads").remove([job.source_path]).catch(() => undefined);
    }
  }
  if (exportPaths.size) {
    await supabaseAdmin.storage.from("exports").remove(Array.from(exportPaths)).catch(() => undefined);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("jobs")
    .delete()
    .eq("id", params.jobId)
    .eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
