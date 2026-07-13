/**
 * PMS Sync Interface Tests
 *
 * Verifies the dependency-inversion seam in src/core/interfaces/pms-sync.ts:
 * the kernel only depends on the PMSSync interface and a module-level
 * register/get pair, never on the concrete @/services/pms-sync.js service.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { AppError } from '@/errors/index.js';
import { registerPMSSync, getPMSSync, resetPMSSync, type PMSSync } from '@/core/interfaces/pms-sync.js';

describe('PMS sync interface', () => {
  afterEach(() => {
    resetPMSSync();
  });

  it('throws an AppError when no implementation has been registered', () => {
    expect(() => getPMSSync()).toThrow(AppError);
    expect(() => getPMSSync()).toThrow(/PMS sync not registered/);
  });

  it('returns the registered implementation', () => {
    const fake: PMSSync = {
      syncReservations: async () => ({ created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] }),
      refreshIfStale: async () => null,
    };

    registerPMSSync(fake);

    expect(getPMSSync()).toBe(fake);
  });

  it('reflects the most recently registered implementation', () => {
    const first: PMSSync = {
      syncReservations: async () => ({ created: 1, updated: 0, unchanged: 0, errors: 0 }),
      refreshIfStale: async () => null,
    };
    const second: PMSSync = {
      syncReservations: async () => ({ created: 2, updated: 0, unchanged: 0, errors: 0 }),
      refreshIfStale: async () => null,
    };

    registerPMSSync(first);
    registerPMSSync(second);

    expect(getPMSSync()).toBe(second);
  });

  it('throws again after resetPMSSync() clears the registration', () => {
    registerPMSSync({
      syncReservations: async () => ({ created: 0, updated: 0, unchanged: 0, errors: 0 }),
      refreshIfStale: async () => null,
    });
    expect(() => getPMSSync()).not.toThrow();

    resetPMSSync();

    expect(() => getPMSSync()).toThrow(AppError);
  });
});
