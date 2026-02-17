import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { isWorkerAuthorized } from "@/lib/internal-worker-auth";

const schema = z.object({ jobId: z.string().uuid() });

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
    .select("id,user_id,status,crop_config,source_path,source_duration_sec,source_filename")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.user_id) {
    return NextResponse.json({ error: "Job has no user" }, { status: 400 });
  }

  if (!["READY_TO_PROCESS", "UPLOADED"].includes(job.status)) {
    return NextResponse.json({ error: `Invalid job status ${job.status}` }, { status: 409 });
  }

  const { data: otherProcessing } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .eq("user_id", job.user_id)
    .eq("status", "PROCESSING")
    .neq("id", job.id)
    .limit(1)
    .maybeSingle();

  if (otherProcessing) {
    return NextResponse.json({ error: "Another job is already PROCESSING for this user" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  const { data: claimed } = await supabaseAdmin
    .from("jobs")
    .update({
      status: "PROCESSING",
      processing_started_at: nowIso,
      updated_at: nowIso,
      error_message: null
    })
    .eq("id", job.id)
    .in("status", ["READY_TO_PROCESS", "UPLOADED"])
    .select("id,user_id,status,crop_config,source_path,source_duration_sec,source_filename")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ error: "Job could not be claimed" }, { status: 409 });
  }

  const expectedPath = `${claimed.user_id}/${claimed.id}.mp4`;
  const sourcePath = claimed.source_path || expectedPath;
  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from("uploads")
    .createSignedUrl(sourcePath, 600);

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Could not create signed URL" }, { status: 500 });
  }

  return NextResponse.json({
    job: {
      id: claimed.id,
      userId: claimed.user_id,
      status: claimed.status,
      webcamCrop: claimed.crop_config,
      captionStyle: claimed.crop_config?.captionPreset || "BOLD"
    },
    source: {
      signedUrl: signedData.signedUrl,
      path: sourcePath,
      durationSec: claimed.source_duration_sec,
      width: null,
      height: null,
      filename: claimed.source_filename
    },
    limits: {
      maxSegments: 5,
      minSegSec: 10,
      maxSegSec: 60
    }
  });
}
