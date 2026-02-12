import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Shared config reused by both workspace projects
export const sharedConfig = {
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**'],
    },
  },
  ...sharedConfig,
});
