import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getJobForUser } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["UPLOADED", "FAILED"]).optional()
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

  if (!parsed.data.status) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin
    .from("jobs")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", params.jobId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
