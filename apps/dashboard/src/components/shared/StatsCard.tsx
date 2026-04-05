import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

const variants = {
  success: 'text-muted-foreground bg-muted',
  warning: 'text-muted-foreground bg-muted',
  error: 'text-muted-foreground bg-muted',
  default: 'text-muted-foreground bg-muted',
};

interface StatItemProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: keyof typeof variants;
  subtitle?: string;
}

function StatItem({ label, value, icon: Icon, variant = 'default', subtitle }: StatItemProps) {
  return (
    <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-[180px]">
      <div className={cn('p-2 rounded-lg', variants[variant])}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-semibold">{value}{subtitle && <span className="text-xs font-normal text-muted-foreground ml-1">{subtitle}</span>}</p>
        <p className="text-xs text-muted-foreground whitespace-nowrap">{label}</p>
      </div>
    </div>
  );
}

interface StatsBarProps {
  items: StatItemProps[];
}

export function StatsBar({ items }: StatsBarProps) {
  return (
    <Card className="overflow-x-auto scrollbar-hide">
      <div className="flex divide-x min-w-full">
        {items.map((item, index) => (
          <StatItem key={index} {...item} />
        ))}
      </div>
    </Card>
  );
}

export function StatsColumn({ items }: StatsBarProps) {
  return (
    <Card>
      <div className="flex flex-col divide-y">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-2.5">
            <div className={cn('p-1.5 rounded-md', variants[item.variant ?? 'default'])}>
              <item.icon className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs text-muted-foreground flex-1">{item.label}</p>
            <p className="text-sm font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Keep old exports for backwards compatibility during migration
export { StatItem as StatsCard };

interface StatsGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}

export function StatsGrid({ children, columns = 4 }: StatsGridProps) {
  const colsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  };

  return <div className={cn('grid gap-4', colsClass[columns])}>{children}</div>;
}
