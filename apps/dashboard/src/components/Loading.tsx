import { cn } from '@/components/ui';
import { JaneLoader } from '@/components/JaneLoader';

/** Centered in-content loading state — the Jane mark at a modest size.
 *
 * By default it claims a tall region and centers vertically, so a page's data
 * load sits mid-screen (matching the full-screen session loader in AuthGate)
 * instead of snapping to the top. Pass `inline` for compact spots — e.g. inside
 * a Card — where that tall block would look wrong. */
export function Loading({
  size = 56,
  inline = false,
  className,
}: {
  size?: number;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('grid place-items-center', inline ? 'py-12' : 'min-h-[60vh]', className)}>
      <JaneLoader size={size} />
    </div>
  );
}
