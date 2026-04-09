import { useRef, useState, useLayoutEffect, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface FilterTabsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterTabsProps<T>) {
  const { i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [ready, setReady] = useState(false);

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeButton = containerRef.current.querySelector('[data-active="true"]') as HTMLElement;
    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        opacity: 1,
      });
    }
  }, []);

  useLayoutEffect(() => {
    updateIndicator();
    if (!ready) {
      requestAnimationFrame(() => setReady(true));
    }
  }, [value, updateIndicator, ready]);

  // Update indicator when language/direction changes
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 50);
    return () => clearTimeout(timer);
  }, [i18n.language, updateIndicator]);

  return (
    <div ref={containerRef} className={cn('flex gap-1 flex-nowrap relative overflow-x-auto scrollbar-none', className)}>
      {/* Sliding indicator */}
      <div
        className={cn(
          'absolute top-0 bottom-0 bg-foreground rounded pointer-events-none',
          ready && 'transition-all duration-200'
        )}
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          opacity: indicatorStyle.opacity,
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            data-active={isActive || undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-sm rounded whitespace-nowrap relative z-10 transition-colors',
              isActive
                ? 'text-background'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
