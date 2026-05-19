import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
});
