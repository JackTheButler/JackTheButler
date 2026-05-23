import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We register + show the update prompt ourselves (PwaReloadPrompt), so
      // don't inject an auto-registration script.
      registerType: 'prompt',
      injectRegister: null,
      // Precache the built app shell; these root assets aren't hashed, so list
      // them explicitly to keep them fresh.
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'favicon-96x96.png'],
      manifest: {
        id: '/',
        name: 'Jane the Operator',
        short_name: 'Jane',
        description: 'Customer support, operated by Jane.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#faf9f5',
        background_color: '#faf9f5',
        icons: [
          { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA navigations resolve to the cached shell — except API, widget, and
        // health, which must always hit the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/widget/, /^\/health/],
        // Cache Google Fonts (the only cross-origin app-shell asset).
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // ws:true so the authed dashboard WebSocket proxies in dev too.
      '/api': { target: 'http://localhost:3000', ws: true },
      // Dev-only: serve the widget surface (/widget.js, /widget/config,
      // /widget/app/*, /widget/socket) from the API so the dashboard origin
      // is a valid widget origin in dev. Prefix match covers /widget.js too.
      '/widget': { target: 'http://localhost:3000', ws: true },
    },
  },
  // `vite preview` serves the production build (incl. the service worker) so
  // the PWA can be tested locally. Same proxy as dev so it talks to the API.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true },
      '/widget': { target: 'http://localhost:3000', ws: true },
    },
  },
});
