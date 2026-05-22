import { useEffect, useState } from 'react';
import { cn } from '@/components/ui';
import { JaneLoader } from '@/components/JaneLoader';

/** Centered in-content loading state — the Jane mark at a modest size.
 *
 * Delay-show (anti-flicker): renders nothing for the first `delayMs`, so a
 * fast load (which unmounts this before the timer fires) never flashes a
 * loader. Only loads slower than the threshold actually show it. The
 * full-screen session loader (AuthGate) uses this too. */
export function Loading({
  size = 56,
  delayMs = 200,
  className,
}: {
  size?: number;
  delayMs?: number;
  className?: string;
}) {
  const show = useDelayedShow(delayMs);
  if (!show) return null;
  return (
    <div className={cn('grid place-items-center py-12', className)}>
      <JaneLoader size={size} />
    </div>
  );
}

function useDelayedShow(ms: number): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show;
}
