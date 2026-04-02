import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Shared config reused by both workspace projects
export const sharedConfig = {
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Workspace packages — resolve to their src/ during testing (before build)
      '@jack/shared': resolve(__dirname, './packages/shared/src/index.ts'),
      '@jack-plugins/pms-mock': resolve(__dirname, './packages/pms-mock/src/index.ts'),
      '@jack-plugins/pms-mews': resolve(__dirname, './packages/pms-mews/src/index.ts'),
      '@jack-plugins/pms-cloudbeds': resolve(__dirname, './packages/pms-cloudbeds/src/index.ts'),
      '@jack-plugins/ai-anthropic': resolve(__dirname, './packages/ai-anthropic/src/index.ts'),
      '@jack-plugins/ai-openai': resolve(__dirname, './packages/ai-openai/src/index.ts'),
      '@jack-plugins/ai-ollama': resolve(__dirname, './packages/ai-ollama/src/index.ts'),
      '@jack-plugins/channel-whatsapp': resolve(__dirname, './packages/channel-whatsapp/src/index.ts'),
      '@jack-plugins/channel-twilio': resolve(__dirname, './packages/channel-twilio/src/index.ts'),
      '@jack-plugins/channel-smtp': resolve(__dirname, './packages/channel-smtp/src/index.ts'),
      '@jack-plugins/channel-mailgun': resolve(__dirname, './packages/channel-mailgun/src/index.ts'),
      '@jack-plugins/channel-sendgrid': resolve(__dirname, './packages/channel-sendgrid/src/index.ts'),
      '@jack-plugins/channel-gmail': resolve(__dirname, './packages/channel-gmail/src/index.ts'),
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
