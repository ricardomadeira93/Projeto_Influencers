import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { featureFlags } from "@/lib/feature-flags";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("publish_tokens")
    .select("provider, expires_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: queue } = await supabaseAdmin
    .from("publish_queue")
    .select("id, provider, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ enabled: featureFlags.directPublishV1_5, tokens: data || [], queue: queue || [] });
}

export async function POST() {
  return NextResponse.json({
    enabled: featureFlags.directPublishV1_5,
    message: "Direct publish is disabled in MVP. Use publish pack/manual upload.",
    futureProviders: ["youtube", "tiktok", "instagram", "x"]
  });
}
