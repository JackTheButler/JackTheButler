import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, indeterminate, onCheckedChange, onClick: _onClick, ...props }, ref) => {
    const onClick = _onClick as unknown as React.MouseEventHandler<HTMLLabelElement> | undefined;
    const innerRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => innerRef.current!);

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = !!indeterminate;
      }
    }, [indeterminate]);

    return (
      <label className="inline-flex items-center cursor-pointer" onClick={onClick}>
        <input
          type="checkbox"
          className="sr-only peer"
          ref={innerRef}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        <div
          className={cn(
            'w-4 h-4 border rounded flex items-center justify-center',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
            'transition-colors',
            checked || indeterminate
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-input bg-background',
            className
          )}
        >
          {checked && <Check className="w-3 h-3" />}
          {!checked && indeterminate && <Minus className="w-3 h-3" />}
        </div>
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
