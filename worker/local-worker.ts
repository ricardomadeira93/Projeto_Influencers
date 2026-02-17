import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  claimJob,
  failJob,
  finalizeJob,
  findNextReadyJob,
  recoverStaleProcessingJobs
} from "./local-db";
import { processClaimedJob } from "./local-processing";

dns.setDefaultResultOrder("ipv4first");

function loadEnvFile(filename: string) {
  const fullPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;

  const content = fs.readFileSync(fullPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^"|"$/g, "");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable ${name}`);
  return value;
}

function parsePositiveInt(name: string, fallback: number) {
  const parsed = Number(process.env[name] || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function getPollIntervalMs() {
  const raw = parsePositiveInt("WORKER_POLL_INTERVAL_MS", 3000);
  return Math.min(5000, Math.max(2000, raw));
}

function getStaleTimeoutMinutes() {
  return Math.max(10, parsePositiveInt("WORKER_STALE_TIMEOUT_MINUTES", 45));
}

function createSupabaseAdminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

type TickResult =
  | { processed: 0; skipped: string }
  | { processed: 0; queue: string }
  | { processed: 1; jobId: string; ok: true; clips: number }
  | { processed: 1; jobId: string; ok: false; error: string };

export async function runLocalWorkerTick(supabase: SupabaseClient): Promise<TickResult> {
  const staleMinutes = getStaleTimeoutMinutes();
  await recoverStaleProcessingJobs(staleMinutes);

  const nextJob = await findNextReadyJob();
  if (!nextJob) return { processed: 0, queue: "no READY_TO_PROCESS jobs" };

  const claimed = await claimJob(nextJob.id);
  if (!claimed) return { processed: 0, skipped: "job already claimed by another worker" };

  const startedAt = Date.now();
  console.log(`[worker] claimed job ${claimed.id} (user=${claimed.userId})`);

  try {
    const outcome = await processClaimedJob(supabase, claimed);
    await finalizeJob(claimed.id, outcome.exportsRows, outcome.suggestions, outcome.transcriptText);
    const tookSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[worker] DONE job ${claimed.id} in ${tookSeconds}s with ${outcome.exportsRows.length} clips`);
    return { processed: 1, jobId: claimed.id, ok: true, clips: outcome.exportsRows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(claimed.id, message);
    console.error(`[worker] FAILED job ${claimed.id}: ${message}`);
    return { processed: 1, jobId: claimed.id, ok: false, error: message };
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const once = process.argv.includes("--once");
  const pollIntervalMs = getPollIntervalMs();

  console.log(
    `[worker] local worker started poll=${pollIntervalMs}ms transcribe=${process.env.TRANSCRIBE_PROVIDER || "stub"} segment=${process.env.SEGMENT_PROVIDER || "ollama"}`
  );

  do {
    const tickStarted = Date.now();
    const result = await runLocalWorkerTick(supabase);
    console.log(`[worker] tick result ${JSON.stringify(result)}`);
    if (once) break;

    const elapsed = Date.now() - tickStarted;
    const waitMs = Math.max(0, pollIntervalMs - elapsed);
    await sleep(waitMs);
  } while (true);
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
