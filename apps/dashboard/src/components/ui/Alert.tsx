import type { ReactNode } from 'react';
import { Info, TriangleAlert, CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from './cn';

export type AlertVariant = 'info' | 'warning' | 'error' | 'success';

const VARIANTS: Record<AlertVariant, { box: string; icon: typeof Info }> = {
  info: { box: 'border-line bg-surface text-muted', icon: Info },
  warning: { box: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-700', icon: TriangleAlert },
  error: { box: 'border-red-500/30 bg-red-500/[0.05] text-red-600', icon: CircleAlert },
  success: {
    box: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-700',
    icon: CircleCheck,
  },
};

/** Minimal inline alert: a tinted bordered box with a leading icon. Keep copy
 *  short — for longer/structured content compose children. */
export function Alert({
  variant = 'info',
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = VARIANTS[variant];
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', box, className)}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
