import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createJob } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureUserProfile, canConsumeMinutes } from "@/lib/usage";

const LOCAL_UPLOAD_ROOT = process.env.LOCAL_UPLOAD_ROOT || "/tmp/macet_uploads";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const AUDIO_BITRATE = 96_000;

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function compressNear50Mb(inputPath: string, durationSec: number) {
  const baseBitrate = Math.max(
    240_000,
    Math.floor(((MAX_UPLOAD_BYTES * 8) / Math.max(1, durationSec)) * 0.985) - AUDIO_BITRATE
  );
  let bitrate = baseBitrate;
  let bestPath = "";
  let bestSize = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const outputPath = path.join(os.tmpdir(), `macet-compress-${randomUUID()}.mp4`);
    const kbps = Math.max(240, Math.floor(bitrate / 1000));
    const args = [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      `${kbps}k`,
      "-maxrate",
      `${kbps}k`,
      "-bufsize",
      `${Math.floor(kbps * 2)}k`,
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outputPath
    ];
    await runFfmpeg(args);
    const size = (await fs.stat(outputPath)).size;
    const distance = Math.abs(MAX_UPLOAD_BYTES - size);

    if (size <= MAX_UPLOAD_BYTES && distance < bestDistance) {
      if (bestPath) await fs.rm(bestPath, { force: true }).catch(() => undefined);
      bestPath = outputPath;
      bestSize = size;
      bestDistance = distance;
    } else if (size < bestSize) {
      if (bestPath) await fs.rm(bestPath, { force: true }).catch(() => undefined);
      bestPath = outputPath;
      bestSize = size;
      bestDistance = distance;
    } else {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }

    if (size <= MAX_UPLOAD_BYTES && size >= MAX_UPLOAD_BYTES * 0.94) {
      break;
    }

    if (size > MAX_UPLOAD_BYTES) {
      bitrate = Math.max(220_000, Math.floor(bitrate * (MAX_UPLOAD_BYTES / size) * 0.985));
    } else {
      bitrate = Math.min(baseBitrate * 1.12, Math.floor(bitrate * 1.07));
    }
  }

  if (!bestPath) {
    throw new Error("Não foi possível comprimir o vídeo para o limite de 50MB.");
  }

  return { path: bestPath, size: bestSize };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    const filename = String(form.get("filename") || "");
    const durationSec = Number(form.get("durationSec") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }
    if (!filename.trim()) {
      return NextResponse.json({ error: "Nome de arquivo inválido." }, { status: 400 });
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return NextResponse.json({ error: "Duração inválida." }, { status: 400 });
    }
    if (durationSec > env.MAX_UPLOAD_DURATION) {
      return NextResponse.json({ error: "Upload duration exceeds MAX_UPLOAD_DURATION" }, { status: 400 });
    }

    await ensureUserProfile(user.id, user.email);
    const minutesNeeded = Math.ceil(durationSec / 60);
    const usage = await canConsumeMinutes(user.id, minutesNeeded);
    if (!usage.ok) {
      return NextResponse.json(
        { error: `Insufficient minutes. Remaining ${usage.remaining} min.` },
        { status: 402 }
      );
    }

    const extension = path.extname(filename).toLowerCase() || ".mp4";
    const safeExt = extension.replace(/[^a-z0-9.]/g, "") || ".mp4";
    const jobId = randomUUID();
    const dir = path.join(LOCAL_UPLOAD_ROOT, user.id);
    await fs.mkdir(dir, { recursive: true });
    const localFilePath = path.join(dir, `${jobId}${safeExt}`);

    const bytes = Buffer.from(await file.arrayBuffer());
    const inputTempPath = path.join(os.tmpdir(), `macet-upload-${randomUUID()}${safeExt}`);
    await fs.writeFile(inputTempPath, bytes);
    let finalTempPath = inputTempPath;
    let finalBytes = bytes.length;
    let compressed = false;

    if (bytes.length > MAX_UPLOAD_BYTES) {
      const compressedFile = await compressNear50Mb(inputTempPath, durationSec);
      finalTempPath = compressedFile.path;
      finalBytes = compressedFile.size;
      compressed = true;
    }

    await fs.copyFile(finalTempPath, localFilePath);
    await fs.rm(inputTempPath, { force: true }).catch(() => undefined);
    if (finalTempPath !== inputTempPath) {
      await fs.rm(finalTempPath, { force: true }).catch(() => undefined);
    }

    await createJob({
      jobId,
      userId: user.id,
      sourcePath: `local://${localFilePath}`,
      originalName: filename,
      durationSec
    });

    return NextResponse.json({ jobId, local: true, compressed, finalSizeBytes: finalBytes });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Local upload failed" }, { status: 500 });
  }
}
