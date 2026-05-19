import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const avatar = cva('grid shrink-0 place-items-center font-semibold uppercase', {
  variants: {
    size: {
      sm: 'h-9 w-9 text-xs',
      md: 'h-10 w-10 text-sm',
    },
    tone: {
      muted: 'bg-surface text-muted ring-1 ring-line',
      accent: 'bg-accent-soft text-accent',
      solid: 'bg-accent text-on-accent',
    },
    shape: {
      circle: 'rounded-full',
      square: 'rounded-xl',
    },
  },
  defaultVariants: { size: 'sm', tone: 'muted', shape: 'circle' },
});

/**
 * Initials avatar (circle) or icon tile (square). Pass `name` for initials,
 * or `icon` to render an icon instead (used for source/app rows).
 */
export function Avatar({
  name,
  icon,
  size,
  tone,
  shape,
  className,
}: {
  name?: string;
  icon?: React.ReactNode;
  className?: string;
} & VariantProps<typeof avatar>) {
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
    : '';
  return (
    <div className={cn(avatar({ size, tone, shape }), className)}>{icon ?? initials}</div>
  );
}
