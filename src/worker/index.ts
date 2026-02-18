import { runWorkerTick } from "@/worker/tick";

const once = process.argv.includes("--once");

async function loop() {
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
