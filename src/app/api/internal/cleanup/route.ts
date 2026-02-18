import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { isLocalSourcePath, toLocalFilePath } from "@/lib/source-path";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== env.INTERNAL_CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: expiredJobs } = await supabaseAdmin
    .from("jobs")
    .select("id, source_path")
    .lt("expires_at", now)
    .neq("status", "EXPIRED");

  for (const job of expiredJobs || []) {
    if (job.source_path) {
      if (isLocalSourcePath(job.source_path)) {
        const localPath = toLocalFilePath(job.source_path);
        if (localPath) await fs.rm(localPath, { force: true }).catch(() => undefined);
      } else {
        await supabaseAdmin.storage.from("uploads").remove([job.source_path]);
      }
    }
    await supabaseAdmin.from("jobs").update({ status: "EXPIRED" }).eq("id", job.id);
  }

  const { data: expiredExports } = await supabaseAdmin
    .from("job_exports")
    .select("id, clip_path")
    .lt("expires_at", now);

  if ((expiredExports || []).length) {
    const paths = (expiredExports || []).map((e) => e.clip_path).filter(Boolean) as string[];
    if (paths.length) await supabaseAdmin.storage.from("exports").remove(paths);

    const ids = (expiredExports || []).map((e) => e.id);
    if (ids.length) await supabaseAdmin.from("job_exports").delete().in("id", ids);
  }

  return NextResponse.json({
    expiredJobs: expiredJobs?.length ?? 0,
    expiredExports: expiredExports?.length ?? 0
  });
}
