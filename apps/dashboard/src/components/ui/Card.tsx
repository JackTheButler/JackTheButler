import { cn } from './cn';

/** Titled bordered surface for grouped form content. */
export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-panel p-5', className)}>
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      <div className={cn(title && 'mt-4', 'space-y-4')}>{children}</div>
    </div>
  );
}
