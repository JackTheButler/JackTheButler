import { cn } from '@/components/ui';
import { JaneLoader } from '@/components/JaneLoader';

/** Centered in-content loading state — the Jane mark at a modest size. The
 *  full-screen session loader (AuthGate) uses this too. */
export function Loading({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('grid place-items-center py-12', className)}>
      <JaneLoader size={size} />
    </div>
  );
}
