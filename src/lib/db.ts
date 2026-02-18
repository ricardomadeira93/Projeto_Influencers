import { supabaseAdmin } from "@/lib/supabase";
import { CropConfig, DEFAULT_GENERATION_CONFIG } from "@/lib/types";

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
    captionPreset: "BOLD",
    captionLanguage: "source",
    outputPreset: "INSTAGRAM_REELS"
  };

  let { data, error } = await supabaseAdmin
    .from("jobs")
    .insert({
      ...(input.jobId ? { id: input.jobId } : {}),
      user_id: input.userId,
      status: "PENDING",
      source_path: input.sourcePath,
      source_filename: input.originalName,
      source_duration_sec: input.durationSec,
      crop_config: defaultCrop,
      clip_style: DEFAULT_GENERATION_CONFIG.clipStyle,
      genre: DEFAULT_GENERATION_CONFIG.genre,
      desired_clip_count: DEFAULT_GENERATION_CONFIG.clipCount,
      clip_length_max_s: DEFAULT_GENERATION_CONFIG.clipLengthMaxS,
      auto_hook: DEFAULT_GENERATION_CONFIG.autoHook,
      include_moment_text: DEFAULT_GENERATION_CONFIG.includeMomentText,
      timeframe_start_s: DEFAULT_GENERATION_CONFIG.timeframeStartS,
      timeframe_end_s: DEFAULT_GENERATION_CONFIG.timeframeEndS,
      preset_id: DEFAULT_GENERATION_CONFIG.presetId,
      template_id: DEFAULT_GENERATION_CONFIG.templateId,
      expires_at: expiresAt
    })
    .select("id")
    .single();

  if (error?.message?.includes("desired_clip_count")) {
    const fallback = await supabaseAdmin
      .from("jobs")
      .insert({
        ...(input.jobId ? { id: input.jobId } : {}),
        user_id: input.userId,
        status: "PENDING",
        source_path: input.sourcePath,
        source_filename: input.originalName,
        source_duration_sec: input.durationSec,
        crop_config: defaultCrop,
        clip_style: DEFAULT_GENERATION_CONFIG.clipStyle,
        genre: DEFAULT_GENERATION_CONFIG.genre,
        clip_length_max_s: DEFAULT_GENERATION_CONFIG.clipLengthMaxS,
        auto_hook: DEFAULT_GENERATION_CONFIG.autoHook,
        include_moment_text: DEFAULT_GENERATION_CONFIG.includeMomentText,
        timeframe_start_s: DEFAULT_GENERATION_CONFIG.timeframeStartS,
        timeframe_end_s: DEFAULT_GENERATION_CONFIG.timeframeEndS,
        preset_id: DEFAULT_GENERATION_CONFIG.presetId,
        template_id: DEFAULT_GENERATION_CONFIG.templateId,
        expires_at: expiresAt
      })
      .select("id")
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data?.id) throw error || new Error("Could not create job");
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
