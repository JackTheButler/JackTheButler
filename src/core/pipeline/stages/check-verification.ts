/**
 * Check Verification Stage
 *
 * Handles in-conversation guest identity verification for channels that lack
 * a UI form (Telegram, WhatsApp without phone match, etc.).
 *
 * Runs only when the intent is `verification.provide_credentials`.
 * Extracts credentials from free text, merges with any previously stored
 * partial state, and attempts PMS lookup when both fields are present.
 *
 * Partial state and attempt count are persisted in conversation.metadata.verification.
 * ctx.verification is set so the AI responder knows what to say.
 */

import { getAppRegistry } from '@/apps/index.js';
import { conversationService } from '@/services/conversation.js';
import { guestContextService } from '@/core/conversation/guest-context.js';
import {
  verifyByConfirmationAndLastName,
  MAX_VERIFICATION_ATTEMPTS,
  type VerificationState,
} from '@/services/verification.js';
import { createLogger } from '@/utils/logger.js';
import type { LLMProvider } from '@/core/ai/types.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

// ─── Credential extraction ────────────────────────────────────────────────────

/**
 * Use a utility AI call to extract last name and/or confirmation number
 * from a free-text message. Returns only the fields that are clearly present.
 */
async function extractCredentials(
  message: string,
  provider: LLMProvider,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ lastName?: string; confirmationNumber?: string }> {
  try {
    let extracted: { lastName?: string; confirmationNumber?: string } = {};

    const historyMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> =
      history && history.length > 0 ? history : [];

    const response = await provider.complete({
      messages: [
        {
          role: 'system',
          content:
            'Extract hotel guest verification credentials from the conversation below.\n' +
            'Return JSON only: { "lastName": "...", "confirmationNumber": "..." }\n' +
            'Omit any field that is not clearly present in the conversation.',
        },
        ...historyMessages,
        { role: 'user', content: message },
      ],
      maxTokens: 80,
      temperature: 0,
      modelTier: 'utility',
      purpose: 'credential_extraction',
      onComplete: (content) => {
        log.info({ rawContent: content }, 'checkVerification: raw AI extraction response');
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
          log.warn({ rawContent: content }, 'checkVerification: no JSON found in extraction response');
        } else {
          try {
            extracted = JSON.parse(match[0]) as { lastName?: string; confirmationNumber?: string };
            log.info({ extracted }, 'checkVerification: parsed extracted credentials');
          } catch (err) {
            log.warn({ err, matched: match[0] }, 'checkVerification: JSON parse failed');
          }
        }
        return {
          lastName: extracted.lastName,
          confirmationNumber: extracted.confirmationNumber,
        };
      },
    });

    // Fallback parse if onComplete didn't fire (some providers skip it)
    if (!extracted.lastName && !extracted.confirmationNumber) {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          extracted = JSON.parse(match[0]) as { lastName?: string; confirmationNumber?: string };
        } catch {
          log.warn({ rawContent: response.content }, 'Credential extraction: failed to parse JSON');
        }
      }
    }

    return extracted;
  } catch (err) {
    log.warn({ err }, 'Credential extraction failed');
    return {};
  }
}

// ─── Stage ───────────────────────────────────────────────────────────────────

export async function checkVerification(ctx: MessageContext): Promise<void> {
  log.debug(
    { intent: ctx.classification?.intent, conversationId: ctx.conversation?.id },
    'checkVerification: entered'
  );

  if (ctx.classification?.intent !== 'verification.provide_credentials') {
    log.debug({ intent: ctx.classification?.intent }, 'checkVerification: skipped — intent is not verification.provide_credentials');
    return;
  }
  if (!ctx.conversation) return;

  const provider = getAppRegistry().getActiveAIProvider();
  if (!provider) return;

  // Load previously stored partial state from conversation metadata
  const meta = JSON.parse(ctx.conversation.metadata || '{}') as { verification?: VerificationState };
  const stored = meta.verification ?? { attempts: 0 };
  log.debug({ stored }, 'checkVerification: loaded stored state');

  // Bail out early if already at max attempts
  if (stored.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    ctx.verification = { attempts: stored.attempts };
    return;
  }

  // Extract credentials from the current message
  const text = ctx.translatedContent ?? ctx.inbound.content;
  const extracted = await extractCredentials(text, provider, ctx.conversationHistory);

  // Merge extracted fields with previously stored partial state
  const merged: VerificationState = { attempts: stored.attempts };
  const mergedLastName = extracted.lastName ?? stored.lastName;
  const mergedConfirmation = extracted.confirmationNumber ?? stored.confirmationNumber;
  if (mergedLastName) merged.lastName = mergedLastName;
  if (mergedConfirmation) merged.confirmationNumber = mergedConfirmation;

  log.debug({ merged, stored }, 'Verification state after merge');

  // Attempt full verification only when both fields are present
  if (merged.lastName && merged.confirmationNumber) {
    const result = await verifyByConfirmationAndLastName(merged.confirmationNumber, merged.lastName);

    if (result.ok) {
      // Success — link guest + reservation to conversation, load context
      await conversationService.update(ctx.conversation.id, {
        guestId: result.guest.id,
        reservationId: result.reservation.id,
        metadata: { verification: null },
      });
      ctx.guestContext = await guestContextService.getContextByConversation(ctx.conversation.id);
      ctx.verification = { attempts: merged.attempts };

      log.info(
        { conversationId: ctx.conversation.id, guestId: result.guest.id, reservationId: result.reservation.id },
        'Guest verified via conversation'
      );
      return;
    }

    // Failed — increment attempts
    merged.attempts += 1;
    merged.failed = true;
    log.info(
      { conversationId: ctx.conversation.id, reason: result.reason, attempts: merged.attempts },
      'Verification attempt failed'
    );
  }

  // Save partial or failed state back to conversation metadata
  await conversationService.update(ctx.conversation.id, { metadata: { verification: merged } });
  ctx.verification = merged;
}
