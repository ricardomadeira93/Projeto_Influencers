import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-10 w-full" />
      <Skeleton className="mt-2 h-10 w-full" />
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
