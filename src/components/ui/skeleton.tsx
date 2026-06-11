import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg bg-muted/50 motion-safe:skeleton-shimmer motion-reduce:animate-pulse',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
