import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Web Push subscription state + actions for the current device. Talks to the
 * backend push routes and the browser PushManager. Degrades cleanly: when the
 * browser lacks support or the server has no VAPID keys, `supported`/`enabled`
 * stay false and the caller shows a disabled control instead of hanging.
 */

const supported =
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/** VAPID public keys are base64url; PushManager wants a Uint8Array. Backed by
 *  an explicit ArrayBuffer so the type satisfies BufferSource under TS 5.7. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

interface KeyResponse {
  enabled: boolean;
  key: string | null;
}

interface PushState {
  /** Browser can do push. */
  supported: boolean;
  /** Server has VAPID configured. */
  enabled: boolean;
  /** This device is subscribed. */
  subscribed: boolean;
  permission: NotificationPermission;
  busy: boolean;
}

export function usePush() {
  const [state, setState] = useState<PushState>({
    supported,
    enabled: false,
    subscribed: false,
    permission: supported ? Notification.permission : 'denied',
    busy: true,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supported) {
        setState((s) => ({ ...s, busy: false }));
        return;
      }
      try {
        const { enabled } = await api.get<KeyResponse>('/api/app/push/key');
        // No VAPID on the server (e.g. dev) → don't touch the SW; just report.
        if (!enabled) {
          if (!cancelled) setState((s) => ({ ...s, enabled: false, busy: false }));
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setState((s) => ({ ...s, enabled: true, subscribed: !!sub, busy: false }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, busy: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, busy: true }));
    try {
      const { key } = await api.get<KeyResponse>('/api/app/push/key');
      if (!key) throw new Error('push_disabled');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((s) => ({ ...s, permission, busy: false }));
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await api.post('/api/app/push/subscribe', {
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
      });
      setState((s) => ({ ...s, subscribed: true, permission, busy: false }));
      return true;
    } catch (err) {
      setState((s) => ({ ...s, busy: false }));
      throw err;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api.post('/api/app/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState((s) => ({ ...s, subscribed: false, busy: false }));
    } catch (err) {
      setState((s) => ({ ...s, busy: false }));
      throw err;
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}
