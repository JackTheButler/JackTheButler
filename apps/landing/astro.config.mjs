// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const isProduction = process.env.NODE_ENV === 'production';

// https://astro.build/config
export default defineConfig({
  site: isProduction ? 'https://jackthebutler.com' : 'http://localhost:4321',
  base: '/',
  vite: {
    plugins: [tailwindcss()]
  }
});
