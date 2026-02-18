import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function DELETE(request: NextRequest, { params }: { params: { templateId: string } }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("user_templates")
    .delete()
    .eq("id", params.templateId)
    .eq("user_id", user.id);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("public.user_templates") && (message.includes("schema cache") || message.includes("does not exist"))) {
      return NextResponse.json(
        { error: "Tabela user_templates ausente. Rode as migrations do Supabase e tente novamente." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
