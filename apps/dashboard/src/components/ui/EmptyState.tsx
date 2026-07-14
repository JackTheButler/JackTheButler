import { cn } from './cn';

/** Centered muted message for empty lists/results. */
export function EmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('px-4 py-12 text-center text-sm text-muted', className)}>{children}</p>
  );
}
