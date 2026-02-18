import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export function EmptyState({ icon: Icon, title, description, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {ctaLabel && onCta ? (
        <Button className="mt-4" onClick={onCta}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
