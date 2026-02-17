import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureUserProfile, canConsumeMinutes } from "@/lib/usage";
import { env } from "@/lib/env";
import { createJob } from "@/lib/db";

const schema = z.object({
  filename: z.string().min(1),
  durationSec: z.number().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.durationSec > env.MAX_UPLOAD_DURATION) {
      return NextResponse.json({ error: "Upload duration exceeds MAX_UPLOAD_DURATION" }, { status: 400 });
    }

    await ensureUserProfile(user.id, user.email);
    const minutesNeeded = Math.ceil(parsed.data.durationSec / 60);
    const usage = await canConsumeMinutes(user.id, minutesNeeded);
    if (!usage.ok) {
      return NextResponse.json(
        { error: `Insufficient minutes. Remaining ${usage.remaining} min.` },
        { status: 402 }
      );
    }

    const jobId = crypto.randomUUID();
    const key = `${user.id}/${jobId}.mp4`;

    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from("uploads")
      .createSignedUploadUrl(key);

    if (signedErr || !signedData) {
      return NextResponse.json({ error: signedErr?.message || "Could not sign upload" }, { status: 500 });
    }

    await createJob({
      jobId,
      userId: user.id,
      sourcePath: key,
      originalName: parsed.data.filename,
      durationSec: parsed.data.durationSec
    });

    return NextResponse.json({
      jobId,
      path: key,
      token: signedData.token,
      signedUrl: signedData.signedUrl.startsWith("http")
        ? signedData.signedUrl
        : new URL(signedData.signedUrl, env.SUPABASE_URL).toString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Upload sign failed" }, { status: 500 });
  }
}
