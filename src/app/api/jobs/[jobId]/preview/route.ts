import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getJobForUser } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJobForUser(params.jobId, user.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sourcePath = job.source_path || `${user.id}/${job.id}.mp4`;
  const { data, error } = await supabaseAdmin.storage.from("uploads").createSignedUrl(sourcePath, 600);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Could not create preview URL" }, { status: 500 });
  }

  return NextResponse.json({ previewUrl: data.signedUrl });
}
