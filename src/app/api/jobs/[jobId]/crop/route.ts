import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  layout: z.literal("TOP_WEBCAM_BOTTOM_SCREEN"),
  captionPreset: z.enum(["BOLD", "CLEAN"])
});

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("jobs")
    .update({ crop_config: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.jobId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
