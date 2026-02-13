/**
 * WebChat Action Service
 *
 * Server-side registry of structured form actions for the webchat widget.
 * Actions are triggered by the AI (via metadata) and rendered as forms
 * by the widget. Form submissions go directly to REST endpoints — not
 * through the AI.
 *
 * @module services/webchat-action
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/registry.js';
import { webchatSessionService } from './webchat-session.js';
import { conversationService } from './conversation.js';
import { guestService } from './guest.js';
import { webchatConnectionManager } from '@/apps/channels/webchat/index.js';
import type { NormalizedReservation } from '@/core/interfaces/pms.js';

const log = createLogger('webchat-action');

// ============================================
// Types
// ============================================

export interface WebChatAction {
  id: string;
  name: string;
  triggerHint: string;
  requiresVerification: boolean;
  fields: WebChatActionField[];
  endpoint: string;
}

export interface WebChatActionField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'email' | 'tel';
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: string;
  showWhen?: {
    field: string;
    values: string[];
  };
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
  nextStep?: {
    fields: WebChatActionField[];
    context: Record<string, string>;
  };
}

// ============================================
// V1 Action Definitions
// ============================================

const actions: WebChatAction[] = [
  {
    id: 'verify-reservation',
    name: 'Verify Your Booking',
    triggerHint: 'guest wants to verify or link their booking/reservation',
    requiresVerification: false,
    fields: [
      {
        key: 'method',
        label: 'Verification Method',
        type: 'select',
        required: true,
        options: ['booking-name', 'booking-email', 'email-code'],
      },
      {
        key: 'confirmationNumber',
        label: 'Booking Reference',
        type: 'text',
        required: true,
        placeholder: 'e.g. BK-12345',
        showWhen: { field: 'method', values: ['booking-name', 'booking-email'] },
      },
      {
        key: 'lastName',
        label: 'Last Name on Booking',
        type: 'text',
        required: true,
        placeholder: 'As it appears on your reservation',
        showWhen: { field: 'method', values: ['booking-name'] },
      },
      {
        key: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
        placeholder: 'Email on your reservation',
        showWhen: { field: 'method', values: ['booking-email', 'email-code'] },
      },
    ],
    endpoint: '/api/v1/webchat/actions/verify-reservation',
  },
  {
    id: 'extend-stay',
    name: 'Extend Your Stay',
    triggerHint: 'guest wants to extend their stay or change checkout date',
    requiresVerification: true,
    fields: [
      {
        key: 'newCheckoutDate',
        label: 'New Checkout Date',
        type: 'date',
        required: true,
      },
      {
        key: 'notes',
        label: 'Special Requests',
        type: 'text',
        required: false,
        placeholder: 'Optional',
      },
    ],
    endpoint: '/api/v1/webchat/actions/extend-stay',
  },
];

// ============================================
// Service
// ============================================

const MAX_VERIFICATION_ATTEMPTS = 5;

export class WebChatActionService {
  /**
   * Get all registered actions (sent to widget on connect).
   * Endpoint URLs are stripped — the widget doesn't need them.
   */
  getActions(): Omit<WebChatAction, 'endpoint'>[] {
    return actions.map(({ endpoint: _, ...rest }) => rest);
  }

  /**
   * Get a single action by ID.
   */
  getAction(id: string): WebChatAction | undefined {
    return actions.find((a) => a.id === id);
  }

  /**
   * Execute an action. Validates session, checks verification if needed,
   * dispatches to the right handler, persists result, and broadcasts.
   */
  async execute(
    actionId: string,
    sessionToken: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    // Validate session
    const session = await webchatSessionService.validate(sessionToken);
    if (!session) {
      return { success: false, message: 'Session expired. Please refresh the page.', error: 'invalid_session' };
    }

    const action = this.getAction(actionId);
    if (!action) {
      return { success: false, message: 'Unknown action.', error: 'unknown_action' };
    }

    // Check verification requirement
    if (action.requiresVerification && session.verificationStatus !== 'verified') {
      return {
        success: false,
        message: 'Please verify your booking first.',
        error: 'verification_required',
      };
    }

    // Touch session
    await webchatSessionService.touch(session.id);

    // Dispatch to handler
    let result: ActionResult;
    switch (actionId) {
      case 'verify-reservation':
        result = await this.handleVerifyReservation(session.id, input);
        break;
      case 'extend-stay':
        result = await this.handleExtendStay(session.id, input);
        break;
      default:
        result = { success: false, message: 'Action not implemented.', error: 'not_implemented' };
    }

    // Persist result as system message and broadcast (if session has a conversation)
    if (result.success && session.conversationId) {
      try {
        await conversationService.addMessage(session.conversationId, {
          direction: 'outbound',
          senderType: 'ai',
          content: result.message,
          contentType: 'text',
        });

        webchatConnectionManager.send(session.id, {
          type: 'message',
          direction: 'outbound',
          senderType: 'ai',
          content: result.message,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        log.warn({ error, sessionId: session.id }, 'Failed to persist/broadcast action result');
      }
    }

    return result;
  }

  // ============================================
  // Verify Reservation
  // ============================================

  private async handleVerifyReservation(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const session = await webchatSessionService.findById(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found.', error: 'invalid_session' };
    }

    // Check attempt limit
    if (session.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      return {
        success: false,
        message: 'Too many verification attempts. Please start a new chat session.',
        error: 'attempts_exceeded',
      };
    }

    const method = input.method;

    if (method === 'booking-name') {
      return this.verifyByBookingName(sessionId, input);
    }
    if (method === 'booking-email') {
      return this.verifyByBookingEmail(sessionId, input);
    }
    if (method === 'email-code') {
      // Two-step: if code present it's step 2, otherwise step 1
      if (input.code) {
        return this.verifyEmailCodeStep2(sessionId, input);
      }
      return this.verifyEmailCodeStep1(sessionId, input);
    }

    return { success: false, message: 'Invalid verification method.', error: 'invalid_method' };
  }

  /**
   * Method A: Booking reference + last name
   */
  private async verifyByBookingName(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const { confirmationNumber, lastName } = input;
    if (!confirmationNumber || !lastName) {
      return { success: false, message: 'Booking reference and last name are required.', error: 'missing_fields' };
    }

    const reservation = await this.lookupByConfirmation(confirmationNumber);
    if (!reservation) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: 'No reservation found with that booking reference.', error: 'not_found' };
    }

    if (reservation.guest.lastName.toLowerCase() !== lastName.toLowerCase()) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: "The last name doesn't match our records.", error: 'mismatch' };
    }

    return this.completeVerification(sessionId, reservation);
  }

  /**
   * Method B: Booking reference + email
   */
  private async verifyByBookingEmail(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const { confirmationNumber, email } = input;
    if (!confirmationNumber || !email) {
      return { success: false, message: 'Booking reference and email are required.', error: 'missing_fields' };
    }

    const reservation = await this.lookupByConfirmation(confirmationNumber);
    if (!reservation) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: 'No reservation found with that booking reference.', error: 'not_found' };
    }

    if (!reservation.guest.email || reservation.guest.email.toLowerCase() !== email.toLowerCase()) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: "The email doesn't match our records.", error: 'mismatch' };
    }

    return this.completeVerification(sessionId, reservation);
  }

  /**
   * Method C, Step 1: Email → send verification code
   */
  private async verifyEmailCodeStep1(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const { email } = input;
    if (!email) {
      return { success: false, message: 'Email address is required.', error: 'missing_fields' };
    }

    // Search PMS for reservations matching this email
    const pmsAdapter = getAppRegistry().getActivePMSAdapter();
    if (!pmsAdapter) {
      return { success: false, message: 'Verification is temporarily unavailable.', error: 'no_pms' };
    }

    const reservations = await pmsAdapter.searchReservations({ guestEmail: email.toLowerCase() });
    if (reservations.length === 0) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: 'No reservation found for that email address.', error: 'not_found' };
    }

    // Generate 4-digit code
    const code = String(randomInt(1000, 10000));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await webchatSessionService.setVerificationCode(sessionId, codeHash, codeExpiresAt);

    // TODO: Send code via email provider. For now, log it (works with mock PMS in dev).
    log.info({ sessionId, code, email }, 'Verification code generated (email sending not yet implemented)');

    return {
      success: true,
      message: 'A 4-digit verification code has been sent to your email.',
      nextStep: {
        fields: [
          {
            key: 'code',
            label: 'Verification Code',
            type: 'text',
            required: true,
            placeholder: '4-digit code from your email',
          },
        ],
        context: { email, method: 'email-code' },
      },
    };
  }

  /**
   * Method C, Step 2: Verify the submitted code
   */
  private async verifyEmailCodeStep2(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const { email, code } = input;
    if (!email || !code) {
      return { success: false, message: 'Email and verification code are required.', error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session || !session.verificationCode || !session.verificationCodeExpiresAt) {
      return { success: false, message: 'No pending verification code. Please request a new one.', error: 'no_code' };
    }

    // Check expiry
    if (new Date(session.verificationCodeExpiresAt) <= new Date()) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: 'Verification code has expired. Please request a new one.', error: 'code_expired' };
    }

    // Constant-time comparison
    const submittedHash = createHash('sha256').update(code).digest('hex');
    const storedHash = session.verificationCode;
    const submittedBuf = Buffer.from(submittedHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');

    if (submittedBuf.length !== storedBuf.length || !timingSafeEqual(submittedBuf, storedBuf)) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: 'Invalid verification code.', error: 'code_mismatch' };
    }

    // Code matches — find the reservation by email
    const pmsAdapter = getAppRegistry().getActivePMSAdapter();
    if (!pmsAdapter) {
      return { success: false, message: 'Verification is temporarily unavailable.', error: 'no_pms' };
    }

    const reservations = await pmsAdapter.searchReservations({ guestEmail: email.toLowerCase() });
    const reservation = this.pickBestReservation(reservations);
    if (!reservation) {
      return { success: false, message: 'No reservation found.', error: 'not_found' };
    }

    return this.completeVerification(sessionId, reservation);
  }

  // ============================================
  // Extend Stay
  // ============================================

  private async handleExtendStay(
    sessionId: string,
    input: Record<string, string>,
  ): Promise<ActionResult> {
    const { newCheckoutDate, notes } = input;
    if (!newCheckoutDate) {
      return { success: false, message: 'New checkout date is required.', error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session?.reservationId) {
      return { success: false, message: 'No reservation linked to this session.', error: 'no_reservation' };
    }

    // For Phase 3, we log the request and create a task. Actual PMS modification is a future feature.
    log.info(
      { sessionId, reservationId: session.reservationId, newCheckoutDate, notes },
      'Stay extension requested',
    );

    // Format date for display (e.g. "Feb 15, 2026")
    const formatted = new Date(newCheckoutDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    return {
      success: true,
      message: `Got it! Your request to extend until ${formatted} has been submitted. Our front desk team will confirm shortly.${notes ? ` We've noted: "${notes}".` : ''} Is there anything else I can help with?`,
      data: { newCheckoutDate, reservationId: session.reservationId },
    };
  }

  // ============================================
  // Helpers
  // ============================================

  private async lookupByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null> {
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
  private pickBestReservation(reservations: NormalizedReservation[]): NormalizedReservation | null {
    if (reservations.length === 0) return null;

    // Checked in first
    const checkedIn = reservations.find((r) => r.status === 'checked_in');
    if (checkedIn) return checkedIn;

    const today = new Date().toISOString().split('T')[0]!;

    // Upcoming (confirmed, arrival in the future)
    const upcoming = reservations
      .filter((r) => r.status === 'confirmed' && r.arrivalDate >= today)
      .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
    if (upcoming.length > 0) return upcoming[0]!;

    // Most recent past
    const past = reservations
      .filter((r) => r.status === 'checked_out')
      .sort((a, b) => b.departureDate.localeCompare(a.departureDate));
    if (past.length > 0) return past[0]!;

    // Fallback: first
    return reservations[0]!;
  }

  /**
   * Complete verification: update session, link guest, broadcast update.
   */
  private async completeVerification(
    sessionId: string,
    reservation: NormalizedReservation,
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

    // Link conversation to guest if session has a conversation
    const session = await webchatSessionService.findById(sessionId);
    if (session?.conversationId) {
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
      message: `Booking verified! Welcome, ${reservation.guest.firstName}. How can I help you with your stay?`,
      data: {
        guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
        checkIn: reservation.arrivalDate,
        checkOut: reservation.departureDate,
      },
    };
  }
}

/**
 * Singleton instance
 */
export const webchatActionService = new WebChatActionService();
