import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const configSchema = z.object({
  clipStyle: z.enum(["Balanced", "Hooky", "Educational", "Story"]),
  genre: z.enum(["Tutorial", "Podcast", "Talking Head", "Interview", "Demo", "Other"]),
  clipCount: z.number().int().min(1).max(10).optional().default(4),
  clipLengthMaxS: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]),
  autoHook: z.boolean(),
  includeMomentText: z.string().max(300).optional().default(""),
  timeframeStartS: z.number().min(0).nullable().optional().default(null),
  timeframeEndS: z.number().min(0).nullable().optional().default(null),
  presetId: z.string().max(100).nullable().optional().default(null)
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  config: configSchema
});

function isMissingTemplatesTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("public.user_templates") &&
    (normalized.includes("schema cache") || normalized.includes("does not exist"))
  );
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_templates")
    .select("id,name,config,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTemplatesTableError(error.message)) {
      return NextResponse.json({
        templates: [],
        templatesDisabled: true,
        warning: "Tabela user_templates ausente. Rode as migrations do Supabase."
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("user_templates")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      config: parsed.data.config
    })
    .select("id,name,config,created_at")
    .single();
  if (error) {
    if (isMissingTemplatesTableError(error.message)) {
      return NextResponse.json(
        { error: "Tabela user_templates ausente. Rode as migrations do Supabase e tente novamente." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
