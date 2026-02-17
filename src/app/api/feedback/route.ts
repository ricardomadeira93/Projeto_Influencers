import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text = (body?.text ?? "").toString().slice(0, 4000);
  if (!text.trim()) return NextResponse.json({ error: "Empty" }, { status: 400 });

  const { error } = await supabaseAdmin.from("feedback").insert({ text });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
