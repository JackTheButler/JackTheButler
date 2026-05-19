import { Search } from 'lucide-react';
import { Input } from './Input';
import { cn } from './cn';

/** Text input with a leading search icon. `className` sizes the wrapper. */
export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input className="pl-9" {...props} />
    </div>
  );
}
