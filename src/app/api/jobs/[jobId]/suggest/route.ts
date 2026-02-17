import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("jobs")
    .select("id,status,suggestions")
    .eq("id", params.jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobErr || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: exportsData } = await supabaseAdmin
    .from("job_exports")
    .select("clip_id,clip_url,title,description,hashtags,hook,reason,provider_metadata")
    .eq("job_id", params.jobId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ job, exports: exportsData || [] });
}
