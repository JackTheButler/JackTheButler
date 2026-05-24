import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { toast } from '@/components/ui';
import { usePush } from './usePush';

/**
 * Inbox banner nudging staff to turn on push when this device isn't subscribed.
 * Shown above the conversation list on mobile, where push is the main way new
 * chats are noticed — a silent inbox means missed replies and blown SLAs.
 *
 * Two states: never-asked (`default`) → tapping prompts the OS permission and
 * subscribes; blocked (`denied`) → we can't re-prompt programmatically, so we
 * point the agent at their device settings instead. Dismiss snoozes it, but it
 * re-nudges sooner than the install banner since the cost of missing it is high.
 */

const DISMISS_KEY = 'jane-notify-banner-dismissed';
const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_DAYS = 3; // each dismiss snoozes ~3 days…
const MAX_DAYS = 14; // …up to two weeks.

interface DismissState {
  count: number;
  at: number;
}

function readDismiss(): DismissState | null {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null') as DismissState | null;
    return v && typeof v.count === 'number' && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Still within the snooze window? Window grows 3d per dismiss, capped at 14d. */
function isSnoozed(s: DismissState): boolean {
  return Date.now() - s.at < Math.min(s.count * STEP_DAYS, MAX_DAYS) * DAY_MS;
}

export function NotificationBanner() {
  const push = usePush();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    const s = readDismiss();
    return s ? isSnoozed(s) : false;
  });

  // Nothing to nudge when we're still loading, the platform/server can't do
  // push, this device is already subscribed, or the user snoozed it.
  if (push.busy || !push.supported || !push.enabled || push.subscribed || dismissed) return null;

  const blocked = push.permission === 'denied';

  const enable = async () => {
    try {
      const ok = await push.subscribe();
      toast[ok ? 'success' : 'error'](
        ok ? 'Notifications enabled' : 'Notifications are blocked in your device settings.',
      );
    } catch {
      toast.error('Could not enable notifications.');
    }
  };

  const dismiss = () => {
    setDismissed(true);
    const next: DismissState = { count: (readDismiss()?.count ?? 0) + 1, at: Date.now() };
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — just hide for this session */
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 md:hidden">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <BellRing size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Notifications are off</p>
        <p className="text-xs text-muted">
          {blocked
            ? 'Allow notifications in your device settings to hear about new chats.'
            : "You won't be alerted to new chats on this device."}
        </p>
      </div>
      {!blocked && (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={push.busy}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Turn on
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-amber-500/10 hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  );
}
