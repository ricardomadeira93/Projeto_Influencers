import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  aiStartS: z.number().min(0),
  aiEndS: z.number().min(0),
  finalStartS: z.number().min(0),
  finalEndS: z.number().min(0),
  nudgeCountStart: z.number().int().min(0).default(0),
  nudgeCountEnd: z.number().int().min(0).default(0),
  setAtPlayheadCount: z.number().int().min(0).default(0),
  resetCount: z.number().int().min(0).default(0),
  sessionDurationMs: z.number().int().min(0).nullable().optional()
});

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string; clipId: string } }
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const payload = parsed.data;
  if (payload.aiEndS <= payload.aiStartS) {
    return NextResponse.json({ error: "Invalid AI baseline range" }, { status: 400 });
  }
  if (payload.finalEndS <= payload.finalStartS) {
    return NextResponse.json({ error: "Invalid final range" }, { status: 400 });
  }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from("job_exports")
    .select("id")
    .eq("job_id", params.jobId)
    .eq("user_id", user.id)
    .eq("clip_id", params.clipId)
    .maybeSingle();
  if (clipError || !clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const deltaStart = round3(payload.finalStartS - payload.aiStartS);
  const deltaEnd = round3(payload.finalEndS - payload.aiEndS);
  const deltaDuration = round3(
    (payload.finalEndS - payload.finalStartS) - (payload.aiEndS - payload.aiStartS)
  );

  const { error: insertError } = await supabaseAdmin.from("clip_adjustments").insert({
    user_id: user.id,
    job_id: params.jobId,
    clip_id: clip.id,
    ai_start_s: round3(payload.aiStartS),
    ai_end_s: round3(payload.aiEndS),
    final_start_s: round3(payload.finalStartS),
    final_end_s: round3(payload.finalEndS),
    delta_start_s: deltaStart,
    delta_end_s: deltaEnd,
    delta_duration_s: deltaDuration,
    nudge_count_start: payload.nudgeCountStart,
    nudge_count_end: payload.nudgeCountEnd,
    set_at_playhead_count: payload.setAtPlayheadCount,
    reset_count: payload.resetCount,
    session_duration_ms: payload.sessionDurationMs ?? null
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
