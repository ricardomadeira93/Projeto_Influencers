import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getJobForUser } from "@/lib/db";
import { dispatchProcessJob } from "@/lib/github/dispatch";

const patchSchema = z.object({
  status: z.enum(["UPLOADED", "READY_TO_PROCESS", "FAILED"]).optional()
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

  if (
    parsed.data.status === "READY_TO_PROCESS" &&
    ["READY_TO_PROCESS", "PROCESSING", "DONE"].includes(job.status)
  ) {
    return NextResponse.json({ ok: true, skipped: `already ${job.status}` });
  }

  const { error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: parsed.data.status,
      dispatch_requested_at: parsed.data.status === "READY_TO_PROCESS" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.jobId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.status === "READY_TO_PROCESS") {
    try {
      await dispatchProcessJob(params.jobId);
    } catch (dispatchError: any) {
      await supabaseAdmin
        .from("jobs")
        .update({
          status: "FAILED",
          error_message: `Dispatch failed: ${dispatchError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", params.jobId)
        .eq("user_id", user.id);

      return NextResponse.json({ error: dispatchError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
