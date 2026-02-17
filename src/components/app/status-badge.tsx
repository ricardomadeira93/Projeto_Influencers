import { Badge } from "@/components/ui/badge";
import { statusToBadgeVariant } from "@/components/app/status-utils";

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={statusToBadgeVariant(status)}>{status.replaceAll("_", " ")}</Badge>;
}
