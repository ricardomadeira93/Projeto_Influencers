import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWorkerAuthorized } from "@/lib/internal-worker-auth";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  jobId: z.string().uuid(),
  transcriptText: z.string().min(1)
});

const SEGMENT_SCHEMA = {
  name: "segments",
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
            start_sec: { type: "number" },
            end_sec: { type: "number" },
            title: { type: "string" },
            hook: { type: "string" },
            reason: { type: "string" }
          },
          required: ["start_sec", "end_sec", "title", "hook", "reason"]
        }
      }
    },
    required: ["segments"]
  },
  strict: true
} as const;

type Segment = {
  start_sec: number;
  end_sec: number;
  title: string;
  hook: string;
  reason: string;
};

function sanitizeSegments(raw: Segment[], durationSec: number | null) {
  const duration = durationSec && durationSec > 0 ? durationSec : 3600;
  const minSec = 10;
  const maxSec = 60;
  return (raw || [])
    .slice(0, 5)
    .map((seg, idx) => {
      let start = Math.max(0, Number(seg.start_sec) || 0);
      let end = Math.max(start + minSec, Number(seg.end_sec) || start + minSec);
      if (start > duration - minSec) start = Math.max(0, duration - minSec);
      if (end > duration) end = duration;
      if (end - start > maxSec) end = start + maxSec;
      if (end - start < minSec) end = Math.min(duration, start + minSec);
      return {
        start_sec: start,
        end_sec: end,
        title: seg.title || `Clip ${idx + 1}`,
        hook: seg.hook || "Tutorial highlight",
        reason: seg.reason || "High-value educational moment"
      };
    })
    .filter((s) => s.end_sec > s.start_sec);
}

function isMissingRequestedClipsColumn(error: any) {
  const message = error?.message || "";
  return message.includes("requested_clips");
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
    .select("id,status,source_duration_sec")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "PROCESSING") {
    return NextResponse.json({ error: `Job is ${job.status}, expected PROCESSING` }, { status: 409 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: SEGMENT_SCHEMA },
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON with 3-5 short-form tutorial segments. Focus on clear hooks and practical value."
        },
        {
          role: "user",
          content: `Video duration: ${job.source_duration_sec || "unknown"} seconds\nTranscript:\n${parsed.data.transcriptText.slice(0, 14000)}`
        }
      ]
    });

    const parsedContent = JSON.parse(completion.choices[0]?.message?.content || '{"segments":[]}') as { segments: Segment[] };
    const segments = sanitizeSegments(parsedContent.segments || [], job.source_duration_sec || null);

    let { error: updateErr } = await supabaseAdmin
      .from("jobs")
      .update({
        requested_clips: segments,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    if (updateErr && isMissingRequestedClipsColumn(updateErr)) {
      const fallback = await supabaseAdmin
        .from("jobs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", job.id);
      updateErr = fallback.error;
    }
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ segments });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Segment generation failed" }, { status: 500 });
  }
}

