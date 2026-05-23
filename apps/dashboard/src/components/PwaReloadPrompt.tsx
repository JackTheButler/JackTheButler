import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui';

/** Shows a small banner when a new service worker (new dashboard version) is
 *  waiting. The agent reloads on their own terms — we never reload mid-session.
 *  Renders nothing until an update is actually available. */
export function PwaReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 shadow-lg">
      <span className="text-sm">A new version is available.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-sm text-muted hover:text-ink"
        aria-label="Dismiss update notice"
      >
        Later
      </button>
    </div>
  );
}
