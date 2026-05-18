import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface IndicatorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Tracks the active item's box so a single absolutely-positioned indicator
 * can slide between items (segmented control, sidebar nav, …).
 *
 * - `transition` is true only for navigation (active-index change) so the
 *   indicator animates between items, and false on mount / container resize
 *   so it snap-tracks layout (no lag while a parent width animates).
 *
 * Attach `containerRef` to the positioned wrapper and push each item element
 * into `itemsRef.current[i]`.
 */
export function useSlidingIndicator(activeIndex: number) {
  const containerRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);
  const [rect, setRect] = useState<IndicatorRect | null>(null);
  const [transition, setTransition] = useState(false);
  const mounted = useRef(false);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  const measure = useCallback(() => {
    const el = itemsRef.current[activeRef.current];
    setRect(
      el ? { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight } : null,
    );
  }, []);

  // Navigation: animate the slide between items.
  useLayoutEffect(() => {
    if (!mounted.current) return; // first position handled below (no flash)
    setTransition(true);
    measure();
  }, [activeIndex, measure]);

  // Initial position + live tracking on resize — snap (no transition).
  useLayoutEffect(() => {
    measure();
    const id = requestAnimationFrame(() => {
      mounted.current = true;
    });
    const ro = new ResizeObserver(() => {
      setTransition(false);
      measure();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [measure]);

  return { containerRef, itemsRef, rect, transition };
}
