import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { runFfmpeg } from "@/worker/ffmpeg";

export const runtime = "nodejs";

const schema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0)
});

const EXPORT_TTL_SECONDS = 72 * 3600;
const MIN_CLIP_SECONDS = 0.3;

const OUTPUT_DIMENSIONS = {
  INSTAGRAM_REELS: { width: 1080, height: 1920 },
  YOUTUBE_SHORTS: { width: 1080, height: 1920 },
  TIKTOK: { width: 1080, height: 1920 },
  INSTAGRAM_FEED: { width: 1080, height: 1350 }
} as const;

type OutputPreset = keyof typeof OUTPUT_DIMENSIONS;

function parseOutputPreset(input: unknown): OutputPreset {
  if (input && typeof input === "object") {
    const value = (input as Record<string, unknown>).outputPreset;
    if (typeof value === "string" && value in OUTPUT_DIMENSIONS) return value as OutputPreset;
  }
  return "INSTAGRAM_REELS";
}

function readNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string; clipId: string } }
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id,user_id,source_path,source_duration_sec,crop_config")
    .eq("id", params.jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (jobError || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: clip, error: clipError } = await supabaseAdmin
    .from("job_exports")
    .select("id,clip_id,clip_path,provider_metadata")
    .eq("job_id", params.jobId)
    .eq("user_id", user.id)
    .eq("clip_id", params.clipId)
    .maybeSingle();
  if (clipError || !clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const sourceDuration = Math.max(MIN_CLIP_SECONDS, Number(job.source_duration_sec || 0));
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return NextResponse.json({ error: "Invalid source duration" }, { status: 400 });
  }

  const safeStart = clamp(parsed.data.startSec, 0, Math.max(0, sourceDuration - MIN_CLIP_SECONDS));
  const safeEnd = clamp(parsed.data.endSec, safeStart + MIN_CLIP_SECONDS, sourceDuration);
  if (safeEnd - safeStart < MIN_CLIP_SECONDS) {
    return NextResponse.json({ error: "Clip window is too short" }, { status: 400 });
  }

  const sourcePath = String(job.source_path || `${user.id}/${params.jobId}.mp4`);
  const clipPath = String(clip.clip_path || `${user.id}/${params.jobId}/${params.clipId}.mp4`);
  const outputPreset = parseOutputPreset(job.crop_config);
  const targetSize = OUTPUT_DIMENSIONS[outputPreset];
  const tmpDir = path.join("/tmp", `clip-adjust-${params.jobId}-${params.clipId}-${randomUUID()}`);
  const sourceLocalPath = path.join(tmpDir, "source.mp4");
  const outputLocalPath = path.join(tmpDir, `${params.clipId}.mp4`);

  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const sourceDownload = await supabaseAdmin.storage.from("uploads").download(sourcePath);
    if (sourceDownload.error || !sourceDownload.data) {
      throw new Error(sourceDownload.error?.message || "Could not download source");
    }
    await fs.writeFile(sourceLocalPath, Buffer.from(await sourceDownload.data.arrayBuffer()));

    const filter =
      `[0:v]setpts=PTS-STARTPTS,scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=increase,crop=${targetSize.width}:${targetSize.height},boxblur=18:2[bg];` +
      `[0:v]setpts=PTS-STARTPTS,scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease[fg];` +
      "[bg][fg]overlay=(W-w)/2:(H-h)/2[vout]";

    await runFfmpeg([
      "-y",
      "-ss",
      String(safeStart),
      "-t",
      String(Math.max(MIN_CLIP_SECONDS, safeEnd - safeStart)),
      "-i",
      sourceLocalPath,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outputLocalPath
    ]);

    const clipBytes = await fs.readFile(outputLocalPath);
    const upload = await supabaseAdmin.storage.from("exports").upload(clipPath, clipBytes, {
      contentType: "video/mp4",
      upsert: true
    });
    if (upload.error) throw new Error(upload.error.message);

    const signed = await supabaseAdmin.storage.from("exports").createSignedUrl(clipPath, EXPORT_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(signed.error?.message || "Could not sign adjusted clip");
    }

    const previousMetadata =
      clip.provider_metadata && typeof clip.provider_metadata === "object"
        ? (clip.provider_metadata as Record<string, unknown>)
        : {};
    const aiStartSec = readNumber(previousMetadata.ai_start_sec, readNumber(previousMetadata.start_sec, safeStart));
    const aiEndSec = readNumber(previousMetadata.ai_end_sec, readNumber(previousMetadata.end_sec, safeEnd));
    const updatedMetadata = {
      ...previousMetadata,
      ai_start_sec: aiStartSec,
      ai_end_sec: aiEndSec,
      start_sec: safeStart,
      end_sec: safeEnd,
      manual_adjusted: true,
      manual_adjusted_at: new Date().toISOString(),
      adjusted_from_start_sec: readNumber(previousMetadata.start_sec, safeStart),
      adjusted_from_end_sec: readNumber(previousMetadata.end_sec, safeEnd)
    };

    const { error: updateError } = await supabaseAdmin
      .from("job_exports")
      .update({
        clip_url: signed.data.signedUrl,
        provider_metadata: updatedMetadata
      })
      .eq("id", clip.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      clip: {
        clip_id: params.clipId,
        clip_url: signed.data.signedUrl,
        provider_metadata: updatedMetadata
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not adjust clip";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
