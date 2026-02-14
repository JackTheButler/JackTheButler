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
import { appConfigService } from './app-config.js';
import { webchatSessionService } from './webchat-session.js';
import { conversationService } from './conversation.js';
import { guestService } from './guest.js';
import { webchatConnectionManager, getSessionLocale } from '@/apps/channels/webchat/index.js';
import { t } from '@/locales/webchat/index.js';
import type { SupportedLocale } from '@/locales/webchat/index.js';
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
  optionLabels?: string[];
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
  {
    id: 'request-service',
    name: 'Request a Service',
    triggerHint: 'guest wants housekeeping, towels, pillows, amenities, or maintenance',
    requiresVerification: true,
    fields: [
      {
        key: 'serviceType',
        label: 'Service Type',
        type: 'select',
        required: true,
        options: ['housekeeping', 'extra-towels', 'extra-pillows', 'amenities', 'maintenance', 'other'],
      },
      {
        key: 'details',
        label: 'Details',
        type: 'text',
        required: false,
        placeholder: 'Any specific details',
      },
      {
        key: 'urgency',
        label: 'Urgency',
        type: 'select',
        required: true,
        options: ['normal', 'urgent'],
      },
    ],
    endpoint: '/api/v1/webchat/actions/request-service',
  },
  {
    id: 'order-room-service',
    name: 'Order Room Service',
    triggerHint: 'guest wants to order food or beverages to their room',
    requiresVerification: true,
    fields: [
      {
        key: 'items',
        label: 'What would you like to order?',
        type: 'text',
        required: true,
        placeholder: 'e.g. Caesar salad, club sandwich, sparkling water',
      },
      {
        key: 'specialInstructions',
        label: 'Special Instructions',
        type: 'text',
        required: false,
        placeholder: 'Allergies, preferences, etc.',
      },
    ],
    endpoint: '/api/v1/webchat/actions/order-room-service',
  },
  {
    id: 'book-spa',
    name: 'Book Spa Treatment',
    triggerHint: 'guest wants to book a spa treatment or massage',
    requiresVerification: true,
    fields: [
      {
        key: 'treatment',
        label: 'Treatment',
        type: 'select',
        required: true,
        options: ['massage', 'facial', 'body-wrap', 'manicure-pedicure', 'other'],
      },
      {
        key: 'preferredDate',
        label: 'Preferred Date',
        type: 'date',
        required: true,
      },
      {
        key: 'preferredTime',
        label: 'Preferred Time',
        type: 'select',
        required: true,
        options: ['morning', 'midday', 'afternoon', 'evening'],
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'text',
        required: false,
        placeholder: 'Any preferences or requests',
      },
    ],
    endpoint: '/api/v1/webchat/actions/book-spa',
  },
];

// ============================================
// Action ID → translation key mapping
// ============================================

const actionTranslationKeys: Record<string, string> = {
  'verify-reservation': 'verifyReservation',
  'extend-stay': 'extendStay',
  'request-service': 'requestService',
  'order-room-service': 'orderRoomService',
  'book-spa': 'bookSpa',
};

/**
 * Localize an action's display strings (name, field labels, placeholders, option labels).
 * Machine identifiers (field.key, field.options values, triggerHint) stay in English.
 */
function localizeAction(
  action: Omit<WebChatAction, 'endpoint'>,
  locale: SupportedLocale,
): Omit<WebChatAction, 'endpoint'> {
  if (locale === 'en') return action;

  const actionKey = actionTranslationKeys[action.id];
  if (!actionKey) return action;

  const prefix = `actions.${actionKey}`;

  return {
    ...action,
    name: t(locale, `${prefix}.name`) || action.name,
    fields: action.fields.map((field) => {
      const fieldPrefix = `${prefix}.fields.${field.key}`;
      const localized: WebChatActionField = {
        ...field,
        label: t(locale, `${fieldPrefix}.label`) || field.label,
      };

      const placeholder = t(locale, `${fieldPrefix}.placeholder`);
      if (placeholder && placeholder !== `${fieldPrefix}.placeholder`) {
        localized.placeholder = placeholder;
      }

      // Translate option display labels (values stay English)
      if (field.options?.length) {
        localized.optionLabels = field.options.map((opt) => {
          const translated = t(locale, `${fieldPrefix}.options.${opt}`);
          return translated !== `${fieldPrefix}.options.${opt}` ? translated : opt.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        });
      }

      return localized;
    }),
  };
}

// ============================================
// Service
// ============================================

const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_INPUT_FIELD_LENGTH = 500;
const MAX_CODE_REQUESTS_PER_HOUR = 3;
const MAX_CODE_REQUESTS_PER_EMAIL_PER_HOUR = 5;

/** Sliding-window tracker for email verification code requests per session */
const codeRequestTimestamps = new Map<string, number[]>();
/** Sliding-window tracker for code requests per email (cross-session) */
const emailCodeRequestTimestamps = new Map<string, number[]>();

export class WebChatActionService {
  /**
   * Get all registered actions (sent to widget on connect).
   * Endpoint URLs are stripped — the widget doesn't need them.
   */
  getActions(locale?: SupportedLocale): Omit<WebChatAction, 'endpoint'>[] {
    const stripped = actions.map(({ endpoint: _, ...rest }) => rest);
    if (!locale || locale === 'en') return stripped;
    return stripped.map((a) => localizeAction(a, locale));
  }

  /**
   * Get enabled actions filtered by webchat config.
   * If no enabledActions filter is configured, returns all actions (backward compat).
   * Auto-includes verify-reservation if any requiresVerification action is enabled.
   */
  async getEnabledActions(locale?: SupportedLocale): Promise<Omit<WebChatAction, 'endpoint'>[]> {
    const appConfig = await appConfigService.getAppConfig('channel-webchat');
    const enabledStr = appConfig?.config?.enabledActions as string | undefined;

    if (!enabledStr?.trim()) {
      // No filter configured — return all
      return this.getActions(locale);
    }

    const enabledSet = new Set(
      enabledStr.split(',').map((s) => s.trim()).filter(Boolean)
    );

    // Auto-include verify-reservation if any enabled action requires verification
    const needsVerify = actions.some(
      (a) => enabledSet.has(a.id) && a.requiresVerification
    );
    if (needsVerify) {
      enabledSet.add('verify-reservation');
    }

    return this.getActions(locale).filter((a) => enabledSet.has(a.id));
  }

  /**
   * Check if a specific action is enabled.
   */
  async isActionEnabled(actionId: string): Promise<boolean> {
    const enabled = await this.getEnabledActions();
    return enabled.some((a) => a.id === actionId);
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
    // Check if action is enabled
    if (!await this.isActionEnabled(actionId)) {
      return { success: false, message: t('en', 'messages.actionDisabled'), error: 'action_disabled' };
    }

    // Validate session
    const session = await webchatSessionService.validate(sessionToken);
    if (!session) {
      return { success: false, message: t('en', 'messages.sessionExpired'), error: 'invalid_session' };
    }

    // Get locale from the WS session
    const locale = getSessionLocale(session.id);

    const action = this.getAction(actionId);
    if (!action) {
      return { success: false, message: t(locale, 'messages.unknownAction'), error: 'unknown_action' };
    }

    // Check verification requirement
    if (action.requiresVerification && session.verificationStatus !== 'verified') {
      return {
        success: false,
        message: t(locale, 'messages.verificationRequired'),
        error: 'verification_required',
      };
    }

    // 8E: Validate input field lengths
    for (const field of action.fields) {
      const value = input[field.key];
      if (value && value.length > MAX_INPUT_FIELD_LENGTH) {
        return { success: false, message: t(locale, 'messages.inputTooLong', { field: field.label, max: String(MAX_INPUT_FIELD_LENGTH) }), error: 'input_too_long' };
      }
    }

    // Touch session
    await webchatSessionService.touch(session.id);

    // Dispatch to handler
    let result: ActionResult;
    switch (actionId) {
      case 'verify-reservation':
        result = await this.handleVerifyReservation(session.id, input, locale);
        break;
      case 'extend-stay':
        result = await this.handleExtendStay(session.id, input, locale);
        break;
      case 'request-service':
        result = await this.handleRequestService(session.id, input, locale);
        break;
      case 'order-room-service':
        result = await this.handleOrderRoomService(session.id, input, locale);
        break;
      case 'book-spa':
        result = await this.handleBookSpa(session.id, input, locale);
        break;
      default:
        result = { success: false, message: t(locale, 'messages.actionNotImplemented'), error: 'not_implemented' };
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
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const session = await webchatSessionService.findById(sessionId);
    if (!session) {
      return { success: false, message: t(locale, 'messages.sessionNotFound'), error: 'invalid_session' };
    }

    // Check attempt limit
    if (session.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      return {
        success: false,
        message: t(locale, 'messages.tooManyAttempts'),
        error: 'attempts_exceeded',
      };
    }

    const method = input.method;

    if (method === 'booking-name') {
      return this.verifyByBookingName(sessionId, input, locale);
    }
    if (method === 'booking-email') {
      return this.verifyByBookingEmail(sessionId, input, locale);
    }
    if (method === 'email-code') {
      // Two-step: if code present it's step 2, otherwise step 1
      if (input.code) {
        return this.verifyEmailCodeStep2(sessionId, input, locale);
      }
      return this.verifyEmailCodeStep1(sessionId, input, locale);
    }

    return { success: false, message: t(locale, 'messages.invalidMethod'), error: 'invalid_method' };
  }

  /**
   * Method A: Booking reference + last name
   */
  private async verifyByBookingName(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { confirmationNumber, lastName } = input;
    if (!confirmationNumber || !lastName) {
      return { success: false, message: t(locale, 'messages.missingBookingRef'), error: 'missing_fields' };
    }

    const reservation = await this.lookupByConfirmation(confirmationNumber);
    if (!reservation) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: t(locale, 'messages.noReservationFound'), error: 'not_found' };
    }

    if (reservation.guest.lastName.toLowerCase() !== lastName.toLowerCase()) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: t(locale, 'messages.lastNameMismatch'), error: 'mismatch' };
    }

    return this.completeVerification(sessionId, reservation, locale);
  }

  /**
   * Method B: Booking reference + email
   */
  private async verifyByBookingEmail(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { confirmationNumber, email } = input;
    if (!confirmationNumber || !email) {
      return { success: false, message: t(locale, 'messages.missingBookingEmail'), error: 'missing_fields' };
    }

    const reservation = await this.lookupByConfirmation(confirmationNumber);
    if (!reservation) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: t(locale, 'messages.noReservationFound'), error: 'not_found' };
    }

    if (!reservation.guest.email || reservation.guest.email.toLowerCase() !== email.toLowerCase()) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: t(locale, 'messages.emailMismatch'), error: 'mismatch' };
    }

    return this.completeVerification(sessionId, reservation, locale);
  }

  /**
   * Method C, Step 1: Email → send verification code
   */
  private async verifyEmailCodeStep1(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { email } = input;
    if (!email) {
      return { success: false, message: t(locale, 'messages.missingEmail'), error: 'missing_fields' };
    }

    // Search PMS for reservations matching this email
    const pmsAdapter = getAppRegistry().getActivePMSAdapter();
    if (!pmsAdapter) {
      return { success: false, message: t(locale, 'messages.verificationUnavailable'), error: 'no_pms' };
    }

    const reservations = await pmsAdapter.searchReservations({ guestEmail: email.toLowerCase() });
    if (reservations.length === 0) {
      await webchatSessionService.incrementVerificationAttempts(sessionId);
      return { success: false, message: t(locale, 'messages.noReservationForEmail'), error: 'not_found' };
    }

    // 8F: Rate limit code generation — per session and per email
    const now = Date.now();
    let codeTs = codeRequestTimestamps.get(sessionId) || [];
    codeTs = codeTs.filter((ts) => now - ts < 60 * 60 * 1000);
    if (codeTs.length >= MAX_CODE_REQUESTS_PER_HOUR) {
      return { success: false, message: t(locale, 'messages.tooManyCodeRequests'), error: 'rate_limited' };
    }

    const emailKey = email.toLowerCase();
    let emailTs = emailCodeRequestTimestamps.get(emailKey) || [];
    emailTs = emailTs.filter((ts) => now - ts < 60 * 60 * 1000);
    if (emailTs.length >= MAX_CODE_REQUESTS_PER_EMAIL_PER_HOUR) {
      return { success: false, message: t(locale, 'messages.tooManyCodeRequestsEmail'), error: 'rate_limited' };
    }

    codeTs.push(now);
    codeRequestTimestamps.set(sessionId, codeTs);
    emailTs.push(now);
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

  /**
   * Method C, Step 2: Verify the submitted code
   */
  private async verifyEmailCodeStep2(
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
    const reservation = this.pickBestReservation(reservations);
    if (!reservation) {
      return { success: false, message: t(locale, 'messages.noReservationFoundGeneric'), error: 'not_found' };
    }

    return this.completeVerification(sessionId, reservation, locale);
  }

  // ============================================
  // Extend Stay
  // ============================================

  private async handleExtendStay(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { newCheckoutDate, notes } = input;
    if (!newCheckoutDate) {
      return { success: false, message: t(locale, 'messages.missingCheckoutDate'), error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session?.reservationId) {
      return { success: false, message: t(locale, 'messages.noReservationLinked'), error: 'no_reservation' };
    }

    // For Phase 3, we log the request and create a task. Actual PMS modification is a future feature.
    log.info(
      { sessionId, reservationId: session.reservationId, newCheckoutDate, notes },
      'Stay extension requested',
    );

    // Format date for display using session locale
    const localeTag = locale === 'en' ? 'en-US' : locale;
    const formatted = new Date(newCheckoutDate + 'T00:00:00').toLocaleDateString(localeTag, {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    let message = t(locale, 'messages.extendStaySuccess', { date: formatted });
    if (notes) message += t(locale, 'messages.extendStayNotes', { notes });
    message += t(locale, 'messages.extendStayAnythingElse');

    return {
      success: true,
      message,
      data: { newCheckoutDate, reservationId: session.reservationId },
    };
  }

  // ============================================
  // Request Service
  // ============================================

  private async handleRequestService(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { serviceType, details, urgency } = input;
    if (!serviceType) {
      return { success: false, message: t(locale, 'messages.missingServiceType'), error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session?.reservationId) {
      return { success: false, message: t(locale, 'messages.noReservationLinked'), error: 'no_reservation' };
    }

    // Use translated option label if available, otherwise humanize the key
    const serviceLabel = t(locale, `actions.requestService.fields.serviceType.options.${serviceType}`);
    const label = serviceLabel !== `actions.requestService.fields.serviceType.options.${serviceType}`
      ? serviceLabel
      : serviceType.replace(/-/g, ' ');

    log.info(
      { sessionId, reservationId: session.reservationId, serviceType, urgency, details },
      'Service requested',
    );

    const urgencyStr = urgency === 'urgent' ? t(locale, 'messages.serviceRequestUrgent') : '';
    let message = t(locale, 'messages.serviceRequestSuccess', { service: label, urgency: urgencyStr });
    if (details) message += t(locale, 'messages.serviceRequestDetails', { details });
    message += t(locale, 'messages.serviceRequestAnythingElse');

    return {
      success: true,
      message,
      data: { serviceType, urgency, reservationId: session.reservationId },
    };
  }

  // ============================================
  // Order Room Service
  // ============================================

  private async handleOrderRoomService(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { items, specialInstructions } = input;
    if (!items) {
      return { success: false, message: t(locale, 'messages.missingOrderItems'), error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session?.reservationId) {
      return { success: false, message: t(locale, 'messages.noReservationLinked'), error: 'no_reservation' };
    }

    log.info(
      { sessionId, reservationId: session.reservationId, items, specialInstructions },
      'Room service ordered',
    );

    let message = t(locale, 'messages.roomServiceSuccess');
    if (specialInstructions) message += t(locale, 'messages.roomServiceInstructions', { instructions: specialInstructions });
    message += t(locale, 'messages.roomServiceAnythingElse');

    return {
      success: true,
      message,
      data: { items, reservationId: session.reservationId },
    };
  }

  // ============================================
  // Book Spa
  // ============================================

  private async handleBookSpa(
    sessionId: string,
    input: Record<string, string>,
    locale: SupportedLocale,
  ): Promise<ActionResult> {
    const { treatment, preferredDate, preferredTime, notes } = input;
    if (!treatment || !preferredDate || !preferredTime) {
      return { success: false, message: t(locale, 'messages.missingSpaFields'), error: 'missing_fields' };
    }

    const session = await webchatSessionService.findById(sessionId);
    if (!session?.reservationId) {
      return { success: false, message: t(locale, 'messages.noReservationLinked'), error: 'no_reservation' };
    }

    // Use translated option label if available
    const treatmentLabel = t(locale, `actions.bookSpa.fields.treatment.options.${treatment}`);
    const label = treatmentLabel !== `actions.bookSpa.fields.treatment.options.${treatment}`
      ? treatmentLabel
      : treatment.replace(/-/g, ' ');

    const timeLabel = t(locale, `actions.bookSpa.fields.preferredTime.options.${preferredTime}`);
    const timeStr = timeLabel !== `actions.bookSpa.fields.preferredTime.options.${preferredTime}`
      ? timeLabel
      : preferredTime;

    const localeTag = locale === 'en' ? 'en-US' : locale;
    const formatted = new Date(preferredDate + 'T00:00:00').toLocaleDateString(localeTag, {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    log.info(
      { sessionId, reservationId: session.reservationId, treatment, preferredDate, preferredTime, notes },
      'Spa booking requested',
    );

    let message = t(locale, 'messages.spaBookingSuccess', { treatment: label, date: formatted, time: timeStr });
    if (notes) message += t(locale, 'messages.spaBookingNotes', { notes });
    message += t(locale, 'messages.spaBookingAnythingElse');

    return {
      success: true,
      message,
      data: { treatment, preferredDate, preferredTime, reservationId: session.reservationId },
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
}

/**
 * Singleton instance
 */
export const webchatActionService = new WebChatActionService();

/**
 * Clean up stale rate-limit entries (entries older than 1 hour).
 * Called periodically by the scheduler.
 */
export function cleanupRateLimitMaps(): number {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let cleaned = 0;

  for (const [key, timestamps] of codeRequestTimestamps) {
    const fresh = timestamps.filter((t) => now - t < hour);
    if (fresh.length === 0) { codeRequestTimestamps.delete(key); cleaned++; }
    else { codeRequestTimestamps.set(key, fresh); }
  }

  for (const [key, timestamps] of emailCodeRequestTimestamps) {
    const fresh = timestamps.filter((t) => now - t < hour);
    if (fresh.length === 0) { emailCodeRequestTimestamps.delete(key); cleaned++; }
    else { emailCodeRequestTimestamps.set(key, fresh); }
  }

  return cleaned;
}
