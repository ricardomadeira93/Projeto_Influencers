import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureBucket(name: string, isPublic: boolean) {
  const { data } = await supabase.storage.getBucket(name);
  if (!data) {
    const { error } = await supabase.storage.createBucket(name, {
      public: isPublic,
      fileSizeLimit: "2GB"
    });
    if (error) throw error;
    console.log(`created bucket ${name}`);
  } else {
    console.log(`bucket exists ${name}`);
  }
}

async function main() {
  await ensureBucket("uploads", false);
  await ensureBucket("exports", false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
