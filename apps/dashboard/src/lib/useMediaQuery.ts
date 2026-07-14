import { useSyncExternalStore } from 'react';

/** Reactive `window.matchMedia`. Re-renders when the query match changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on wide screens, where the context panel is always shown. */
export const useIsWide = () => useMediaQuery('(min-width: 1280px)');
