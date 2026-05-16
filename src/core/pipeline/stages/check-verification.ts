/**
 * checkVerification — Butler-side hospitality stage.
 *
 * Handles in-conversation guest identity verification for channels that
 * lack a UI form (Telegram, WhatsApp without a phone match, etc.). Runs
 * only when the classifier matched `verification.provide_credentials`.
 *
 * Flow:
 *   1. Load any partial state from `conversation.metadata.verification`.
 *   2. Bail if attempts are already at the cap.
 *   3. LLM-extract `lastName` + `confirmationNumber` from the current
 *      message (and recent history, for cases where credentials span
 *      multiple turns).
 *   4. When both are present, look up the reservation. On success: link
 *      guest + reservation to the conversation, set `ctx.entity` and
 *      `ctx.verification` for the responder. On failure: bump attempts.
 *   5. Persist the merged state back to `conversation.metadata`.
 *
 * Hospitality-coupled (uses `verifyByConfirmationAndLastName`). When other
 * verticals appear, generalize the credential shape via a domain hook.
 *
 * @module core/pipeline/stages/check-verification
 */

import { conversationService } from '@/services/conversation.js';
import {
  verifyByConfirmationAndLastName,
  MAX_VERIFICATION_ATTEMPTS,
  type VerificationState,
} from '@/services/verification.js';
import type {
  AIProvider,
  Message,
  Stage,
} from '@thebutler/pipeline';
import type { ButlerContext } from '../index.js';

const EXTRACTION_SYSTEM_PROMPT =
  'Extract hotel guest verification credentials from the conversation below.\n' +
  'Return JSON only: { "lastName": "...", "confirmationNumber": "..." }\n' +
  'Omit any field that is not clearly present in the conversation.';

async function extractCredentials(
  message: string,
  ai: AIProvider,
  history: readonly Message[] | undefined,
): Promise<{ lastName?: string; confirmationNumber?: string }> {
  try {
    const historyMessages = (history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await ai.complete({
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        ...historyMessages,
        { role: 'user', content: message },
      ],
      maxTokens: 80,
      temperature: 0,
      modelTier: 'utility',
      purpose: 'credential_extraction',
      // Attach the extracted credentials to the AI call's telemetry row.
      // PII gets stored in app_logs — acceptable here because the staff
      // dashboard already has access to identity data and this row is
      // gated behind the `health:view` permission.
      logFields: (raw) => {
        const parsed = parseExtraction(raw);
        return {
          extractedLastName: parsed.lastName ?? null,
          extractedConfirmation: parsed.confirmationNumber ?? null,
        };
      },
    });

    return parseExtraction(response.content);
  } catch {
    return {};
  }
}

function parseExtraction(
  raw: string,
): { lastName?: string; confirmationNumber?: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as { lastName?: string; confirmationNumber?: string };
  } catch {
    return {};
  }
}

export const checkVerification: Stage<ButlerContext> = async (ctx, env) => {
  if (ctx.classification?.intent !== 'verification.provide_credentials') return;
  if (!ctx.conversation) return;

  // `conversation.metadata` arrives as an object from the adapter —
  // JSON serialization vs. parsing lives in the ConversationProvider.
  const meta = (ctx.conversation.metadata ?? {}) as {
    verification?: VerificationState;
  };
  const stored = meta.verification ?? { attempts: 0 };

  if (stored.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    ctx.verification = { attempts: stored.attempts };
    return;
  }

  const text = ctx.inboundTranslation ?? ctx.inbound.content;
  const extracted = await extractCredentials(text, env.services.ai, ctx.history);

  const merged: VerificationState = { attempts: stored.attempts };
  const mergedLastName = extracted.lastName ?? stored.lastName;
  const mergedConfirmation = extracted.confirmationNumber ?? stored.confirmationNumber;
  if (mergedLastName) merged.lastName = mergedLastName;
  if (mergedConfirmation) merged.confirmationNumber = mergedConfirmation;

  if (merged.lastName && merged.confirmationNumber) {
    const result = await verifyByConfirmationAndLastName(
      merged.confirmationNumber,
      merged.lastName,
    );

    if (result.ok) {
      await conversationService.update(ctx.conversation.id, {
        guestId: result.guest.id,
        reservationId: result.reservation.id,
        metadata: { verification: null },
      });

      // Surface the just-verified entity to downstream stages so the
      // responder has the guest's profile available on this same turn.
      ctx.entity = await env.services.entities.findById(result.guest.id);
      ctx.verification = { attempts: merged.attempts };

      env.services.logger.info(
        {
          conversationId: ctx.conversation.id,
          guestId: result.guest.id,
          reservationId: result.reservation.id,
        },
        'Guest verified via conversation',
      );
      return;
    }

    merged.attempts += 1;
    merged.failed = true;
    env.services.logger.info(
      {
        conversationId: ctx.conversation.id,
        reason: result.reason,
        attempts: merged.attempts,
      },
      'Verification attempt failed',
    );
  }

  await conversationService.update(ctx.conversation.id, {
    metadata: { verification: merged },
  });
  ctx.verification = merged;
};
