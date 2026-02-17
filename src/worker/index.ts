import fs from "node:fs";
import path from "node:path";

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

const once = process.argv.includes("--once");

async function loop() {
  const { runWorkerTick } = await import("@/worker/tick");
  do {
    const result = await runWorkerTick();
    console.log(new Date().toISOString(), result);
    if (once) break;
    await new Promise((r) => setTimeout(r, 5000));
  } while (true);
}

loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
