import { useSlidingIndicator } from '@/lib/useSlidingIndicator';
import { cn } from './cn';

/** Single-select filter row with a sliding active indicator. Controlled. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const { containerRef, itemsRef, rect, transition } = useSlidingIndicator(options.indexOf(value));

  return (
    <div className={cn('no-scrollbar overflow-x-auto', className)}>
      <div
        ref={(el) => {
          containerRef.current = el;
        }}
        role="group"
        aria-label={ariaLabel}
        className="relative inline-flex gap-1"
      >
        {rect && (
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 rounded-lg bg-accent-soft',
              transition && 'transition-[left,width] duration-200 ease-out',
            )}
            style={{ left: rect.left, width: rect.width }}
          />
        )}
        {options.map((option, i) => {
          const active = option === value;
          return (
            <button
              key={option}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={cn(
                'relative z-10 shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                active ? 'text-accent' : 'text-muted hover:text-ink',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
