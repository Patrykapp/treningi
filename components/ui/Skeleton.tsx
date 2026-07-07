export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

/** Placeholder karty ~kształtu typowego stat/list card, do użycia w stanach ładowania. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm space-y-3 ${className}`}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** Linijka tekstu placeholder, do list/tabel. */
export function SkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return <Skeleton className={className} />;
}
