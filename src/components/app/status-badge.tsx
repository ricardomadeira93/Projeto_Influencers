import { StatusChip } from "@/components/app/status-chip";

export function JobStatusBadge({ status }: { status: string }) {
  return <StatusChip status={status} />;
}
