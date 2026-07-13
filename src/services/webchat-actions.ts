/**
 * WebChat Action Service
 *
 * Server-side registry of structured form actions for the webchat widget.
 * Actions are triggered by the AI (via metadata) and rendered as forms
 * by the widget. Form submissions go directly to REST endpoints — not
 * through the AI.
 *
 * @module apps/channels/webchat/actions
 */

import { createLogger } from '@/utils/logger.js';
import { webchatSessionService } from '@/services/webchat-session.js';
import { conversationService } from '@/services/conversation.js';
import { webchatConnectionManager, getSessionLocale } from '@/apps/channels/webchat/connections.js';
import { t } from '@/locales/webchat/index.js';
import type { SupportedLocale } from '@/locales/webchat/index.js';
import { verifyReservation } from './webchat-verification.js';
import { now } from '@/utils/time.js';

// Re-export so scheduler.ts import path stays unchanged
export { cleanupRateLimitMaps } from './webchat-verification.js';

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
];

// ============================================
// Action ID → translation key mapping
// ============================================

const actionTranslationKeys: Record<string, string> = {
  'verify-reservation': 'verifyReservation',
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

const MAX_INPUT_FIELD_LENGTH = 500;

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

    // Validate input field lengths
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
        result = await verifyReservation(session.id, input, locale);
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
          timestamp: now(),
        });
      } catch (error) {
        log.warn({ error, sessionId: session.id }, 'Failed to persist/broadcast action result');
      }
    }

    return result;
  }

}

/**
 * Singleton instance
 */
export const webchatActionService = new WebChatActionService();
