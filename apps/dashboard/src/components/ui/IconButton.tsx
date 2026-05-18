import { forwardRef } from 'react';
import { cn } from './cn';

/** The recurring 36×36 ghost icon button (sidebar, headers, drawers). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
IconButton.displayName = 'IconButton';
