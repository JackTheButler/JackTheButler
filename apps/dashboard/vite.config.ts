import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  // Build identity, surfaced in Settings so the active build is verifiable
  // (handy when a cached service worker may be serving an old version).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // Custom service worker (src/sw.ts) so it can handle Web Push, not just
      // precaching. We register + show the update prompt ourselves
      // (PwaReloadPrompt), so don't inject an auto-registration script.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      // What gets precached into the app shell (navigation fallback + push
      // handlers live in src/sw.ts).
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Force a single copy of these so providers + hooks share one React context.
    // The query-persist packages can otherwise pull a second @tanstack/react-query,
    // which breaks the QueryClient context ("No QueryClient set").
    dedupe: ['@tanstack/react-query'],
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
