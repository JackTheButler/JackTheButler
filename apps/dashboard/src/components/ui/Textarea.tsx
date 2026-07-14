import { forwardRef } from 'react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/** Multiline text input, styled to match Input/Select. Defaults to no resize
 *  (most form layouts want a fixed height); pass `className` to override. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'resize-none', className)} {...props} />
));
Textarea.displayName = 'Textarea';
