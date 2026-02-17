import { supabaseAdmin } from "@/lib/supabase";
import { CropConfig } from "@/lib/types";

export async function createJob(input: {
  jobId?: string;
  userId: string;
  sourcePath: string;
  originalName: string;
  durationSec: number;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const defaultCrop: CropConfig = {
    x: 0.72,
    y: 0.7,
    width: 0.26,
    height: 0.26,
    layout: "TOP_WEBCAM_BOTTOM_SCREEN",
    captionPreset: "BOLD"
  };

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .insert({
      ...(input.jobId ? { id: input.jobId } : {}),
      user_id: input.userId,
      status: "PENDING",
      source_path: input.sourcePath,
      source_filename: input.originalName,
      source_duration_sec: input.durationSec,
      crop_config: defaultCrop,
      expires_at: expiresAt
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function getJobForUser(jobId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}
