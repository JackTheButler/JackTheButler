import { useLayoutEffect, useRef, useState } from 'react';
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = refs.current[options.indexOf(value)];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    // Enable the slide only after the first position is set (no mount flash).
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [value, options]);

  return (
    <div className={cn('no-scrollbar overflow-x-auto', className)}>
      <div role="group" aria-label={ariaLabel} className="relative inline-flex gap-1">
        {indicator && (
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 rounded-lg bg-accent-soft',
              animate && 'transition-[left,width] duration-200 ease-out',
            )}
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
        {options.map((option, i) => {
          const active = option === value;
          return (
            <button
              key={option}
              ref={(el) => {
                refs.current[i] = el;
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
