// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://jackthebutler.github.io',
  base: '/JackTheButler/',
  vite: {
    plugins: [tailwindcss()]
  }
});
