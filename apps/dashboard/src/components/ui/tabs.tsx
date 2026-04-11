import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  tabs: Tab[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: TabsProps<T>) {
  return (
    <div className={cn('border-b overflow-x-auto scrollbar-hide', className)}>
      <nav className="flex gap-6 min-w-max">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id as T)}
              className={cn(
                'flex items-center gap-2 pb-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap',
                value === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
