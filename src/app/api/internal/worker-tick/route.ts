import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runWorkerTick } from "@/worker/tick";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== env.INTERNAL_CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runWorkerTick();
  return NextResponse.json(result);
}
