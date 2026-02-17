import { spawn } from "node:child_process";

export function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}`));
    });
    child.on("error", reject);
  });
}
