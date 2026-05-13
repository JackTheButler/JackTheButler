import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Shared config reused by both workspace projects
export const sharedConfig = {
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Workspace packages — resolve to their src/ during testing (before build)
      '@jackthebutler/shared': resolve(__dirname, './packages/shared/src/index.ts'),
      '@jackthebutler/pms-mock': resolve(__dirname, './packages/pms-mock/src/index.ts'),
      '@jackthebutler/pms-mews': resolve(__dirname, './packages/pms-mews/src/index.ts'),
      '@jackthebutler/pms-cloudbeds': resolve(__dirname, './packages/pms-cloudbeds/src/index.ts'),
      '@jackthebutler/ai-anthropic': resolve(__dirname, './packages/ai-anthropic/src/index.ts'),
      '@jackthebutler/ai-openai': resolve(__dirname, './packages/ai-openai/src/index.ts'),
      '@jackthebutler/ai-ollama': resolve(__dirname, './packages/ai-ollama/src/index.ts'),
      '@jackthebutler/channel-whatsapp': resolve(__dirname, './packages/channel-whatsapp/src/index.ts'),
      '@jackthebutler/channel-twilio': resolve(__dirname, './packages/channel-twilio/src/index.ts'),
      '@jackthebutler/channel-smtp': resolve(__dirname, './packages/channel-smtp/src/index.ts'),
      '@jackthebutler/channel-mailgun': resolve(__dirname, './packages/channel-mailgun/src/index.ts'),
      '@jackthebutler/channel-sendgrid': resolve(__dirname, './packages/channel-sendgrid/src/index.ts'),
      '@jackthebutler/channel-gmail': resolve(__dirname, './packages/channel-gmail/src/index.ts'),
    },
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**'],
    },
  },
  ...sharedConfig,
});
