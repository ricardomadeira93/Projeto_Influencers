import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";

export async function ensureUserProfile(userId: string, email?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("users").insert({
      id: userId,
      email: email ?? "",
      plan_type: "FREE",
      minutes_remaining: env.FREE_MINUTES_TOTAL
    });
  }
}

export async function canConsumeMinutes(userId: string, minutes: number) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("minutes_remaining")
    .eq("id", userId)
    .single();

  if (error || !data) return { ok: false, remaining: 0 };
  return { ok: data.minutes_remaining >= minutes, remaining: data.minutes_remaining };
}

export async function consumeMinutes(userId: string, minutes: number, jobId: string) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("minutes_remaining")
    .eq("id", userId)
    .single();

  if (!data) return;

  const newValue = Math.max(0, data.minutes_remaining - minutes);
  await supabaseAdmin.from("users").update({ minutes_remaining: newValue }).eq("id", userId);
  await supabaseAdmin.from("usage_logs").insert({
    user_id: userId,
    job_id: jobId,
    minutes_used: minutes
  });
}
