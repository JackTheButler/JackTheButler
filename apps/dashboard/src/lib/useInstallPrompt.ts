import { useCallback, useEffect, useState } from 'react';

/**
 * PWA install affordance. Captures the Chromium `beforeinstallprompt` event so
 * we can offer a one-click "Install app" button, and hides itself when the app
 * is already installed (standalone) or the browser can't prompt (Safari/Firefox
 * have no programmatic install — users add to home screen manually).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag for home-screen apps.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar from showing; we drive it
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A used prompt can't be reused; drop it (appinstalled also clears it).
    if (outcome === 'accepted') setDeferred(null);
  }, [deferred]);

  return { canInstall: !installed && deferred !== null, promptInstall };
}
