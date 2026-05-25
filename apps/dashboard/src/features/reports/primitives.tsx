import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/components/ui';
import type { Kpi } from './mock';

/** Card wrapper for a single report: titled, bordered panel. */
export function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-panel p-4 md:p-5', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Headline KPI tile with a coloured delta chip (green when the change is in the
 *  desired direction, red otherwise). */
export function StatTile({ label, value, delta, goodWhenUp, hint }: Omit<Kpi, 'id'>) {
  const good = delta >= 0 === goodWhenUp;
  const Arrow = delta >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
            good ? 'bg-emerald-500/12 text-emerald-600' : 'bg-rose-500/12 text-rose-600',
          )}
        >
          <Arrow size={11} strokeWidth={2.5} />
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}
