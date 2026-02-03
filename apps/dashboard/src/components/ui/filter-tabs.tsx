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
  return (
    <div className={cn('flex gap-1 flex-nowrap', className)}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-sm rounded whitespace-nowrap',
              value === option.value
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
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
