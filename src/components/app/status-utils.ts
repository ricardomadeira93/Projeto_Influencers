export function statusToBadgeVariant(status: string):
  | "secondary"
  | "warning"
  | "success"
  | "destructive"
  | "outline" {
  const key = status.toUpperCase();
  if (["PENDING", "UPLOADED", "READY_TO_PROCESS"].includes(key)) return "warning";
  if (key === "PROCESSING") return "secondary";
  if (key === "DONE") return "success";
  if (["FAILED", "EXPIRED"].includes(key)) return "destructive";
  return "outline";
}
