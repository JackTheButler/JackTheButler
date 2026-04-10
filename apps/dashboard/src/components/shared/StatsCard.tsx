import { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { AppIcon } from '@/components/apps/AppIcon';

const variants = {
  success: 'text-muted-foreground bg-muted',
  warning: 'text-muted-foreground bg-muted',
  error: 'text-muted-foreground bg-muted',
  default: 'text-muted-foreground bg-muted',
};

const dotColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  error: 'bg-red-500',
  default: 'bg-muted-foreground',
};

const progressColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  error: 'bg-red-500',
  default: 'bg-primary',
};

export interface StatItemProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: keyof typeof variants;
  subtitle?: string;
  /** When provided (0–1), renders a small progress bar below the row */
  progress?: number;
  /** Optional action shown as a hint line below the progress bar */
  action?: { hint: string; label: string; onClick: () => void };
  /** When provided, renders app icons + overflow count instead of a plain number */
  appIds?: string[];
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
  const { t } = useTranslation();

  const hasError = items.some((i) => i.variant === 'error');
  const hasWarning = items.some((i) => i.variant === 'warning');
  const overallHealth: keyof typeof dotColors = hasError ? 'error' : hasWarning ? 'warning' : 'success';

  const statusText = {
    success: t('home.systemStatus.operational'),
    warning: t('home.systemStatus.warning'),
    error: t('home.systemStatus.error'),
  }[overallHealth];

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <p className="text-xs font-semibold tracking-wide text-foreground">{t('home.systemStatus.title')}</p>
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[overallHealth])} />
          <span className="text-[11px] text-muted-foreground">{statusText}</span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col divide-y pt-1 pb-2">
        {items.map((item, index) => (
          <div key={index} className="flex flex-col px-4 py-2.5 gap-1.5">
            <div className="flex items-center gap-3">
              <div className={cn('p-1.5 rounded-md flex-shrink-0', variants[item.variant ?? 'default'])}>
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs text-muted-foreground flex-1">{item.label}</p>
              {item.appIds && item.appIds.length > 0 ? (
                <div className="flex items-center gap-1">
                  {item.appIds.slice(0, 2).map((id) => (
                    <AppIcon key={id} id={id} size="sm" />
                  ))}
                  {item.appIds.length > 2 && (
                    <span className="text-xs font-semibold text-muted-foreground">+{item.appIds.length - 2}</span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold">{item.value}</p>
              )}
            </div>
            {item.progress !== undefined && (
              <div className="ml-8 h-1.5 rounded-full bg-border/50 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', progressColors[item.variant ?? 'default'])}
                  style={{ width: `${Math.min(item.progress * 100, 100)}%` }}
                />
              </div>
            )}
            {item.action && (
              <p className="ml-8 text-[11px] text-muted-foreground">
                {item.action.hint}{' '}
                <button
                  onClick={item.action.onClick}
                  className="text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  {item.action.label}
                </button>
              </p>
            )}
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
