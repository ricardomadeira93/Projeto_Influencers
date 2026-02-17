import { NextRequest } from "next/server";
import { supabaseAnon } from "@/lib/supabase";

export async function getUserFromRequest(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
