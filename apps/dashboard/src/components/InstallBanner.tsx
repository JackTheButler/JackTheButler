import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { JaneLogo } from '@/components/JaneLogo';
import { useInstallPrompt } from '@/lib/useInstallPrompt';

/**
 * Bottom install banner (à la "Add to Home Screen" prompts). Appears only when
 * the browser can actually install (Chrome/Android/desktop — `beforeinstallprompt`
 * fired and we're not already standalone), and stays dismissed across reloads.
 * iOS Safari can't be prompted programmatically, so it simply won't show there.
 */

const DISMISS_KEY = 'jane-install-dismissed';
const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_DAYS = 7; // each dismiss snoozes another week…
const MAX_DAYS = 28; // …up to four weeks.

interface DismissState {
  count: number; // how many times dismissed
  at: number; // last dismiss timestamp (ms)
}

function readDismiss(): DismissState | null {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null') as DismissState | null;
    return v && typeof v.count === 'number' && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Still within the snooze window? Window grows 7d per dismiss, capped at 28d. */
function isSnoozed(s: DismissState): boolean {
  return Date.now() - s.at < Math.min(s.count * STEP_DAYS, MAX_DAYS) * DAY_MS;
}

export function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  // Hidden if we're still inside the snooze window from a previous dismiss.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    const s = readDismiss();
    return s ? isSnoozed(s) : false;
  });

  if (!canInstall || dismissed) return null;

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
    <div
      className="fixed inset-x-0 bottom-0 z-40 p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-panel p-3 shadow-lg ring-1 ring-black/5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
          <JaneLogo size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Install Jane</p>
          <p className="text-xs text-muted">Handle chats from anywhere.</p>
        </div>
        <Button size="sm" onClick={() => void promptInstall()}>
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
