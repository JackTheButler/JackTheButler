import { forwardRef } from 'react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/** Standalone bordered text input (search, forms). The chat composer is a
 *  bespoke composite and intentionally does not use this. */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...props} />
  ),
);
Input.displayName = 'Input';
