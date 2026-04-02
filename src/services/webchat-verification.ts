/**
 * WebChat Verification Service
 *
 * Handles guest identity verification for the webchat widget.
 * Three methods: booking reference + last name, booking reference + email,
 * and email-code two-step (sends a one-time code, verifies it on step 2).
 *
 * Extracted from webchat-action.ts — single responsibility: verifying guests.
 *
 * @module services/webchat-verification
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/registry.js';
import { webchatSessionService } from './webchat-session.js';
import { conversationService } from './conversation.js';
import { guestService } from './guest.js';
import { webchatConnectionManager } from '@/apps/channels/webchat/index.js';
import { t } from '@/locales/webchat/index.js';
import type { SupportedLocale } from '@/locales/webchat/index.js';
import type { NormalizedReservation } from '@jack/shared';
import type { ActionResult } from './webchat-action.js';
import { now } from '@/utils/time.js';

const log = createLogger('webchat-verification');

// ============================================
// Constants
// ============================================

export const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_CODE_REQUESTS_PER_HOUR = 3;
const MAX_CODE_REQUESTS_PER_EMAIL_PER_HOUR = 5;

// ============================================
// Rate-limit state
// ============================================

/** Sliding-window tracker for email verification code requests per session */
const codeRequestTimestamps = new Map<string, number[]>();
/** Sliding-window tracker for code requests per email (cross-session) */
const emailCodeRequestTimestamps = new Map<string, number[]>();

// ============================================
// Entry point
// ============================================

/**
 * Dispatch to the correct verification method based on `input.method`.
 * Guards: session existence and attempt limit are checked here.
 */
export async function verifyReservation(
  sessionId: string,
  input: Record<string, string>,
  locale: SupportedLocale,
): Promise<ActionResult> {
  const session = await webchatSessionService.findById(sessionId);
  if (!session) {
    return { success: false, message: t(locale, 'messages.sessionNotFound'), error: 'invalid_session' };
  }

  if (session.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    return {
      success: false,
      message: t(locale, 'messages.tooManyAttempts'),
      error: 'attempts_exceeded',
    };
  }

  const method = input.method;

  if (method === 'booking-name') {
    return verifyByBookingName(sessionId, input, locale);
  }
  if (method === 'booking-email') {
    return verifyByBookingEmail(sessionId, input, locale);
  }
  if (method === 'email-code') {
    // Two-step: if code present it's step 2, otherwise step 1
    if (input.code) {
      return verifyEmailCodeStep2(sessionId, input, locale);
    }
    return verifyEmailCodeStep1(sessionId, input, locale);
  }

  return { success: false, message: t(locale, 'messages.invalidMethod'), error: 'invalid_method' };
}

// ============================================
// Method A: Booking reference + last name
// ============================================

async function verifyByBookingName(
  sessionId: string,
  input: Record<string, string>,
  locale: SupportedLocale,
): Promise<ActionResult> {
  const { confirmationNumber, lastName } = input;
  if (!confirmationNumber || !lastName) {
    return { success: false, message: t(locale, 'messages.missingBookingRef'), error: 'missing_fields' };
  }

  const reservation = await lookupByConfirmation(confirmationNumber);
  if (!reservation) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.noReservationFound'), error: 'not_found' };
  }

  if (reservation.guest.lastName.toLowerCase() !== lastName.toLowerCase()) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.lastNameMismatch'), error: 'mismatch' };
  }

  return completeVerification(sessionId, reservation, locale);
}

// ============================================
// Method B: Booking reference + email
// ============================================

async function verifyByBookingEmail(
  sessionId: string,
  input: Record<string, string>,
  locale: SupportedLocale,
): Promise<ActionResult> {
  const { confirmationNumber, email } = input;
  if (!confirmationNumber || !email) {
    return { success: false, message: t(locale, 'messages.missingBookingEmail'), error: 'missing_fields' };
  }

  const reservation = await lookupByConfirmation(confirmationNumber);
  if (!reservation) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.noReservationFound'), error: 'not_found' };
  }

  if (!reservation.guest.email || reservation.guest.email.toLowerCase() !== email.toLowerCase()) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.emailMismatch'), error: 'mismatch' };
  }

  return completeVerification(sessionId, reservation, locale);
}

// ============================================
// Method C, Step 1: Email → send verification code
// ============================================

async function verifyEmailCodeStep1(
  sessionId: string,
  input: Record<string, string>,
  locale: SupportedLocale,
): Promise<ActionResult> {
  const { email } = input;
  if (!email) {
    return { success: false, message: t(locale, 'messages.missingEmail'), error: 'missing_fields' };
  }

  const pmsAdapter = getAppRegistry().getActivePMSAdapter();
  if (!pmsAdapter) {
    return { success: false, message: t(locale, 'messages.verificationUnavailable'), error: 'no_pms' };
  }

  const reservations = await pmsAdapter.searchReservations({ guestEmail: email.toLowerCase() });
  if (reservations.length === 0) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.noReservationForEmail'), error: 'not_found' };
  }

  // Rate limit: per session and per email
  const tsNow = Date.now();
  let codeTs = codeRequestTimestamps.get(sessionId) ?? [];
  codeTs = codeTs.filter((ts) => tsNow - ts < 60 * 60 * 1000);
  if (codeTs.length >= MAX_CODE_REQUESTS_PER_HOUR) {
    return { success: false, message: t(locale, 'messages.tooManyCodeRequests'), error: 'rate_limited' };
  }

  const emailKey = email.toLowerCase();
  let emailTs = emailCodeRequestTimestamps.get(emailKey) ?? [];
  emailTs = emailTs.filter((ts) => tsNow - ts < 60 * 60 * 1000);
  if (emailTs.length >= MAX_CODE_REQUESTS_PER_EMAIL_PER_HOUR) {
    return { success: false, message: t(locale, 'messages.tooManyCodeRequestsEmail'), error: 'rate_limited' };
  }

  codeTs.push(tsNow);
  codeRequestTimestamps.set(sessionId, codeTs);
  emailTs.push(tsNow);
  emailCodeRequestTimestamps.set(emailKey, emailTs);

  // Generate 6-digit code
  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash('sha256').update(code).digest('hex');
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  await webchatSessionService.setVerificationCode(sessionId, codeHash, codeExpiresAt);

  // TODO: Send code via email provider. For now, log it (works with mock PMS in dev).
  log.info({ sessionId, code, email }, 'Verification code generated (email sending not yet implemented)');

  return {
    success: true,
    message: t(locale, 'messages.codeSent'),
    nextStep: {
      fields: [
        {
          key: 'code',
          label: t(locale, 'actions.verifyReservation.fields.code.label'),
          type: 'text',
          required: true,
          placeholder: t(locale, 'actions.verifyReservation.fields.code.placeholder'),
        },
      ],
      context: { email, method: 'email-code' },
    },
  };
}

// ============================================
// Method C, Step 2: Verify the submitted code
// ============================================

async function verifyEmailCodeStep2(
  sessionId: string,
  input: Record<string, string>,
  locale: SupportedLocale,
): Promise<ActionResult> {
  const { email, code } = input;
  if (!email || !code) {
    return { success: false, message: t(locale, 'messages.missingEmailAndCode'), error: 'missing_fields' };
  }

  const session = await webchatSessionService.findById(sessionId);
  if (!session || !session.verificationCode || !session.verificationCodeExpiresAt) {
    return { success: false, message: t(locale, 'messages.noPendingCode'), error: 'no_code' };
  }

  // Check expiry
  if (new Date(session.verificationCodeExpiresAt) <= new Date()) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.codeExpired'), error: 'code_expired' };
  }

  // Constant-time comparison
  const submittedHash = createHash('sha256').update(code).digest('hex');
  const storedHash = session.verificationCode;
  const submittedBuf = Buffer.from(submittedHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (submittedBuf.length !== storedBuf.length || !timingSafeEqual(submittedBuf, storedBuf)) {
    await webchatSessionService.incrementVerificationAttempts(sessionId);
    return { success: false, message: t(locale, 'messages.invalidCode'), error: 'code_mismatch' };
  }

  // Code matches — find the reservation by email
  const pmsAdapter = getAppRegistry().getActivePMSAdapter();
  if (!pmsAdapter) {
    return { success: false, message: t(locale, 'messages.verificationUnavailable'), error: 'no_pms' };
  }

  const reservations = await pmsAdapter.searchReservations({ guestEmail: email.toLowerCase() });
  const reservation = pickBestReservation(reservations);
  if (!reservation) {
    return { success: false, message: t(locale, 'messages.noReservationFoundGeneric'), error: 'not_found' };
  }

  return completeVerification(sessionId, reservation, locale);
}

// ============================================
// Helpers
// ============================================

async function lookupByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null> {
  const pmsAdapter = getAppRegistry().getActivePMSAdapter();
  if (!pmsAdapter) {
    log.warn('No PMS adapter configured for verification');
    return null;
  }
  return pmsAdapter.getReservationByConfirmation(confirmationNumber);
}

/**
 * Pick the most relevant reservation from a list:
 * 1. Currently checked in
 * 2. Upcoming (earliest future arrival)
 * 3. Most recent past reservation
 */
export function pickBestReservation(reservations: NormalizedReservation[]): NormalizedReservation | null {
  if (reservations.length === 0) return null;

  const checkedIn = reservations.find((r) => r.status === 'checked_in');
  if (checkedIn) return checkedIn;

  const today = now().split('T')[0]!;

  const upcoming = reservations
    .filter((r) => r.status === 'confirmed' && r.arrivalDate >= today)
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
  if (upcoming.length > 0) return upcoming[0]!;

  const past = reservations
    .filter((r) => r.status === 'checked_out')
    .sort((a, b) => b.departureDate.localeCompare(a.departureDate));
  if (past.length > 0) return past[0]!;

  return reservations[0]!;
}

/**
 * Complete verification: find/create guest, update session, restore conversation, broadcast.
 */
async function completeVerification(
  sessionId: string,
  reservation: NormalizedReservation,
  locale: SupportedLocale = 'en',
): Promise<ActionResult> {
  // Find or create guest in our DB
  let guest = reservation.guest.email
    ? await guestService.findByEmail(reservation.guest.email)
    : null;

  if (!guest && reservation.guest.phone) {
    guest = await guestService.findByPhone(reservation.guest.phone);
  }

  if (!guest) {
    guest = await guestService.create({
      firstName: reservation.guest.firstName,
      lastName: reservation.guest.lastName,
      email: reservation.guest.email,
      phone: reservation.guest.phone,
    });
  }

  // Update session with verification + stay-aware expiry
  await webchatSessionService.verify(
    sessionId,
    guest.id,
    reservation.externalId,
    reservation.arrivalDate,
    reservation.departureDate,
  );

  // Restore previous conversation if this guest has one on webchat
  const session = await webchatSessionService.findById(sessionId);
  const previousConv = await conversationService.findByGuestAndChannel(guest.id, 'webchat');

  if (previousConv && session?.conversationId && session.conversationId !== previousConv.id) {
    // Move current session's messages into the previous conversation
    await conversationService.moveMessages(session.conversationId, previousConv.id);

    // Link session to the previous conversation
    await webchatSessionService.linkConversation(sessionId, previousConv.id);
    await conversationService.update(previousConv.id, {
      guestId: guest.id,
      metadata: { reservationId: reservation.externalId },
    });

    // Send merged history (old + current messages, chronological)
    try {
      const history = await conversationService.getMessages(previousConv.id, { limit: 50 });
      webchatConnectionManager.send(sessionId, {
        type: 'history',
        messages: history.map((m) => ({
          direction: m.direction,
          senderType: m.senderType,
          content: m.content,
          timestamp: m.createdAt,
        })),
      });
    } catch (error) {
      log.warn({ error, sessionId, conversationId: previousConv.id }, 'Failed to send restored history');
    }
  } else if (session?.conversationId) {
    // No previous conversation — just link current one to guest
    await conversationService.update(session.conversationId, {
      guestId: guest.id,
      metadata: { reservationId: reservation.externalId },
    });
  }

  // Broadcast session update to all tabs
  webchatConnectionManager.send(sessionId, {
    type: 'session_update',
    verificationStatus: 'verified',
  });

  log.info(
    { sessionId, guestId: guest.id, reservationId: reservation.externalId },
    'Reservation verified',
  );

  return {
    success: true,
    message: t(locale, 'messages.verifiedWelcome', { firstName: reservation.guest.firstName }),
    data: {
      guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
      checkIn: reservation.arrivalDate,
      checkOut: reservation.departureDate,
    },
  };
}

// ============================================
// Rate-limit map maintenance
// ============================================

/**
 * Clean up stale rate-limit entries (entries older than 1 hour).
 * Called periodically by the scheduler.
 */
export function cleanupRateLimitMaps(): number {
  const tsNow = Date.now();
  const hour = 60 * 60 * 1000;
  let cleaned = 0;

  for (const [key, timestamps] of codeRequestTimestamps) {
    const fresh = timestamps.filter((ts) => tsNow - ts < hour);
    if (fresh.length === 0) { codeRequestTimestamps.delete(key); cleaned++; }
    else { codeRequestTimestamps.set(key, fresh); }
  }

  for (const [key, timestamps] of emailCodeRequestTimestamps) {
    const fresh = timestamps.filter((ts) => tsNow - ts < hour);
    if (fresh.length === 0) { emailCodeRequestTimestamps.delete(key); cleaned++; }
    else { emailCodeRequestTimestamps.set(key, fresh); }
  }

  return cleaned;
}
