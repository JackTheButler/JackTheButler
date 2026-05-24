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

export function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!canInstall || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — just hide for this session */
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-panel p-3 shadow-lg ring-1 ring-black/5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
          <JaneLogo size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Install Jane</p>
          <p className="text-xs text-muted">Add it to your home screen for quick access.</p>
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
