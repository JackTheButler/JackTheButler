import { forwardRef } from 'react';
import { cn } from './cn';

/** Standalone bordered text input (search, forms). The chat composer is a
 *  bespoke composite and intentionally does not use this. */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/40',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
