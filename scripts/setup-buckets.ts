import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureBucket(name: string, isPublic: boolean) {
  const fileSizeLimit = process.env.SUPABASE_BUCKET_FILE_SIZE_LIMIT || "500MB";
  const { data } = await supabase.storage.getBucket(name);
  if (!data) {
    const { error } = await supabase.storage.createBucket(name, {
      public: isPublic,
      fileSizeLimit
    });
    if (error) throw error;
    console.log(`created bucket ${name} (fileSizeLimit=${fileSizeLimit})`);
  } else {
    const { error } = await supabase.storage.updateBucket(name, {
      public: isPublic,
      fileSizeLimit
    });
    if (error) throw error;
    console.log(`bucket exists ${name} (updated fileSizeLimit=${fileSizeLimit})`);
  }
}

async function main() {
  await ensureBucket("uploads", false);
  await ensureBucket("audio", false);
  await ensureBucket("exports", false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
