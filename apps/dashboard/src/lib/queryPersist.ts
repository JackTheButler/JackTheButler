import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/**
 * Persist a slice of the TanStack Query cache to localStorage so the PWA paints
 * the last-seen inbox instantly on reopen instead of a blank loading screen.
 * The data is treated as stale and revalidated in the background.
 *
 * Scope is deliberately narrow: only the conversation **list** (small, and the
 * biggest visual win). Open threads still load normally. Cleared on logout via
 * `clearPersistedQueries` so one agent's data never rehydrates for another.
 */

const STORAGE_KEY = 'jane-query-cache';

const persister = createSyncStoragePersister({ storage: window.localStorage, key: STORAGE_KEY });

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24h — older snapshots are dropped on rehydrate
  buster: __APP_VERSION__, // a new release invalidates the cache
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => q.queryKey[0] === 'conversations',
  },
};

/** Wipe the persisted cache (call on logout). */
export function clearPersistedQueries(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode / quota) — nothing to clear */
  }
}
