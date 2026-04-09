/**
 * Verification Service
 *
 * Shared guest identity verification logic used by both the webchat channel
 * and the pipeline's check-verification stage.
 *
 * Flow:
 * 1. lookupReservationByConfirmation — PMS first, local fallback if PMS unavailable
 * 2. On PMS hit: upsert local guest + reservation, return local records
 * 3. On PMS unavailable: fall back to local DB records
 * 4. On PMS not found: return null (no fallback — reservation doesn't exist)
 *
 * All public functions return local DB types (Guest, Reservation) — callers
 * never need to deal with PMS-specific shapes.
 */

import { eq } from 'drizzle-orm';
import { db, reservations } from '@/db/index.js';
import { getAppRegistry } from '@/apps/registry.js';
import { guestService } from '@/services/guest.js';
import { createLogger } from '@/utils/logger.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import type { NormalizedReservation } from '@jack/shared';
import type { Guest, Reservation } from '@/db/schema.js';

const log = createLogger('services:verification');

/** Maximum failed verification attempts before directing the guest to the front desk */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Partial or completed verification state, stored in conversation.metadata.verification
 * and exposed on ctx.verification during the pipeline run.
 */
export interface VerificationState {
  lastName?: string;
  confirmationNumber?: string;
  attempts: number;
  /** True only on the current pipeline turn when a lookup was attempted and failed */
  failed?: boolean;
}

/** Result of verifyByConfirmationAndLastName */
export type VerifyResult =
  | { ok: true; reservation: Reservation; guest: Guest }
  | { ok: false; reason: 'not_found' | 'mismatch' };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Find or create a local guest record from PMS guest data.
 * Matches by email first, then phone, then creates if not found.
 */
async function findOrCreateGuest(pmsGuest: NormalizedReservation['guest']): Promise<Guest> {
  let guest: Guest | null = pmsGuest.email
    ? await guestService.findByEmail(pmsGuest.email)
    : null;

  if (!guest && pmsGuest.phone) {
    guest = await guestService.findByPhone(pmsGuest.phone);
  }

  if (!guest) {
    guest = await guestService.create({
      firstName: pmsGuest.firstName,
      lastName: pmsGuest.lastName,
      email: pmsGuest.email ?? null,
      phone: pmsGuest.phone ?? null,
    });
    log.info({ guestId: guest.id }, 'verification: created local guest from PMS data');
  }

  return guest;
}

/**
 * Upsert a local reservation record from PMS data.
 * Updates if already exists (keeps local data fresh), creates if not.
 */
async function upsertReservation(normalized: NormalizedReservation, guestId: string): Promise<Reservation> {
  const [existing] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.confirmationNumber, normalized.confirmationNumber))
    .limit(1);

  if (existing) {
    await db
      .update(reservations)
      .set({
        guestId,
        roomNumber: normalized.roomNumber ?? null,
        roomType: normalized.roomType,
        arrivalDate: normalized.arrivalDate,
        departureDate: normalized.departureDate,
        status: normalized.status,
        rateCode: normalized.rateCode ?? null,
        totalRate: normalized.totalRate ?? null,
        specialRequests: normalized.specialRequests ? JSON.stringify(normalized.specialRequests) : '[]',
        syncedAt: now(),
        updatedAt: now(),
      })
      .where(eq(reservations.confirmationNumber, normalized.confirmationNumber));

    const [updated] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.confirmationNumber, normalized.confirmationNumber))
      .limit(1);

    return updated!;
  }

  const id = generateId('reservation');
  await db.insert(reservations).values({
    id,
    guestId,
    confirmationNumber: normalized.confirmationNumber,
    externalId: normalized.externalId,
    roomNumber: normalized.roomNumber ?? null,
    roomType: normalized.roomType,
    arrivalDate: normalized.arrivalDate,
    departureDate: normalized.departureDate,
    status: normalized.status,
    rateCode: normalized.rateCode ?? null,
    totalRate: normalized.totalRate ?? null,
    specialRequests: normalized.specialRequests ? JSON.stringify(normalized.specialRequests) : '[]',
    syncedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  log.info({ reservationId: id, confirmationNumber: normalized.confirmationNumber }, 'verification: created local reservation from PMS data');

  const [created] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);

  return created!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a reservation by confirmation number.
 *
 * Tries PMS first. If PMS is unavailable (throws), falls back to local DB.
 * If PMS says not found (returns null), returns null — no local fallback.
 * If PMS succeeds, upserts local guest + reservation and returns local records.
 */
export async function lookupReservationByConfirmation(
  confirmationNumber: string,
): Promise<{ reservation: Reservation; guest: Guest } | null> {
  const pmsAdapter = getAppRegistry().getActivePMSAdapter();

  if (pmsAdapter) {
    try {
      const normalized = await pmsAdapter.getReservationByConfirmation(confirmationNumber);

      if (!normalized) {
        return null;
      }

      // PMS found it — upsert local copies and return local records
      const guest = await findOrCreateGuest(normalized.guest);
      const reservation = await upsertReservation(normalized, guest.id);
      return { reservation, guest };
    } catch (err) {
      // PMS unavailable (network error, timeout, etc.) — fall back to local
      log.warn({ err, confirmationNumber }, 'verification: PMS lookup failed, falling back to local DB');
    }
  }

  // Local fallback
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.confirmationNumber, confirmationNumber))
    .limit(1);

  if (!reservation) return null;

  const guest = await guestService.findById(reservation.guestId);
  if (!guest) return null;

  return { reservation, guest };
}

/**
 * Look up all reservations for a guest by email.
 *
 * Tries PMS first. If PMS is unavailable (throws), falls back to local DB.
 * If PMS returns empty, returns empty array — no local fallback.
 * If PMS succeeds, upserts all returned reservations locally and returns local records.
 */
export async function lookupReservationsByEmail(
  email: string,
): Promise<Array<{ reservation: Reservation; guest: Guest }>> {
  const normalizedEmail = email.toLowerCase().trim();
  const pmsAdapter = getAppRegistry().getActivePMSAdapter();

  if (pmsAdapter) {
    try {
      const normalizedList = await pmsAdapter.searchReservations({ guestEmail: normalizedEmail });

      if (normalizedList.length === 0) {
        return [];
      }

      // Upsert all returned reservations and collect local records
      const results: Array<{ reservation: Reservation; guest: Guest }> = [];
      for (const normalized of normalizedList) {
        const guest = await findOrCreateGuest(normalized.guest);
        const reservation = await upsertReservation(normalized, guest.id);
        results.push({ reservation, guest });
      }
      return results;
    } catch (err) {
      log.warn({ err, email: normalizedEmail }, 'verification: PMS lookup by email failed, falling back to local DB');
    }
  }

  // Local fallback — find guest by email, then their reservations
  const guest = await guestService.findByEmail(normalizedEmail);
  if (!guest) return [];

  const localReservations = await db
    .select()
    .from(reservations)
    .where(eq(reservations.guestId, guest.id));

  return localReservations.map((reservation) => ({ reservation, guest }));
}

/**
 * Pick the most relevant reservation from a list of local records:
 * 1. Currently checked in
 * 2. Upcoming (earliest future arrival)
 * 3. Most recent past reservation
 */
export function pickBestReservation(
  reservationList: Array<{ reservation: Reservation; guest: Guest }>,
): { reservation: Reservation; guest: Guest } | null {
  if (reservationList.length === 0) return null;

  const checkedIn = reservationList.find((r) => r.reservation.status === 'checked_in');
  if (checkedIn) return checkedIn;

  const today = now().split('T')[0]!;

  const upcoming = reservationList
    .filter((r) => r.reservation.status === 'confirmed' && r.reservation.arrivalDate >= today)
    .sort((a, b) => a.reservation.arrivalDate.localeCompare(b.reservation.arrivalDate));
  if (upcoming.length > 0) return upcoming[0]!;

  const past = reservationList
    .filter((r) => r.reservation.status === 'checked_out')
    .sort((a, b) => b.reservation.departureDate.localeCompare(a.reservation.departureDate));
  if (past.length > 0) return past[0]!;

  return reservationList[0]!;
}

/**
 * Verify a guest by confirmation number and last name.
 * Returns local Reservation + Guest on success, or a typed failure reason.
 */
export async function verifyByConfirmationAndLastName(
  confirmationNumber: string,
  lastName: string,
): Promise<VerifyResult> {
  const result = await lookupReservationByConfirmation(confirmationNumber);
  if (!result) return { ok: false, reason: 'not_found' };

  if (result.guest.lastName.toLowerCase() !== lastName.toLowerCase()) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, reservation: result.reservation, guest: result.guest };
}
