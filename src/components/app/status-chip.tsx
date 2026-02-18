import { Badge } from "@/components/ui/badge";
import { statusToBadgeVariant } from "@/components/app/status-utils";
import { cn } from "@/lib/utils";

type StatusChipProps = {
  status: string;
  className?: string;
};

function normalizeLabel(value: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    UPLOADED: "Enviado",
    READY_TO_PROCESS: "Pronto para processar",
    PROCESSING: "Processando",
    DONE: "Concluído",
    FAILED: "Falhou"
  };
  return labels[value] || value.replaceAll("_", " ");
}

export function StatusChip({ status, className }: StatusChipProps) {
  const isProcessing = status.toUpperCase() === "PROCESSING";
  return (
    <Badge
      variant={statusToBadgeVariant(status)}
      className={cn(isProcessing ? "motion-safe:animate-pulse" : "", className)}
    >
      {normalizeLabel(status)}
    </Badge>
  );
}
