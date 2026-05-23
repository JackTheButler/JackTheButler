/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import type { PushNotificationPayload } from '@janetheoperator/shared';

// Custom service worker (vite-plugin-pwa injectManifest). Owns three jobs:
// app-shell precache, SPA navigation fallback, and Web Push display.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// 1) Precache the built app shell (manifest injected at build time).
precacheAndRoute(self.__WB_MANIFEST);

// 2) SPA navigations resolve to the cached shell — except API/widget/health,
//    which must always hit the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api/, /^\/widget/, /^\/health/],
  }),
);

// Activate a waiting worker on demand (the in-app "Reload" prompt posts this).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 3) Web Push. The foreground page wins: if a dashboard tab is focused, the
//    in-app UI already surfaces the event, so we suppress the OS notification.
self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event: PushEvent): Promise<void> {
  if (!event.data) return;
  let payload: PushNotificationPayload;
  try {
    payload = event.data.json() as PushNotificationPayload;
  } catch {
    return;
  }

  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const focused = windows.some((c) => c.visibilityState === 'visible' && c.focused);
  if (focused) return;

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = ((event.notification.data as { url?: string } | undefined)?.url ?? '/') as string;
  event.waitUntil(focusOrOpen(url));
});

async function focusOrOpen(url: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((c) => 'focus' in c);
  if (existing) {
    // Reuse the open dashboard: focus it and let the app route to the thread
    // client-side (no reload) — see PushNavigationListener.
    await existing.focus();
    existing.postMessage({ type: 'NAVIGATE', url });
    return;
  }
  await self.clients.openWindow(url);
}
