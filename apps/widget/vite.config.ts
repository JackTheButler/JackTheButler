import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset URLs so the bundle works when served under /widget/app/.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
});
