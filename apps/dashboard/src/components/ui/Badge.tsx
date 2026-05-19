import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badge = cva('inline-flex items-center gap-1.5 font-semibold', {
  variants: {
    tone: {
      primary: 'bg-accent text-on-accent',
      accent: 'bg-accent-soft text-accent',
      staff: 'bg-staff-soft text-staff',
      muted: 'bg-surface text-muted ring-1 ring-line',
    },
    shape: {
      tag: 'rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
      pill: 'rounded-full px-2.5 py-1 text-xs',
    },
  },
  defaultVariants: { tone: 'muted', shape: 'tag' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, shape, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, shape }), className)} {...props} />;
}
