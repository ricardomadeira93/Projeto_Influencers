import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { isWorkerAuthorized } from "@/lib/internal-worker-auth";

const schema = z.object({
  jobId: z.string().uuid(),
  errorMessage: z.string().min(1).max(4000)
});

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: "FAILED",
      error_message: parsed.data.errorMessage,
      finished_at: nowIso,
      expires_at: expiresAt,
      updated_at: nowIso
    })
    .eq("id", parsed.data.jobId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
