import { NextRequest } from "next/server";

export function isWorkerAuthorized(request: NextRequest) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${secret}`;
}
