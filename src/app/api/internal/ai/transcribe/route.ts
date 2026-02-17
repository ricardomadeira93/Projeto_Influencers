import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWorkerAuthorized } from "@/lib/internal-worker-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { openai } from "@/lib/openai";

const schema = z.object({
  jobId: z.string().uuid(),
  audioPath: z.string().min(1),
  language: z.string().min(2).max(12).optional(),
  offsetSec: z.number().min(0).optional(),
  persistTranscript: z.boolean().optional()
});

function isMissingTranscriptColumn(error: any) {
  const message = error?.message || "";
  return message.includes("transcript");
}

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id,user_id,status,source_duration_sec")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "PROCESSING") {
    return NextResponse.json({ error: `Job is ${job.status}, expected PROCESSING` }, { status: 409 });
  }
  if (!job.user_id) {
    return NextResponse.json({ error: "Job has no user_id" }, { status: 400 });
  }

  const audioPath = parsed.data.audioPath.replace(/^\/+/, "");
  const { data: signed, error: signError } = await supabaseAdmin.storage.from("audio").createSignedUrl(audioPath, 600);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Could not sign audio URL" }, { status: 500 });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitshorts-ai-transcribe-"));
  const ext = path.extname(audioPath) || ".mp3";
  const localAudioPath = path.join(tmpDir, `audio${ext}`);

  try {
    const audioRes = await fetch(signed.signedUrl);
    if (!audioRes.ok) {
      return NextResponse.json({ error: `Could not download audio (${audioRes.status})` }, { status: 502 });
    }
    await fs.writeFile(localAudioPath, Buffer.from(await audioRes.arrayBuffer()));

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(localAudioPath),
      response_format: "verbose_json",
      ...(parsed.data.language ? { language: parsed.data.language } : {})
    });

    const offsetSec = Number(parsed.data.offsetSec || 0);
    const text = String((transcription as any).text || "");
    const rawSegments = ((transcription as any).segments || []) as Array<{ start: number; end: number; text: string }>;
    const segments = rawSegments
      .map((segment) => {
        const start = Number(segment.start || 0) + offsetSec;
        const end = Number(segment.end || segment.start || 0) + offsetSec;
        return {
          start: Number.isFinite(start) ? start : offsetSec,
          end: Number.isFinite(end) ? Math.max(start, end) : offsetSec,
          text: String(segment.text || "").trim()
        };
      })
      .filter((segment) => segment.end > segment.start);
    const durationSec = Number((transcription as any).duration || job.source_duration_sec || 0);

    if (parsed.data.persistTranscript !== false) {
      let { error: updateErr } = await supabaseAdmin
        .from("jobs")
        .update({
          transcript: text,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      if (updateErr && isMissingTranscriptColumn(updateErr)) {
        const fallback = await supabaseAdmin
          .from("jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", job.id);
        updateErr = fallback.error;
      }
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ text, segments, durationSec });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Transcription failed" }, { status: 500 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
