import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui';

/** Shows a small banner when a new service worker (new dashboard version) is
 *  waiting. The agent reloads on their own terms — we never reload mid-session.
 *  "Later" only hides the banner briefly (see SNOOZE_MS): the waiting worker
 *  stays put, so we re-surface the nudge so a stale build can't run all day.
 *  Renders nothing until an update is actually available. */

const SNOOZE_MS = 5 * 60 * 1000; // "Later" hides the prompt for at most 5 minutes.

export function PwaReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const snoozeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clear any pending re-show timer when this unmounts.
  useEffect(() => () => clearTimeout(snoozeTimer.current), []);

  if (!needRefresh) return null;

  // Hide now, then flip the prompt back on after the snooze window — the update
  // is still waiting, the agent just asked to be reminded a little later.
  const snooze = () => {
    setNeedRefresh(false);
    clearTimeout(snoozeTimer.current);
    snoozeTimer.current = setTimeout(() => setNeedRefresh(true), SNOOZE_MS);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 shadow-lg">
      <span className="text-sm">A new version is available.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
      <button
        onClick={snooze}
        className="text-sm text-muted hover:text-ink"
        aria-label="Dismiss update notice"
      >
        Later
      </button>
    </div>
  );
}
