import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
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

async function processJob(job: any) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitshorts-"));
  const srcPath = path.join(tmpDir, "source.mp4");

  try {
    const { data: signedSource } = await supabaseAdmin.storage.from("uploads").createSignedUrl(job.source_path, 1800);
    if (!signedSource?.signedUrl) throw new Error("Missing source signed URL");

    const sourceRes = await fetch(signedSource.signedUrl);
    if (!sourceRes.ok) throw new Error("Could not download source");
    await fs.writeFile(srcPath, Buffer.from(await sourceRes.arrayBuffer()));

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(srcPath),
      response_format: "verbose_json"
    });

    const transcriptText = (transcription as any).text || "";
    const segments = ((transcription as any).segments || []) as Array<{ start: number; end: number; text: string }>;

    const suggestionsRaw = await openai.chat.completions.create({
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
    });

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
      const dur = Math.max(1, segment.end - segment.start);
      const srtPath = path.join(tmpDir, `${segment.clip_id}.srt`);
      const outPath = path.join(tmpDir, `${segment.clip_id}.mp4`);

      await writeSrt(srtPath, segments, segment.start, segment.end);

      const filter = `[0:v]crop=iw*${crop.width}:ih*${crop.height}:iw*${crop.x}:ih*${crop.y},scale=1080:960[top];` +
        `[0:v]scale=1080:960[bottom];` +
        `[top][bottom]vstack=inputs=2,subtitles='${escapeForFilterPath(srtPath)}':force_style='${captionStyle(crop.captionPreset)}'[v]`;

      await runFfmpeg([
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
      ]);

      const clipPath = `${job.user_id}/${job.id}/${segment.clip_id}.mp4`;
      const bytes = await fs.readFile(outPath);
      const { error: upErr } = await supabaseAdmin.storage.from("exports").upload(clipPath, bytes, {
        contentType: "video/mp4",
        upsert: true
      });
      if (upErr) throw upErr;

      const { data: urlData } = await supabaseAdmin.storage.from("exports").createSignedUrl(clipPath, 72 * 3600);
      const hashtags = hashtagsForNiche(segment.title + " " + transcriptText.slice(0, 300));

      await supabaseAdmin.from("job_exports").insert({
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
    }

    await supabaseAdmin
      .from("jobs")
      .update({ status: "DONE", suggestions: clipped, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    await consumeMinutes(job.user_id, Math.ceil(job.source_duration_sec / 60), job.id);

    return { ok: true, clips: clipped.length };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function runWorkerTick() {
  const now = new Date().toISOString();
  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("status", "UPLOADED")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { processed: 0, error: error.message };
  if (!jobs?.length) return { processed: 0 };

  const job = jobs[0];

  const { data: claimed } = await supabaseAdmin
    .from("jobs")
    .update({ status: "PROCESSING", updated_at: now })
    .eq("id", job.id)
    .eq("status", "UPLOADED")
    .select("id")
    .maybeSingle();

  if (!claimed) return { processed: 0, skipped: "already claimed" };

  try {
    const result = await processJob(job);
    return { processed: 1, jobId: job.id, ...result };
  } catch (err: any) {
    await supabaseAdmin
      .from("jobs")
      .update({ status: "FAILED", error_message: err.message, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    return { processed: 1, jobId: job.id, error: err.message };
  }
}
