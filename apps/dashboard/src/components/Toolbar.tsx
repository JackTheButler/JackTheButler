import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/**
 * List toolbar with a fixed convention: filters on the left, search on the
 * right. Encoding the order here keeps Apps / Team / Knowledge consistent and
 * stops pages from drifting. On narrow screens the two slots stack (filters
 * first). The row reserves the height of a form field (`min-h-[2.375rem]`)
 * so it doesn't collapse/jump when a slot is empty. `className` is for outer
 * spacing (e.g. `mt-6`).
 */
export function Toolbar({
  filters,
  search,
  className,
}: {
  filters?: ReactNode;
  search?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[2.375rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">{filters}</div>
      {search ?? null}
    </div>
  );
}
