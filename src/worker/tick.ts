import fs from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";
import { ClipSuggestion, CropConfig } from "@/lib/types";
import { runFfmpeg } from "@/worker/ffmpeg";
import { consumeMinutes } from "@/lib/usage";

const CLIP_SCHEMA = {
  name: "clip_suggestions",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      segments: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            clip_id: { type: "string" },
            start: { type: "number" },
            end: { type: "number" },
            title: { type: "string" },
            hook: { type: "string" },
            reason: { type: "string" }
          },
          required: ["clip_id", "start", "end", "title", "hook", "reason"]
        }
      }
    },
    required: ["segments"]
  },
  strict: true
} as const;

function captionStyle(preset: CropConfig["captionPreset"]) {
  if (preset === "CLEAN") return "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,Outline=1,Shadow=0";
  return "FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,Outline=2,Shadow=1";
}

function hashtagsForNiche(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("javascript") || lower.includes("typescript") || lower.includes("react")) {
    return ["#coding", "#webdev", "#javascript", "#tutorial", "#learnprogramming"];
  }
  if (lower.includes("math") || lower.includes("physics") || lower.includes("science")) {
    return ["#education", "#science", "#learning", "#study", "#shorts"];
  }
  return ["#tutorial", "#learn", "#creator", "#shorts", "#education"];
}

function buildDescription(hook: string, reason: string) {
  return `${hook}\n\nWhy this clip works: ${reason}`;
}

function clampSegment(seg: ClipSuggestion, duration: number, idx: number): ClipSuggestion {
  const start = Math.max(0, Math.min(seg.start, duration - 1));
  const end = Math.max(start + 5, Math.min(seg.end, duration));
  return {
    ...seg,
    clip_id: seg.clip_id || `clip_${idx + 1}`,
    start,
    end
  };
}

async function writeSrt(
  outPath: string,
  fullSegments: Array<{ start: number; end: number; text: string }>,
  clipStart: number,
  clipEnd: number
) {
  const rows = fullSegments
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s, i) => {
      const start = Math.max(0, s.start - clipStart);
      const end = Math.max(start + 0.3, Math.min(clipEnd - clipStart, s.end - clipStart));
      return `${i + 1}\n${toSrtTs(start)} --> ${toSrtTs(end)}\n${(s.text || "").trim()}\n`;
    });

  await fs.writeFile(outPath, rows.join("\n"), "utf8");
}

function toSrtTs(sec: number) {
  const ms = Math.floor((sec % 1) * 1000);
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function escapeForFilterPath(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function getErrorMessage(err: unknown) {
  if (err && typeof err === "object") {
    const anyErr = err as any;
    const message = anyErr.message || "Unknown error";
    const code = anyErr.code || anyErr.cause?.code;
    const status = anyErr.status || anyErr.cause?.status;
    const causeMessage = anyErr.cause?.message;
    const details = [code ? `code=${code}` : "", status ? `status=${status}` : "", causeMessage || ""]
      .filter(Boolean)
      .join(", ");
    return details ? `${message} (${details})` : message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts) {
        console.warn(`[worker] ${label} failed (attempt ${i}/${attempts}): ${getErrorMessage(err)}`);
        const isTranscription = label.toLowerCase().includes("transcription");
        const baseDelay = isTranscription ? 2000 : 400;
        const jitter = Math.floor(Math.random() * 300);
        await wait(baseDelay * i + jitter);
      }
    }
  }
  throw new Error(`${label}: ${getErrorMessage(lastError)}`);
}

const TRANSCRIBE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_TRANSCRIBE_AUDIO_MB = 20;
const DEFAULT_TRANSCRIBE_CHUNK_SECONDS = 45;

function readPositiveEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getErrorCode(err: any) {
  return String(err?.code || err?.cause?.code || "").toUpperCase();
}

function getErrorStatus(err: any) {
  return Number(err?.status || err?.cause?.status || err?.response?.status || 0);
}

function isTransientTranscriptionError(err: any) {
  const code = getErrorCode(err);
  const status = getErrorStatus(err);
  if (["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)) return true;
  if (status === 429 || status >= 500) return true;
  return false;
}

async function transcribeWithRetry(filePath: string, label: string) {
  const stats = await fs.stat(filePath);
  const sizeMb = stats.size / (1024 * 1024);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const backoffMs =
      attempt === 1 ? 0 : attempt === 2 ? randomInt(15_000, 30_000) : randomInt(45_000, 90_000);
    if (backoffMs > 0) {
      console.warn(
        `[worker] ${label} attempt ${attempt}/3 waiting ${(backoffMs / 1000).toFixed(1)}s before retry`
      );
      await wait(backoffMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    const started = Date.now();
    try {
      console.log(
        `[worker] ${label} attempt ${attempt}/3 size=${sizeMb.toFixed(2)}MB timeout=${Math.floor(TRANSCRIBE_TIMEOUT_MS / 1000)}s`
      );
      const result = await openai.audio.transcriptions.create(
        {
          model: "whisper-1",
          file: createReadStream(filePath),
          response_format: "verbose_json"
        },
        { signal: controller.signal }
      );
      clearTimeout(timer);
      console.log(`[worker] ${label} succeeded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return result;
    } catch (err: any) {
      clearTimeout(timer);
      const code = getErrorCode(err);
      const status = getErrorStatus(err);
      const detail = getErrorMessage(err);
      const transient = isTransientTranscriptionError(err);
      if (!transient || attempt === 3) {
        throw new Error(
          `${label} failed size=${sizeMb.toFixed(2)}MB code=${code || "UNKNOWN"} status=${status || "n/a"} error=${detail}`
        );
      }
      console.warn(
        `[worker] ${label} failed (attempt ${attempt}/3): code=${code || "UNKNOWN"} status=${status || "n/a"} ${detail}`
      );
    }
  }

  throw new Error(`${label} failed unexpectedly`);
}

function isMissingTelemetryColumn(error: any) {
  const message = error?.message || "";
  return (
    message.includes("processing_stage") ||
    message.includes("processing_progress") ||
    message.includes("processing_note")
  );
}

async function updateJobTelemetry(jobId: string, stage: string, progress: number, note?: string) {
  const nowIso = new Date().toISOString();
  const withTelemetry = {
    processing_stage: stage,
    processing_progress: progress,
    processing_note: note || null,
    updated_at: nowIso
  };
  const { error } = await supabaseAdmin.from("jobs").update(withTelemetry).eq("id", jobId);
  if (error && isMissingTelemetryColumn(error)) {
    await supabaseAdmin.from("jobs").update({ updated_at: nowIso }).eq("id", jobId);
  } else if (error) {
    throw new Error(error.message);
  }
}

async function updateJobFailed(jobId: string, message: string) {
  const nowIso = new Date().toISOString();
  const withTelemetry = {
    status: "FAILED",
    error_message: message,
    processing_stage: "FAILED",
    processing_progress: 0,
    processing_note: message,
    updated_at: nowIso
  };
  const { error } = await supabaseAdmin.from("jobs").update(withTelemetry).eq("id", jobId);
  if (error && isMissingTelemetryColumn(error)) {
    await supabaseAdmin
      .from("jobs")
      .update({ status: "FAILED", error_message: message, updated_at: nowIso })
      .eq("id", jobId);
  } else if (error) {
    throw new Error(error.message);
  }
}

async function transcribeAudio(audioPath: string, tmpDir: string, jobId: string) {
  const chunkSec = Math.max(
    10,
    Math.round(readPositiveEnvNumber("TRANSCRIBE_CHUNK_SECONDS", DEFAULT_TRANSCRIBE_CHUNK_SECONDS))
  );
  const maxTranscribeAudioMb = readPositiveEnvNumber("MAX_TRANSCRIBE_AUDIO_MB", DEFAULT_MAX_TRANSCRIBE_AUDIO_MB);
  const st = statSync(audioPath);
  const audioSizeMb = st.size / 1024 / 1024;

  const runChunkedTranscription = async (reason: string) => {
    await updateJobTelemetry(jobId, "TRANSCRIBING", 35, "Retrying transcription in smaller chunks");
    console.warn(`[worker] switching to chunked transcription: ${reason}`);
    const chunkPattern = path.join(tmpDir, "audio_chunk_%03d.mp3");
    await withRetries("split audio for chunked transcription", () =>
      runFfmpeg([
        "-y",
        "-i",
        audioPath,
        "-f",
        "segment",
        "-segment_time",
        String(chunkSec),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "16k",
        chunkPattern
      ])
    );

    const chunkFiles = (await fs.readdir(tmpDir))
      .filter((name) => name.startsWith("audio_chunk_") && name.endsWith(".mp3"))
      .sort();
    if (!chunkFiles.length) throw new Error("Chunked transcription failed: no audio chunks generated");
    const st1 = statSync(path.join(tmpDir, chunkFiles[0]));
    console.log(`[worker] chunk1 sizeMB=${(st1.size / 1024 / 1024).toFixed(2)} path=${path.join(tmpDir, chunkFiles[0])}`);

    const mergedSegments: Array<{ start: number; end: number; text: string }> = [];
    let mergedText = "";
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkPath = path.join(tmpDir, chunkFiles[i]);
      await updateJobTelemetry(
        jobId,
        "TRANSCRIBING",
        Math.min(48, 35 + Math.round(((i + 1) / chunkFiles.length) * 13)),
        `Transcribing chunk ${i + 1}/${chunkFiles.length}`
      );
      const partial = await transcribeWithRetry(chunkPath, `transcription chunk ${i + 1}`);

      const offset = i * chunkSec;
      const partialText = (partial as any).text || "";
      const partialSegments = (((partial as any).segments || []) as Array<{ start: number; end: number; text: string }>)
        .map((s) => ({ start: s.start + offset, end: s.end + offset, text: s.text || "" }));
      mergedText += `${partialText}\n`;
      mergedSegments.push(...partialSegments);
    }

    return { text: mergedText.trim(), segments: mergedSegments };
  };

  console.log(`[worker] audio=${path.basename(audioPath)} sizeMB=${audioSizeMb.toFixed(2)}`);

  if (audioSizeMb > maxTranscribeAudioMb) {
    return runChunkedTranscription(
      `audio size ${audioSizeMb.toFixed(2)}MB exceeds MAX_TRANSCRIBE_AUDIO_MB=${maxTranscribeAudioMb}`
    );
  }

  try {
    return await transcribeWithRetry(audioPath, "transcription");
  } catch (error) {
    const msg = getErrorMessage(error);
    const fallbackEligible =
      msg.includes("ECONNRESET") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("EAI_AGAIN") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("timeout") ||
      msg.includes("status=429") ||
      msg.includes("status=5");
    if (!fallbackEligible) throw error;

    return runChunkedTranscription(msg);
  }
}

async function processJob(job: any) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitshorts-"));
  const srcPath = path.join(tmpDir, "source.mp4");
  const audioPath = path.join(tmpDir, "audio.mp3");

  try {
    await updateJobTelemetry(job.id, "DOWNLOADING_SOURCE", 5, "Downloading uploaded source video");
    const signedSource = await withRetries("sign source URL", async () => {
      const { data, error } = await supabaseAdmin.storage.from("uploads").createSignedUrl(job.source_path, 1800);
      if (error) throw new Error(error.message);
      return data;
    });
    if (!signedSource?.signedUrl) throw new Error("Missing source signed URL");

    const sourceRes = await withRetries("download source", () => fetch(signedSource.signedUrl));
    if (!sourceRes.ok) throw new Error("Could not download source");
    await fs.writeFile(srcPath, Buffer.from(await sourceRes.arrayBuffer()));

    await updateJobTelemetry(job.id, "EXTRACTING_AUDIO", 15, "Extracting audio for transcription");
    await withRetries("extract audio", () =>
      runFfmpeg([
        "-y",
        "-i",
        srcPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "16k",
        audioPath
      ])
    );

    await updateJobTelemetry(job.id, "TRANSCRIBING", 30, "Transcribing audio");
    const transcription = await transcribeAudio(audioPath, tmpDir, job.id);

    const transcriptText = (transcription as any).text || "";
    const segments = ((transcription as any).segments || []) as Array<{ start: number; end: number; text: string }>;

    await updateJobTelemetry(job.id, "SELECTING_CLIPS", 50, "Selecting best clip segments");
    const suggestionsRaw = await withRetries("clip suggestion", () =>
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: CLIP_SCHEMA },
        messages: [
          {
            role: "system",
            content:
              "You suggest the most shareable 20-60s shorts from tutorial transcripts. Return strict JSON matching schema."
          },
          {
            role: "user",
            content: `Video duration: ${job.source_duration_sec}s\nTranscript:\n${transcriptText.slice(0, 14000)}`
          }
        ]
      })
    );

    const content = suggestionsRaw.choices[0]?.message?.content || "{" + '"segments":[]' + "}";
    const parsed = JSON.parse(content) as { segments: ClipSuggestion[] };
    const clipped = (parsed.segments || []).slice(0, 5).map((s, i) => clampSegment(s, job.source_duration_sec, i));

    const crop = (job.crop_config || {
      x: 0.72,
      y: 0.7,
      width: 0.26,
      height: 0.26,
      layout: "TOP_WEBCAM_BOTTOM_SCREEN",
      captionPreset: "BOLD"
    }) as CropConfig;

    for (const segment of clipped) {
      const idx = clipped.findIndex((s) => s.clip_id === segment.clip_id);
      const clipNum = idx + 1;
      const renderProgress = Math.min(90, 60 + Math.round((clipNum / Math.max(1, clipped.length)) * 20));
      await updateJobTelemetry(job.id, "RENDERING_EXPORTS", renderProgress, `Rendering clip ${clipNum}/${clipped.length}`);
      const dur = Math.max(1, segment.end - segment.start);
      const srtPath = path.join(tmpDir, `${segment.clip_id}.srt`);
      const outPath = path.join(tmpDir, `${segment.clip_id}.mp4`);

      await writeSrt(srtPath, segments, segment.start, segment.end);

      const filter = `[0:v]crop=iw*${crop.width}:ih*${crop.height}:iw*${crop.x}:ih*${crop.y},scale=1080:960[top];` +
        `[0:v]scale=1080:960[bottom];` +
        `[top][bottom]vstack=inputs=2,subtitles='${escapeForFilterPath(srtPath)}':force_style='${captionStyle(crop.captionPreset)}'[v]`;

      await withRetries(`render clip ${segment.clip_id}`, () =>
        runFfmpeg([
          "-y",
          "-ss",
          String(segment.start),
          "-t",
          String(dur),
          "-i",
          srcPath,
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          outPath
        ])
      );

      const clipPath = `${job.user_id}/${job.id}/${segment.clip_id}.mp4`;
      const bytes = await fs.readFile(outPath);
      await withRetries(`upload clip ${segment.clip_id}`, async () => {
        await updateJobTelemetry(
          job.id,
          "UPLOADING_EXPORTS",
          Math.min(95, renderProgress + 3),
          `Uploading clip ${clipNum}/${clipped.length}`
        );
        const { error } = await supabaseAdmin.storage.from("exports").upload(clipPath, bytes, {
          contentType: "video/mp4",
          upsert: true
        });
        if (error) throw new Error(error.message);
      });

      const urlData = await withRetries(`sign clip URL ${segment.clip_id}`, async () => {
        const { data, error } = await supabaseAdmin.storage.from("exports").createSignedUrl(clipPath, 72 * 3600);
        if (error) throw new Error(error.message);
        return data;
      });

      const hashtags = hashtagsForNiche(segment.title + " " + transcriptText.slice(0, 300));
      await withRetries(`insert export metadata ${segment.clip_id}`, async () => {
        const { error } = await supabaseAdmin.from("job_exports").insert({
          job_id: job.id,
          user_id: job.user_id,
          clip_id: segment.clip_id,
          clip_path: clipPath,
          clip_url: urlData?.signedUrl || "",
          title: segment.title,
          description: buildDescription(segment.hook, segment.reason),
          hashtags,
          hook: segment.hook,
          reason: segment.reason,
          provider_metadata: {
            youtube: { title: segment.title, description: buildDescription(segment.hook, segment.reason) },
            tiktok: { caption: `${segment.title} ${hashtags.join(" ")}` },
            instagram: { caption: `${segment.hook}\n${hashtags.join(" ")}` },
            x: { text: `${segment.title} ${hashtags.slice(0, 3).join(" ")}` }
          },
          expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
        });
        if (error) throw new Error(error.message);
      });
    }

    await updateJobTelemetry(job.id, "FINALIZING", 98, "Saving metadata and finishing");
    await withRetries("mark job done", async () => {
      const { error } = await supabaseAdmin
        .from("jobs")
        .update({
          status: "DONE",
          suggestions: clipped,
          processing_stage: "DONE",
          processing_progress: 100,
          processing_note: "Clip generation complete",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      if (error && isMissingTelemetryColumn(error)) {
        const fallback = await supabaseAdmin
          .from("jobs")
          .update({ status: "DONE", suggestions: clipped, updated_at: new Date().toISOString() })
          .eq("id", job.id);
        if (fallback.error) throw new Error(fallback.error.message);
        return;
      }
      if (error) throw new Error(error.message);
    });

    await consumeMinutes(job.user_id, Math.ceil(job.source_duration_sec / 60), job.id);

    return { ok: true, clips: clipped.length };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function runWorkerTick() {
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("jobs")
    .update({
      status: "FAILED",
      error_message: "Marked failed automatically: processing timeout exceeded 45 minutes.",
      processing_stage: "FAILED",
      processing_note: "Processing timeout exceeded.",
      finished_at: now,
      updated_at: now
    })
    .eq("status", "PROCESSING")
    .lt("processing_started_at", staleCutoff);

  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("status", "READY_TO_PROCESS")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { processed: 0, error: error.message };
  if (!jobs?.length) {
    const { data: queued } = await supabaseAdmin
      .from("jobs")
      .select("status")
      .in("status", ["PENDING", "UPLOADED", "READY_TO_PROCESS", "PROCESSING"])
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(100);
    const byStatus = (queued || []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    return { processed: 0, queue: byStatus };
  }

  const job = jobs[0];

  let claimed: any = null;
  {
    const claimWithTelemetry = await supabaseAdmin
      .from("jobs")
      .update({
        status: "PROCESSING",
        processing_started_at: now,
        processing_stage: "QUEUED",
        processing_progress: 1,
        processing_note: "Waiting for worker steps to start",
        updated_at: now
      })
      .eq("id", job.id)
      .eq("status", "READY_TO_PROCESS")
      .select("id")
      .maybeSingle();

    if (claimWithTelemetry.error && isMissingTelemetryColumn(claimWithTelemetry.error)) {
      const fallbackClaim = await supabaseAdmin
        .from("jobs")
        .update({
          status: "PROCESSING",
          processing_started_at: now,
          updated_at: now
        })
        .eq("id", job.id)
        .eq("status", "READY_TO_PROCESS")
        .select("id")
        .maybeSingle();
      claimed = fallbackClaim.data;
    } else {
      claimed = claimWithTelemetry.data;
    }
  }

  if (!claimed) return { processed: 0, skipped: "already claimed" };

  try {
    const result = await processJob(job);
    return { processed: 1, jobId: job.id, ...result };
  } catch (err: any) {
    const message = getErrorMessage(err);
    console.error(`[worker] job ${job.id} failed:`, err);
    await updateJobFailed(job.id, message);

    return { processed: 1, jobId: job.id, error: message };
  }
}
