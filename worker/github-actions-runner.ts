import fs from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import dns from "node:dns";
import { createClient } from "@supabase/supabase-js";

dns.setDefaultResultOrder("ipv4first");

type StartResponse = {
  job: {
    id: string;
    userId: string;
    status: string;
    webcamCrop?: {
      x: number;
      y: number;
      width: number;
      height: number;
      captionPreset?: "BOLD" | "CLEAN";
    };
    captionStyle?: "BOLD" | "CLEAN";
  };
  source: {
    signedUrl: string;
    path: string;
    durationSec?: number;
    width?: number | null;
    height?: number | null;
  };
  limits: {
    maxSegments: number;
    minSegSec: number;
    maxSegSec: number;
  };
};

type Segment = {
  start_sec: number;
  end_sec: number;
  title: string;
  hook: string;
  reason: string;
};

type TranscriptSegment = { start: number; end: number; text: string };

type TranscribeResponse = {
  text: string;
  segments?: TranscriptSegment[];
  durationSec?: number;
};

type SegmentsResponse = {
  segments: Segment[];
};

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function log(step: string, detail: string) {
  console.log(`[worker:${step}] ${detail}`);
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} failed with ${code}`))));
    p.on("error", reject);
  });
}

function runCapture(cmd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `${cmd} failed with ${code}`))));
    p.on("error", reject);
  });
}

function toSrtTs(sec: number) {
  const ms = Math.floor((sec % 1) * 1000);
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function sanitizeSegments(segments: Segment[], duration: number, limits: StartResponse["limits"]) {
  return segments
    .slice(0, limits.maxSegments)
    .map((seg, i) => {
      let start = Math.max(0, Math.min(seg.start_sec, Math.max(0, duration - limits.minSegSec)));
      let end = Math.max(start + limits.minSegSec, Math.min(seg.end_sec, duration));

      const len = end - start;
      if (len > limits.maxSegSec) end = start + limits.maxSegSec;
      if (end - start < limits.minSegSec) end = Math.min(duration, start + limits.minSegSec);

      return {
        ...seg,
        start_sec: start,
        end_sec: end,
        title: seg.title || `Clip ${i + 1}`,
        hook: seg.hook || "Quick tutorial highlight",
        reason: seg.reason || "Strong educational moment"
      };
    })
    .filter((s) => s.end_sec > s.start_sec + 1);
}

function escapeFilterPath(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function cropToPixels(
  crop: StartResponse["job"]["webcamCrop"] | undefined,
  width: number,
  height: number
) {
  const fallback = {
    x: Math.floor(width * 0.72),
    y: Math.floor(height * 0.7),
    width: Math.floor(width * 0.26),
    height: Math.floor(height * 0.26)
  };
  if (!crop) return fallback;

  const toPx = (value: number, size: number) => (value <= 1 ? Math.floor(value * size) : Math.floor(value));

  const x = Math.max(0, Math.min(toPx(crop.x, width), width - 2));
  const y = Math.max(0, Math.min(toPx(crop.y, height), height - 2));
  const w = Math.max(2, Math.min(toPx(crop.width, width), width - x));
  const h = Math.max(2, Math.min(toPx(crop.height, height), height - y));

  return { x, y, width: w, height: h };
}

async function postInternal(pathname: string, payload: Record<string, unknown>, secret: string, base: string) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${pathname} failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const JOB_ID = requiredEnv("JOB_ID");
  const INTERNAL_API_BASE_URL = requiredEnv("INTERNAL_API_BASE_URL");
  const WORKER_SECRET = requiredEnv("WORKER_SECRET");
  const SUPABASE_URL = requiredEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitshorts-gh-"));
  const sourcePath = path.join(tmpDir, "source.mp4");
  const audioPath = path.join(tmpDir, "audio.mp3");
  const outDir = path.join(tmpDir, "out");
  await fs.mkdir(outDir, { recursive: true });

  const failSafe = async (message: string) => {
    try {
      await postInternal(
        "/api/internal/worker/fail",
        { jobId: JOB_ID, errorMessage: message.slice(0, 4000) },
        WORKER_SECRET,
        INTERNAL_API_BASE_URL
      );
    } catch (err) {
      console.error("Could not call fail endpoint", err);
    }
  };

  try {
    log("start", `claiming job ${JOB_ID}`);
    const startData = (await postInternal(
      "/api/internal/worker/start",
      { jobId: JOB_ID },
      WORKER_SECRET,
      INTERNAL_API_BASE_URL
    )) as StartResponse;

    log("download", "downloading source video");
    const srcRes = await fetch(startData.source.signedUrl);
    if (!srcRes.ok) throw new Error(`Download failed (${srcRes.status})`);
    await fs.writeFile(sourcePath, Buffer.from(await srcRes.arrayBuffer()));

    log("probe", "reading source metadata");
    const probeRaw = await runCapture("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      sourcePath
    ]);
    const probe = JSON.parse(probeRaw);
    const width = Number(probe?.streams?.[0]?.width || startData.source.width || 1920);
    const height = Number(probe?.streams?.[0]?.height || startData.source.height || 1080);
    const duration = Number(probe?.format?.duration || startData.source.durationSec || 60);

    log("audio", "extracting audio track");
    await run("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "16k",
      audioPath
    ]);

    const audioStats = statSync(audioPath);
    log("audio", `audio=${path.basename(audioPath)} sizeMB=${(audioStats.size / 1024 / 1024).toFixed(2)}`);

    const audioStoragePath = `${startData.job.userId}/${startData.job.id}.mp3`;
    log("audio", `uploading ${audioStoragePath}`);
    const audioBuffer = await fs.readFile(audioPath);
    const audioUpload = await supabase.storage.from("audio").upload(audioStoragePath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true
    });
    if (audioUpload.error) throw audioUpload.error;

    log("transcribe", "requesting transcript from internal API");
    const transcript = (await postInternal(
      "/api/internal/ai/transcribe",
      { jobId: startData.job.id, audioPath: audioStoragePath },
      WORKER_SECRET,
      INTERNAL_API_BASE_URL
    )) as TranscribeResponse;

    const transcriptText = (transcript.text || "").trim();
    if (!transcriptText) throw new Error("Transcript is empty");
    const transcriptSegments = (transcript.segments || []) as TranscriptSegment[];

    log("segment", "requesting clip segments from internal API");
    const segmentsRes = (await postInternal(
      "/api/internal/ai/segments",
      { jobId: startData.job.id, transcriptText },
      WORKER_SECRET,
      INTERNAL_API_BASE_URL
    )) as SegmentsResponse;

    const segments = sanitizeSegments(segmentsRes.segments || [], duration, startData.limits);
    if (!segments.length) throw new Error("No valid segments generated");

    const crop = cropToPixels(startData.job.webcamCrop, width, height);
    const exportsPayload: Array<{
      clipId: string;
      mp4Path: string;
      srtPath: string;
      startSec: number;
      endSec: number;
      title: string;
      hook: string;
      reason: string;
    }> = [];

    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const clipId = `clip_${i + 1}`;
      const srtLocal = path.join(outDir, `${clipId}.srt`);
      const mp4Local = path.join(outDir, `${clipId}.mp4`);

      const srtRows = transcriptSegments
        .filter((s) => s.end > seg.start_sec && s.start < seg.end_sec)
        .map((s, idx) => {
          const start = Math.max(0, s.start - seg.start_sec);
          const end = Math.max(start + 0.2, Math.min(seg.end_sec - seg.start_sec, s.end - seg.start_sec));
          return `${idx + 1}\n${toSrtTs(start)} --> ${toSrtTs(end)}\n${(s.text || "").trim()}\n`;
        })
        .join("\n");

      await fs.writeFile(srtLocal, srtRows || `1\n00:00:00,000 --> 00:00:02,500\n${seg.hook}\n`, "utf8");

      const filter =
        `[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1080:672[top];` +
        `[0:v]scale=1080:1248[bottom];` +
        `[top][bottom]vstack=inputs=2[stack];` +
        `[stack]subtitles='${escapeFilterPath(srtLocal)}'[v]`;

      log("render", `rendering ${clipId}`);
      await run("ffmpeg", [
        "-y",
        "-ss",
        String(seg.start_sec),
        "-t",
        String(seg.end_sec - seg.start_sec),
        "-i",
        sourcePath,
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
        mp4Local
      ]);

      const mp4Path = `${startData.job.userId}/${startData.job.id}/${clipId}.mp4`;
      const srtPath = `${startData.job.userId}/${startData.job.id}/${clipId}.srt`;

      log("upload", `uploading ${clipId}`);
      const mp4Buffer = await fs.readFile(mp4Local);
      const srtBuffer = await fs.readFile(srtLocal);

      const mp4Upload = await supabase.storage.from("exports").upload(mp4Path, mp4Buffer, {
        contentType: "video/mp4",
        upsert: true
      });
      if (mp4Upload.error) throw mp4Upload.error;

      const srtUpload = await supabase.storage.from("exports").upload(srtPath, srtBuffer, {
        contentType: "application/x-subrip",
        upsert: true
      });
      if (srtUpload.error) throw srtUpload.error;

      exportsPayload.push({
        clipId,
        mp4Path,
        srtPath,
        startSec: seg.start_sec,
        endSec: seg.end_sec,
        title: seg.title,
        hook: seg.hook,
        reason: seg.reason
      });
    }

    log("finish", `sending ${exportsPayload.length} exports`);
    await postInternal(
      "/api/internal/worker/finish",
      {
        jobId: startData.job.id,
        measuredDurationSec: transcript.durationSec || duration,
        exports: exportsPayload
      },
      WORKER_SECRET,
      INTERNAL_API_BASE_URL
    );

    log("done", `job ${startData.job.id} completed`);
  } catch (err: any) {
    const message = err?.message || "Unknown worker error";
    console.error(err);
    await failSafe(message);
    process.exit(1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch(async (err: any) => {
  console.error(err);
  process.exit(1);
});

