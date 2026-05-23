import { useCallback, useSyncExternalStore } from 'react';

/**
 * PWA install affordance. `beforeinstallprompt` fires early (around page load)
 * and only once — often before any React effect runs — so we capture it at
 * module-eval time into shared state and expose it via an external store.
 * Hides itself when already installed (standalone) or when the browser can't
 * prompt (Safari/Firefox have no programmatic install).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag for home-screen apps.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the mini-infobar; we drive the prompt
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const canInstallSnapshot = (): boolean => !installed && deferred !== null;

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribe, canInstallSnapshot, () => false);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A used prompt can't be reused; drop it (appinstalled also clears it).
    if (outcome === 'accepted') {
      deferred = null;
      notify();
    }
  }, []);

  return { canInstall, promptInstall };
}
