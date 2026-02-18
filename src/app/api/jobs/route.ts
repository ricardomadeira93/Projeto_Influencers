import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isLocalSourcePath } from "@/lib/source-path";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, status, source_filename, source_path, created_at, updated_at, expires_at, crop_config, processing_stage, processing_progress, processing_note"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobsWithPreview = await Promise.all(
    (data || []).map(async (job) => {
      let preview_url = "";
      if (job.source_path && !isLocalSourcePath(job.source_path)) {
        const { data: signed } = await supabaseAdmin.storage.from("uploads").createSignedUrl(job.source_path, 600);
        preview_url = signed?.signedUrl || "";
      }
      return { ...job, preview_url };
    })
  );

  return NextResponse.json({ jobs: jobsWithPreview });
}
