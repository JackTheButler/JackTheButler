import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Animated skeleton placeholder for loading states.
 *
 * @example
 * // Text line
 * <Skeleton className="h-4 w-32" />
 *
 * // Avatar
 * <Skeleton className="h-10 w-10 rounded-full" />
 *
 * // Card
 * <Skeleton className="h-24 w-full" />
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-muted',
        className
      )}
    />
  );
}
