import { defineWorkspace } from 'vitest/config';
import { sharedConfig } from './vitest.config';

/**
 * Vitest Workspace
 *
 * Splits tests into two projects so that auth-related tests sharing
 * the `auth_settings` DB row run sequentially, while everything else
 * runs in parallel.
 */
export default defineWorkspace([
  {
    // Tests that mutate shared auth_settings — must run sequentially
    test: {
      name: 'auth',
      globals: true,
      environment: 'node',
      include: [
        'tests/gateway/auth-registration.test.ts',
        'tests/gateway/auth-enforcement.test.ts',
        'tests/gateway/auth-settings.test.ts',
        'tests/gateway/staff-approval.test.ts',
        'tests/services/auth-settings.test.ts',
      ],
      pool: 'forks',
      poolOptions: {
        forks: { singleFork: true },
      },
    },
    ...sharedConfig,
  },
  {
    // Everything else — parallel (default)
    test: {
      name: 'default',
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: [
        'tests/gateway/auth-registration.test.ts',
        'tests/gateway/auth-enforcement.test.ts',
        'tests/gateway/auth-settings.test.ts',
        'tests/gateway/staff-approval.test.ts',
        'tests/services/auth-settings.test.ts',
      ],
    },
    ...sharedConfig,
  },
]);
