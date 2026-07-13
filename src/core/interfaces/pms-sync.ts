/**
 * PMS Sync Interface
 *
 * Defines the contract the kernel needs from a PMS sync implementation,
 * without depending on the concrete adapter in src/services/pms-sync.ts.
 * This is part of the kernel - business logic depends on this interface,
 * not on the concrete implementation. The composition root (src/index.ts)
 * registers the real implementation at startup via `registerPMSSync()`.
 *
 * @module core/interfaces/pms-sync
 */

import { AppError } from '@/errors/index.js';
import type { SyncResult } from '@jackthebutler/shared';
import type { Reservation } from '@/db/schema.js';

/**
 * Result of a PMS sync operation.
 *
 * Structurally identical to `SyncResult` from `@jackthebutler/shared` (which
 * `PMSSyncService` already uses), re-exported here under a kernel-facing
 * name so core code doesn't need to know where the concrete type lives.
 */
export type PMSSyncResult = SyncResult;

/**
 * Minimal PMS sync contract the kernel depends on.
 *
 * The concrete implementation (`PMSSyncService` in `src/services/pms-sync.ts`)
 * satisfies this interface without casts.
 */
export interface PMSSync {
  /**
   * Sync reservations modified since the given date (or a provider-defined
   * default lookback window if omitted).
   */
  syncReservations(since?: Date): Promise<PMSSyncResult>;

  /**
   * Return the reservation, refreshing it from the PMS first if the locally
   * cached copy is older than the staleness threshold. Returns `null` if the
   * reservation doesn't exist locally.
   */
  refreshIfStale(reservationId: string, maxAgeMs?: number): Promise<Reservation | null>;
}

let pmsSyncImpl: PMSSync | undefined;

/**
 * Register the PMS sync implementation. Must be called once at startup
 * (composition root), before any kernel code calls `getPMSSync()`.
 */
export function registerPMSSync(impl: PMSSync): void {
  pmsSyncImpl = impl;
}

/**
 * Retrieve the registered PMS sync implementation.
 *
 * @throws {AppError} if no implementation has been registered yet.
 */
export function getPMSSync(): PMSSync {
  if (!pmsSyncImpl) {
    throw new AppError(
      'PMS sync not registered — call registerPMSSync() at startup',
      'PMS_SYNC_NOT_REGISTERED',
      500
    );
  }
  return pmsSyncImpl;
}

/**
 * Test-only helper to reset registration state between tests.
 */
export function resetPMSSync(): void {
  pmsSyncImpl = undefined;
}
