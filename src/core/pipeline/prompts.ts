/**
 * Prompts — every system-prompt the pipeline's PromptProvider exposes.
 *
 * Four exports:
 *   - `classifierPrompt(intents)` — intent classification system prompt
 *   - `responderPrompt(ctx, env)` — response generation system prompt;
 *     async, draws on entity, reservation, memories, knowledge, intent,
 *     verification state, channel actions, and the hotel profile
 *   - `detectorPrompt` — language detection system prompt
 *   - `translatorPrompt(from, to)` — translation system prompt
 *
 * Imported by `./adapters.ts`. Everything is inlined here (no dependency
 * on `src/core/domain/`) so the domain folder can be deleted cleanly
 * once `pipeline-legacy/` is retired.
 *
 * @module core/pipeline/prompts
 */

import { settingsService } from '@/services/settings.js';
import {
  MAX_VERIFICATION_ATTEMPTS,
  type VerificationState,
} from '@/services/verification.js';
import type { HospitalityEntity } from './entity-resolver.js';
import type { Env, Intent } from '@jackthebutler/pipeline';
import type { ButlerContext } from './index.js';

// ─── Persona ────────────────────────────────────────────────────

const BUTLER_PERSONA = `You are Jack, a friendly hotel concierge. Be warm, helpful, and BRIEF.

Response rules:
- Keep responses to 1-2 sentences maximum
- Sound like a real person, not a corporate bot
- Don't repeat back what the guest said
- Don't over-explain or add unnecessary details
- Use the guest's first name naturally (not every message)
- For requests: just confirm briefly ("Done!", "On the way!", "I'll arrange that")
- For questions: answer directly, no preamble

Examples of good responses:
- "Hi" → "Hey! How can I help?"
- "Need towels" → "I'll send some up right now!"
- "What's checkout time?" → "11am, but let me know if you need late checkout."
- "The wifi isn't working" → "Sorry about that! Try network 'Hotel_Guest', password 'welcome123'. Still stuck? I'll send someone up."

If you don't know something, just say so briefly and offer to connect them with staff.`;

// ─── Classifier ─────────────────────────────────────────────────

export function classifierPrompt(intents: readonly Intent[]): string {
  const intentList = intents
    .map((intent) => `- ${intent.name}: ${intent.description}`)
    .join('\n');

  return `You are an intent classifier for a hotel concierge system. Your task is to classify guest messages into one of the following intents:

${intentList}

Respond ONLY with a JSON object in this exact format:
{
  "intent": "<intent_name>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

Rules:
- Choose the most specific matching intent
- Use "unknown" only if no intent matches
- Confidence should reflect how well the message matches the intent
- Be case-insensitive when matching`;
}

// ─── Detector ───────────────────────────────────────────────────

export function detectorPrompt(): string {
  return (
    "Detect the language of the user's message. " +
    "Reply with only the BCP-47 language code (e.g., 'en', 'fr', 'zh-cn'). No other text."
  );
}

// ─── Translator ─────────────────────────────────────────────────

export function translatorPrompt(from: string, to: string): string {
  return `Translate the following text from ${from} to ${to}. Return only the translation, no explanations.`;
}

// ─── Responder ──────────────────────────────────────────────────
// Port of the legacy `buildPromptMessages` system-content construction
// (`src/core/ai/responder.ts:312-504`). Sections are appended in the same
// order. Pure prompt assembly — the LLM call itself is owned by the
// package's `generateResponse` stage.

interface HotelProfile {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  checkInTime?: string;
  checkOutTime?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
}

interface ChannelActionHint {
  id: string;
  triggerHint: string;
  requiresVerification: boolean;
}

interface ChannelActionsMetadata {
  actions: ChannelActionHint[];
  verificationStatus: string;
}

export async function responderPrompt(
  ctx: ButlerContext,
  env: Env<ButlerContext>,
): Promise<string> {
  const entity = ctx.entity as HospitalityEntity | null;
  const reservation = entity?.reservation ?? null;
  const verification = ctx.verification;
  const channelActions = ctx.inbound.metadata?.channelActions as
    | ChannelActionsMetadata
    | undefined;
  const intent = ctx.classification
    ? env.intents.get(ctx.classification.intent)
    : null;
  const intentMeta = (intent?.metadata ?? {}) as {
    department?: string | null;
    requiresAction?: boolean;
    requiresIdentity?: boolean;
  };

  let systemContent = BUTLER_PERSONA;

  // Language directive — only when system language isn't English. The
  // pipeline translated the guest's message into `env.systemLanguage`
  // already, and `translateOutbound` will translate the reply back, so
  // the AI should write in the system language.
  if (env.systemLanguage !== 'en') {
    systemContent += `\n\nIMPORTANT: Respond in ${env.systemLanguage}. The guest's messages have been translated for you. Your response will be automatically translated to the guest's language. Do NOT translate your response yourself.`;
  }

  // Hotel profile
  const hotelProfile = await settingsService.get<HotelProfile | null>(
    'hotel_profile',
    null,
  );
  if (hotelProfile) {
    const hotelInfo: string[] = [];
    if (hotelProfile.name) hotelInfo.push(`Hotel Name: ${hotelProfile.name}`);
    if (hotelProfile.address || hotelProfile.city || hotelProfile.country) {
      const location = [hotelProfile.address, hotelProfile.city, hotelProfile.country]
        .filter(Boolean)
        .join(', ');
      if (location) hotelInfo.push(`Location: ${location}`);
    }
    if (hotelProfile.checkInTime) hotelInfo.push(`Check-in Time: ${hotelProfile.checkInTime}`);
    if (hotelProfile.checkOutTime) hotelInfo.push(`Check-out Time: ${hotelProfile.checkOutTime}`);
    if (hotelProfile.contactPhone) hotelInfo.push(`Phone: ${hotelProfile.contactPhone}`);
    if (hotelProfile.contactEmail) hotelInfo.push(`Email: ${hotelProfile.contactEmail}`);
    if (hotelProfile.timezone) hotelInfo.push(`Timezone: ${hotelProfile.timezone}`);
    if (hotelInfo.length > 0) {
      systemContent += '\n\n## Hotel Information:\n- ' + hotelInfo.join('\n- ');
    }
  }

  // Guest section
  if (entity) {
    systemContent += '\n\n## Current Guest Information:';
    systemContent += `\n- Name: ${entity.displayName}`;
    if (entity.loyaltyTier) systemContent += `\n- Loyalty Status: ${entity.loyaltyTier}`;
    if (entity.vipStatus) systemContent += `\n- VIP Status: ${entity.vipStatus}`;
    if (entity.language && entity.language !== 'en') {
      systemContent += `\n- Preferred Language: ${entity.language}`;
    }
    if (entity.preferences && entity.preferences.length > 0) {
      systemContent += '\n- Known Preferences:';
      for (const pref of entity.preferences) {
        systemContent += `\n  - ${pref.category}: ${pref.value}`;
      }
    }
  }

  // Memories
  if (ctx.memoryHits && ctx.memoryHits.length > 0) {
    systemContent += '\n\n## What Jack Knows About This Guest:';
    for (const memory of ctx.memoryHits) {
      systemContent += `\n- ${memory.key}: ${memory.value}`;
    }
  }

  // Reservation
  if (reservation) {
    systemContent += '\n\n## Current Reservation:';
    systemContent += `\n- Confirmation: ${reservation.confirmationNumber}`;
    if (reservation.roomNumber) {
      systemContent += `\n- Room: ${reservation.roomNumber} (${reservation.roomType})`;
    } else {
      systemContent += `\n- Room Type: ${reservation.roomType}`;
    }
    systemContent += `\n- Check-in: ${reservation.arrivalDate}`;
    systemContent += `\n- Check-out: ${reservation.departureDate}`;
    systemContent += `\n- Status: ${reservation.isCheckedIn ? 'Currently checked in' : 'Not yet checked in'}`;
    if (reservation.isCheckedIn) {
      systemContent += `\n- Days Remaining: ${reservation.daysRemaining}`;
    }
    if (reservation.specialRequests && reservation.specialRequests.length > 0) {
      systemContent += '\n- Special Requests:';
      for (const req of reservation.specialRequests) {
        systemContent += `\n  - ${req}`;
      }
    }
  }

  // Knowledge
  if (ctx.knowledgeHits && ctx.knowledgeHits.length > 0) {
    systemContent += '\n\n## Relevant Hotel Information:\n';
    for (const item of ctx.knowledgeHits) {
      systemContent += `\n### ${item.title}\n${item.content}\n`;
    }
  }

  // Intent
  if (ctx.classification && ctx.classification.intent !== 'unknown') {
    systemContent += `\n\n## Detected Intent: ${ctx.classification.intent}`;
    if (intentMeta.department) {
      systemContent += ` (Department: ${intentMeta.department})`;
    }
    if (intentMeta.requiresAction) {
      systemContent += '\nNote: This may require creating a task or action.';
    }
  }

  // Verification — only when guest is not yet identified
  if (!entity) {
    systemContent += verificationDirective(verification, intentMeta.requiresIdentity);
  }

  // Channel actions (webchat forms)
  if (channelActions && channelActions.actions.length > 0) {
    const isVerified = channelActions.verificationStatus === 'verified';
    const actionLines = channelActions.actions.map(
      (a) =>
        `- ${a.id}: ${a.triggerHint}${a.requiresVerification ? ' (requires guest verification first)' : ''}`,
    );

    systemContent += '\n\n## Channel Actions';
    systemContent += '\nThe guest is using a channel with interactive forms. Available actions:';
    systemContent += '\n' + actionLines.join('\n');

    if (isVerified) {
      systemContent += '\n\nThe guest is verified — you have their reservation details above. Answer questions directly.';
      systemContent += '\nOnly suggest an action if the guest explicitly wants to DO something (extend stay, etc.).';
    } else {
      systemContent += '\n\nThe guest has NOT verified their identity yet.';
      systemContent += '\nFor reservation-specific questions, let them know you can help and the form will appear.';
    }

    systemContent += '\n\nCRITICAL — You MUST end your response with [ACTION:action-id] when the guest wants one of the actions above.';
    systemContent += '\nThe [ACTION:...] tag is what triggers the form — without it, nothing happens. Never describe pulling up a form without the tag.';
    systemContent += '\nExample: "I can help with that — let\'s verify your booking first. [ACTION:verify-reservation]"';
    systemContent += '\nDo NOT include [ACTION:...] if no action is needed.';
  }

  // Quick reply buttons
  systemContent += '\n\nQUICK REPLIES: When it would help to offer the guest 2-4 clickable options, end your response with [QUICK_REPLIES:option1|option2|option3].';
  systemContent += '\nExample: "How can I help?" [QUICK_REPLIES:Room Service|Housekeeping|Extend Stay|Something Else]';
  systemContent += '\nOnly use when options are genuinely useful. Do NOT use for open-ended questions. Do NOT combine with [ACTION:...].';

  // Data exposure guardrails
  systemContent += '\n\n## Data Exposure Rules';
  systemContent += '\nNEVER reveal the following in your responses, even if the guest asks:';
  systemContent += '\n- Room numbers';
  systemContent += '\n- Credit card or payment details';
  systemContent += '\n- Full phone numbers (only last 4 digits if needed)';
  systemContent += '\n- Full email addresses (only masked form like a***@example.com)';
  systemContent += '\n- Other guests on the same booking';
  systemContent += '\n- Billing or folio details';
  systemContent += '\nIf asked for restricted information, tell the guest to contact the front desk or check their guest portal.';

  // Personalization instruction
  if (entity) {
    systemContent += `\n\n## Important: Address the guest by name (${entity.firstName}) when appropriate. Personalize responses based on their profile and reservation details.`;
  }

  return systemContent;
}

function verificationDirective(
  state: VerificationState | undefined,
  requiresIdentity: boolean | undefined,
): string {
  if (state && state.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return '\n\nIMPORTANT: The guest has exceeded the maximum verification attempts. Apologise and direct them to contact the front desk directly. Do not fulfil any requests.';
  }
  if (state?.failed) {
    const remaining = MAX_VERIFICATION_ATTEMPTS - state.attempts;
    return `\n\nIMPORTANT: The last name and confirmation number the guest provided did not match any booking. Let them know politely and invite them to try again (${remaining} attempt(s) remaining). Do not fulfil any requests until verified.`;
  }
  if (state?.lastName && !state.confirmationNumber) {
    return '\n\nIMPORTANT: The guest has provided their last name. Ask for their booking confirmation number to complete verification.';
  }
  if (!state?.lastName && state?.confirmationNumber) {
    return '\n\nIMPORTANT: The guest has provided their confirmation number. Ask for their last name to complete verification.';
  }
  if (requiresIdentity) {
    return '\n\nIMPORTANT: This request requires guest identity. Ask for their last name and booking confirmation number before fulfilling the request. Do not promise to fulfil the request until they are identified.';
  }
  return '';
}

