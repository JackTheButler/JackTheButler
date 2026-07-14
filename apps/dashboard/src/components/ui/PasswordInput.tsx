import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/** Password / secret field with a show/hide eye toggle — handy for
 *  verifying a pasted key. Drop-in replacement for `<Input type="password">`. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(fieldBase, 'pr-9', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Hide value' : 'Show value'}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
