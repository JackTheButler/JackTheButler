/**
 * PMS Sync Service
 *
 * Synchronizes data between PMS and Jack's database.
 * Handles both pull (polling) and push (webhook) scenarios.
 */

import { eq, and, or, sql } from 'drizzle-orm';
import { db, guests, reservations } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { normalizePhone } from '@/services/guest.js';
import { getAppRegistry } from '@/apps/index.js';
import type { NormalizedGuest, NormalizedReservation, SyncResult } from '@jack/shared';
import type { Guest, Reservation } from '@/db/schema.js';
import { now } from '@/utils/time.js';

const log = createLogger('pms-sync');

/** Default staleness threshold: 5 minutes */
const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000;
/** Default sync interval: 15 minutes */
const DEFAULT_SYNC_INTERVAL_S = 900;

export class PMSSyncService {
  private pendingRefreshes = new Map<string, Promise<Reservation | null>>();

  /**
   * Sync all reservations modified since last sync
   */
  async syncReservations(since?: Date): Promise<SyncResult> {
    const adapter = getAppRegistry().getActivePMSAdapter();
    const result: SyncResult = { created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] };

    if (!adapter) {
      log.warn('No PMS adapter configured, skipping sync');
      return result;
    }

    const sinceDt = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
    log.info({ since: sinceDt.toISOString(), provider: adapter.provider }, 'Starting PMS sync');

    try {
      const pmsReservations = await adapter.getModifiedReservations(sinceDt);
      log.info({ count: pmsReservations.length }, 'Fetched reservations from PMS');

      for (const pmsRes of pmsReservations) {
        try {
          const syncResult = await this.upsertReservation(pmsRes);
          if (syncResult === 'created') result.created++;
          else if (syncResult === 'updated') result.updated++;
          else result.unchanged++;
        } catch (err) {
          result.errors++;
          result.errorDetails?.push({
            id: pmsRes.externalId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          log.error({ err, reservationId: pmsRes.externalId }, 'Error syncing reservation');
        }
      }
    } catch (err) {
      log.error({ err }, 'Error fetching reservations from PMS');
      throw err;
    }

    log.info(result, 'PMS sync complete');
    return result;
  }

  /**
   * Upsert a guest from PMS data
   */
  async upsertGuest(pmsGuest: NormalizedGuest): Promise<{ guest: Guest; action: 'created' | 'updated' | 'unchanged' }> {
    // Find existing guest by external ID or phone/email
    let existingGuest = await this.findGuestByExternalId(pmsGuest.externalId, pmsGuest.source);

    if (!existingGuest && pmsGuest.phone) {
      existingGuest = await this.findGuestByPhone(pmsGuest.phone);
    }

    if (!existingGuest && pmsGuest.email) {
      existingGuest = await this.findGuestByEmail(pmsGuest.email);
    }


    if (existingGuest) {
      // Update existing guest
      const externalIds = JSON.parse(existingGuest.externalIds || '{}');
      externalIds[pmsGuest.source] = pmsGuest.externalId;

      await db
        .update(guests)
        .set({
          firstName: pmsGuest.firstName,
          lastName: pmsGuest.lastName,
          email: pmsGuest.email || existingGuest.email,
          phone: pmsGuest.phone ? normalizePhone(pmsGuest.phone) : existingGuest.phone,
          language: pmsGuest.language || existingGuest.language,
          loyaltyTier: pmsGuest.loyaltyTier || existingGuest.loyaltyTier,
          vipStatus: pmsGuest.vipStatus || existingGuest.vipStatus,
          preferences: pmsGuest.preferences
            ? JSON.stringify(pmsGuest.preferences)
            : existingGuest.preferences,
          externalIds: JSON.stringify(externalIds),
          notes: pmsGuest.notes || existingGuest.notes,
          updatedAt: now(),
        })
        .where(eq(guests.id, existingGuest.id));

      const [updated] = await db.select().from(guests).where(eq(guests.id, existingGuest.id)).limit(1);
      log.debug({ guestId: existingGuest.id }, 'Updated guest from PMS');
      return { guest: updated!, action: 'updated' };
    }

    // Create new guest
    const id = generateId('guest');
    const externalIds = { [pmsGuest.source]: pmsGuest.externalId };

    await db.insert(guests).values({
      id,
      firstName: pmsGuest.firstName,
      lastName: pmsGuest.lastName,
      email: pmsGuest.email ?? null,
      phone: pmsGuest.phone ? normalizePhone(pmsGuest.phone) : null,
      language: pmsGuest.language ?? 'en',
      loyaltyTier: pmsGuest.loyaltyTier ?? null,
      vipStatus: pmsGuest.vipStatus ?? null,
      preferences: pmsGuest.preferences ? JSON.stringify(pmsGuest.preferences) : '[]',
      externalIds: JSON.stringify(externalIds),
      notes: pmsGuest.notes ?? null,
      createdAt: now(),
      updatedAt: now(),
    });

    const [created] = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
    log.info({ guestId: id, source: pmsGuest.source }, 'Created guest from PMS');
    return { guest: created!, action: 'created' };
  }

  /**
   * Upsert a reservation from PMS data
   */
  async upsertReservation(pmsRes: NormalizedReservation): Promise<'created' | 'updated' | 'unchanged'> {
    // First upsert the guest
    const { guest } = await this.upsertGuest(pmsRes.guest);

    // Find existing reservation by confirmation number
    const [existingRes] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.confirmationNumber, pmsRes.confirmationNumber))
      .limit(1);


    // Map PMS status to our status
    const status = this.mapReservationStatus(pmsRes.status);

    if (existingRes) {
      // Check if anything changed
      const hasChanges =
        existingRes.status !== status ||
        existingRes.roomNumber !== pmsRes.roomNumber ||
        existingRes.arrivalDate !== pmsRes.arrivalDate ||
        existingRes.departureDate !== pmsRes.departureDate;

      if (!hasChanges) {
        // Still update syncedAt so freshness checks know we verified with PMS
        await db
          .update(reservations)
          .set({ syncedAt: now() })
          .where(eq(reservations.id, existingRes.id));
        return 'unchanged';
      }

      // Update existing reservation
      await db
        .update(reservations)
        .set({
          guestId: guest.id,
          roomNumber: pmsRes.roomNumber ?? null,
          roomType: pmsRes.roomType,
          arrivalDate: pmsRes.arrivalDate,
          departureDate: pmsRes.departureDate,
          status,
          rateCode: pmsRes.rateCode ?? null,
          totalRate: pmsRes.totalRate ?? null,
          specialRequests: pmsRes.specialRequests ? JSON.stringify(pmsRes.specialRequests) : null,
          notes: pmsRes.notes ? JSON.stringify(pmsRes.notes) : null,
          externalId: pmsRes.externalId,
          syncedAt: now(),
          updatedAt: now(),
        })
        .where(eq(reservations.id, existingRes.id));

      log.debug({ reservationId: existingRes.id, confirmation: pmsRes.confirmationNumber }, 'Updated reservation');
      return 'updated';
    }

    // Create new reservation
    const id = generateId('reservation');

    await db.insert(reservations).values({
      id,
      guestId: guest.id,
      confirmationNumber: pmsRes.confirmationNumber,
      externalId: pmsRes.externalId,
      roomNumber: pmsRes.roomNumber ?? null,
      roomType: pmsRes.roomType,
      arrivalDate: pmsRes.arrivalDate,
      departureDate: pmsRes.departureDate,
      status,
      rateCode: pmsRes.rateCode ?? null,
      totalRate: pmsRes.totalRate ?? null,
      specialRequests: pmsRes.specialRequests ? JSON.stringify(pmsRes.specialRequests) : null,
      notes: pmsRes.notes ? JSON.stringify(pmsRes.notes) : null,
      syncedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });

    log.info({ reservationId: id, confirmation: pmsRes.confirmationNumber, source: pmsRes.source }, 'Created reservation');
    return 'created';
  }

  /**
   * Find active/upcoming reservation for a guest
   */
  async findActiveReservation(guestId: string): Promise<Reservation | null> {
    const today = now().split('T')[0];

    const [reservation] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.guestId, guestId),
          sql`${reservations.departureDate} >= ${today}`,
          sql`${reservations.status} IN ('confirmed', 'checked_in')`
        )
      )
      .orderBy(reservations.arrivalDate)
      .limit(1);

    return reservation || null;
  }

  /**
   * Find guest by external ID
   */
  private async findGuestByExternalId(externalId: string, source: string): Promise<Guest | null> {
    // Search in externalIds JSON field
    const allGuests = await db.select().from(guests);

    for (const guest of allGuests) {
      const externalIds = JSON.parse(guest.externalIds || '{}');
      if (externalIds[source] === externalId) {
        return guest;
      }
    }

    return null;
  }

  /**
   * Find guest by phone
   * Uses flexible matching to handle different phone formats
   */
  private async findGuestByPhone(phone: string): Promise<Guest | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    // Extract digits only (without +)
    const digitsOnly = normalized.replace(/^\+/, '');
    // Last 9 digits for flexible matching (handles country code variations)
    const last9Digits = digitsOnly.slice(-9);

    const [guest] = await db
      .select()
      .from(guests)
      .where(
        or(
          eq(guests.phone, normalized),           // +971543219865
          eq(guests.phone, digitsOnly),           // 971543219865
          sql`${guests.phone} LIKE ${'%' + last9Digits}` // %543219865
        )
      )
      .limit(1);

    return guest || null;
  }

  /**
   * Find guest by email
   */
  private async findGuestByEmail(email: string): Promise<Guest | null> {
    const [guest] = await db
      .select()
      .from(guests)
      .where(eq(guests.email, email.toLowerCase()))
      .limit(1);

    return guest || null;
  }

  /**
   * Refresh a reservation if its local data is stale
   *
   * Returns the (possibly refreshed) reservation, or null if not found locally.
   * If the PMS is unavailable, returns stale local data rather than failing.
   */
  async refreshIfStale(reservationId: string, maxAgeMs?: number): Promise<Reservation | null> {
    // Load reservation from DB
    const [reservation] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);

    if (!reservation) return null;

    // Check if a PMS adapter is active
    const adapter = getAppRegistry().getActivePMSAdapter();
    if (!adapter) return reservation; // No PMS = local is source of truth

    // Determine staleness threshold
    const pmsApp = getAppRegistry().getActivePMSApp();
    const configThresholdS = pmsApp?.config?.stalenessThreshold as number | undefined;
    const thresholdMs = configThresholdS
      ? configThresholdS * 1000
      : (maxAgeMs ?? DEFAULT_STALENESS_THRESHOLD_MS);

    // Check if data is fresh enough
    const syncedAtMs = new Date(reservation.syncedAt).getTime();
    if (Date.now() - syncedAtMs < thresholdMs) {
      return reservation;
    }

    // Dedup concurrent refreshes for the same reservation
    const pending = this.pendingRefreshes.get(reservationId);
    if (pending) return pending;

    const refreshPromise = this.doRefresh(reservation, adapter).finally(() => {
      this.pendingRefreshes.delete(reservationId);
    });

    this.pendingRefreshes.set(reservationId, refreshPromise);
    return refreshPromise;
  }

  /**
   * Refresh a reservation looked up by confirmation number
   */
  async refreshReservationByConfirmation(
    confirmationNumber: string,
    maxAgeMs?: number
  ): Promise<Reservation | null> {
    const [reservation] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.confirmationNumber, confirmationNumber))
      .limit(1);

    if (!reservation) return null;

    return this.refreshIfStale(reservation.id, maxAgeMs);
  }

  /**
   * Perform the actual PMS fetch and upsert
   */
  private async doRefresh(
    reservation: Reservation,
    adapter: { getReservation(id: string): Promise<NormalizedReservation | null>; getReservationByConfirmation(cn: string): Promise<NormalizedReservation | null> }
  ): Promise<Reservation | null> {
    try {
      const pmsData = reservation.externalId
        ? await adapter.getReservation(reservation.externalId)
        : await adapter.getReservationByConfirmation(reservation.confirmationNumber);

      if (pmsData) {
        await this.upsertReservation(pmsData);
        // Re-read the updated record
        const [fresh] = await db
          .select()
          .from(reservations)
          .where(eq(reservations.id, reservation.id))
          .limit(1);
        log.debug({ reservationId: reservation.id }, 'Refreshed stale reservation from PMS');
        return fresh ?? reservation;
      }

      return reservation;
    } catch (err) {
      log.warn({ err, reservationId: reservation.id }, 'PMS unavailable during refresh, using stale data');
      return reservation;
    }
  }

  /**
   * Map PMS status to our internal status
   */
  private mapReservationStatus(pmsStatus: NormalizedReservation['status']): string {
    const statusMap: Record<string, string> = {
      confirmed: 'confirmed',
      checked_in: 'checked_in',
      checked_out: 'checked_out',
      cancelled: 'cancelled',
      no_show: 'no_show',
    };
    return statusMap[pmsStatus] || 'confirmed';
  }
}

/**
 * Singleton instance
 */
export const pmsSyncService = new PMSSyncService();

/**
 * Read sync config from the active PMS app, with code defaults as fallback.
 */
export function getPMSSyncConfig(): { stalenessThresholdMs: number; syncIntervalMs: number } {
  const pmsApp = getAppRegistry().getActivePMSApp();
  const configThresholdS = pmsApp?.config?.stalenessThreshold as number | undefined;
  const configIntervalS = pmsApp?.config?.syncInterval as number | undefined;

  return {
    stalenessThresholdMs: configThresholdS
      ? configThresholdS * 1000
      : DEFAULT_STALENESS_THRESHOLD_MS,
    syncIntervalMs: configIntervalS
      ? configIntervalS * 1000
      : DEFAULT_SYNC_INTERVAL_S * 1000,
  };
}
