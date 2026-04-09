/**
 * AI Responder
 *
 * Generates intelligent responses using LLM with RAG (knowledge base context)
 * and intent classification.
 */

import type { Conversation, GuestMemory } from '@/db/schema.js';
import { settingsService } from '@/services/settings.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/core/conversation/guest-context.js';
import type { LLMProvider, Response, Responder } from './types.js';
import { MAX_VERIFICATION_ATTEMPTS, type VerificationState } from '@/services/verification.js';
import { KnowledgeService } from './knowledge/index.js';
import type { KnowledgeSearchResult } from './knowledge/index.js';
import type { ClassificationResult } from './intent/index.js';
import { createLogger } from '@/utils/logger.js';
import { getResponseCache, type ResponseCacheService } from './cache.js';
import { translate, getPropertyLanguage } from '@/utils/translation.js';

/**
 * Hotel profile from settings
 */
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

const log = createLogger('ai:responder');

/**
 * Structured channel action hint passed via message metadata.
 * Channels declare available actions; the responder builds the prompt.
 */
interface ChannelActionHint {
  id: string;
  triggerHint: string;
  requiresVerification: boolean;
}

/**
 * Channel actions metadata passed in InboundMessage.metadata.channelActions
 */
interface ChannelActionsMetadata {
  actions: ChannelActionHint[];
  verificationStatus: string;
}

/** Pattern the AI uses to tag a suggested action */
const ACTION_TAG_RE = /\[ACTION:([a-z0-9-]+)\]\s*$/;

/** Pattern for quick reply buttons: [QUICK_REPLIES:opt1|opt2|opt3] */
const QUICK_REPLY_RE = /\[QUICK_REPLIES:((?:[^|\]]+\|?)+)\]\s*$/;

/**
 * System prompt for the hotel butler
 */
const BUTLER_SYSTEM_PROMPT = `You are Jack, a friendly hotel concierge. Be warm, helpful, and BRIEF.

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

/**
 * AI Responder configuration
 */
export interface AIResponderConfig {
  provider: LLMProvider;
  embeddingProvider?: LLMProvider | undefined;
  maxKnowledgeResults?: number | undefined;
  minKnowledgeSimilarity?: number | undefined;
  /** Enable response caching for FAQ-type queries */
  enableCache?: boolean | undefined;
  /** Cache TTL in seconds (default: 3600) */
  cacheTtlSeconds?: number | undefined;
}

/**
 * AI-powered responder using LLM with RAG
 */
export class AIResponder implements Responder {
  private provider: LLMProvider;
  private knowledge: KnowledgeService;
  private cache: ResponseCacheService | null;
  private maxKnowledgeResults: number;
  private minKnowledgeSimilarity: number;

  constructor(config: AIResponderConfig) {
    this.provider = config.provider;
    this.knowledge = new KnowledgeService(config.embeddingProvider || config.provider);
    this.maxKnowledgeResults = config.maxKnowledgeResults ?? 3;
    this.minKnowledgeSimilarity = config.minKnowledgeSimilarity ?? 0.3;

    // Initialize cache if enabled
    this.cache = config.enableCache !== false
      ? getResponseCache({ ttlSeconds: config.cacheTtlSeconds ?? 3600 })
      : null;

    log.info({ provider: config.provider.name, cacheEnabled: !!this.cache }, 'AI responder initialized');
  }

  /**
   * Generate a response for a message
   */
  async generate(conversation: Conversation, message: InboundMessage, guestContext?: GuestContext, knowledgeResults?: KnowledgeSearchResult[], memories?: GuestMemory[], classification?: ClassificationResult, verificationState?: VerificationState, history?: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<Response> {
    const startTime = Date.now();

    log.debug(
      {
        conversationId: conversation.id,
        message: message.content.substring(0, 50),
        hasGuestContext: !!guestContext?.guest,
        hasReservation: !!guestContext?.reservation,
        hasMemories: !!memories?.length,
      },
      'Generating AI response'
    );

    // Check cache for simple queries (no guest context = FAQ-style)
    const canUseCache = this.cache !== null && !guestContext?.guest;
    if (canUseCache && this.cache) {
      const cached = await this.cache.get(message.content);
      if (cached) {
        const duration = Date.now() - startTime;
        log.info(
          {
            conversationId: conversation.id,
            intent: cached.intent,
            cached: true,
            duration,
          },
          'AI response from cache'
        );

        return {
          content: cached.response,
          confidence: 0.9,
          intent: cached.intent ?? 'general_inquiry',
          metadata: {
            cached: true,
            cachedAt: cached.createdAt,
          },
        };
      }
    }

    // Resolve property language once for the entire request
    const propertyLanguage = await getPropertyLanguage();

    // 1. Use pre-computed classification from the classifyIntent pipeline stage
    const resolvedClassification = classification ?? { intent: 'unknown', confidence: 0, department: null, requiresAction: false, requiresIdentity: false };

    // 2. Search knowledge base for context
    // Translate query to English for RAG (KB + embeddings are English-only)
    const guestLanguage = (message.metadata?.detectedLanguage as string)
      ?? conversation.guestLanguage ?? 'en';
    let searchQuery = message.content;

    if (guestLanguage !== 'en') {
      // Reuse Phase 1 translation if property language is already English
      const existingTranslation = message.metadata?.translatedContent as string | undefined;

      if (existingTranslation && propertyLanguage === 'en') {
        searchQuery = existingTranslation;
      } else {
        try {
          searchQuery = await translate(message.content, 'en', guestLanguage);
        } catch (error) {
          log.warn({ error }, 'RAG query translation failed, using original');
        }
      }
    }

    // Use pre-computed results from pipeline if available, otherwise search internally
    let knowledgeContext: KnowledgeSearchResult[] = [];
    if (knowledgeResults !== undefined) {
      knowledgeContext = knowledgeResults;
    } else {
      try {
        knowledgeContext = await this.knowledge.search(searchQuery, {
          limit: this.maxKnowledgeResults,
          minSimilarity: this.minKnowledgeSimilarity,
        });
      } catch (error) {
        log.warn({ err: error }, 'Knowledge base search skipped — embedding provider unavailable');
      }
    }

    // 3. Get hotel profile
    const hotelProfile = await this.getHotelProfile();

    // 5. Build the prompt
    // Use translated content for the prompt so the entire context is in the property language
    const promptMessage = (message.metadata?.translatedContent as string) ?? message.content;
    const channelActions = message.metadata?.channelActions as ChannelActionsMetadata | undefined;
    const messages = this.buildPromptMessages(promptMessage, resolvedClassification, knowledgeContext, history ?? [], guestContext, hotelProfile, channelActions, propertyLanguage, memories, verificationState);

    const promptPreview = messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
    log.info(`\n\n=== AI PROMPT (conversation: ${conversation.id}) ===\n\n${promptPreview}\n\n===================================================\n`);

    // 6. Generate response
    const response = await this.provider.complete({
      messages,
      maxTokens: 500,
      temperature: 0.7,
      purpose: 'response_generation',
      onComplete: (content) => ({ responsePreview: content.length > 120 ? `${content.slice(0, 120)}…` : content }),
    });

    const duration = Date.now() - startTime;

    // 7. Extract [ACTION:xxx] and [QUICK_REPLIES:...] tags if present
    let content = response.content;
    let suggestedAction: string | undefined;
    const actionMatch = content.match(ACTION_TAG_RE);
    if (actionMatch) {
      suggestedAction = actionMatch[1];
      content = content.replace(ACTION_TAG_RE, '').trimEnd();
      log.debug({ suggestedAction }, 'AI suggested channel action');
    }

    let quickReplies: string[] | undefined;
    const qrMatch = content.match(QUICK_REPLY_RE);
    if (qrMatch) {
      quickReplies = qrMatch[1]!.split('|').map((s) => s.trim()).filter(Boolean);
      content = content.replace(QUICK_REPLY_RE, '').trimEnd();
    }

    log.info(
      {
        conversationId: conversation.id,
        intent: resolvedClassification.intent,
        confidence: resolvedClassification.confidence,
        knowledgeHits: knowledgeContext.length,
        memoriesCount: memories?.length ?? 0,
        guestName: guestContext?.guest?.fullName,
        roomNumber: guestContext?.reservation?.roomNumber,
        suggestedAction,
        duration,
      },
      'AI response generated'
    );

    // Cache the response for FAQ-style queries
    // Skip caching inquiry responses with no KB hits (prevents caching "I don't know" answers)
    const isInquiry = resolvedClassification.intent?.startsWith('inquiry');
    const hasKnowledge = knowledgeContext.length > 0;
    if (canUseCache && this.cache && resolvedClassification.confidence > 0.7 && (!isInquiry || hasKnowledge)) {
      this.cache.set(message.content, content, resolvedClassification.intent).catch((err) => {
        log.error({ err }, 'Failed to cache response');
      });
    }

    return {
      content,
      confidence: resolvedClassification.confidence,
      intent: resolvedClassification.intent,
      metadata: {
        classification: resolvedClassification,
        knowledgeContext: knowledgeContext.map((k) => ({ id: k.id, title: k.title, similarity: k.similarity })),
        usage: response.usage,
        suggestedAction,
        quickReplies,
        guestContext: guestContext?.guest ? {
          guestId: guestContext.guest.id,
          guestName: guestContext.guest.fullName,
          reservationId: guestContext.reservation?.id,
          roomNumber: guestContext.reservation?.roomNumber,
        } : undefined,
      },
    };
  }

  /**
   * Get hotel profile from settings
   */
  private async getHotelProfile(): Promise<HotelProfile | null> {
    return settingsService.get<HotelProfile | null>('hotel_profile', null);
  }

  /**
   * Build the prompt messages for the LLM
   */
  private buildPromptMessages(
    currentMessage: string,
    classification: ClassificationResult,
    knowledgeContext: KnowledgeSearchResult[],
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    guestContext?: GuestContext,
    hotelProfile?: HotelProfile | null,
    channelActions?: ChannelActionsMetadata,
    propertyLanguage?: string,
    memories?: GuestMemory[],
    verificationState?: VerificationState,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // System prompt with context
    let systemContent = BUTLER_SYSTEM_PROMPT;

    // Tell the AI which language to respond in
    if (propertyLanguage && propertyLanguage !== 'en') {
      systemContent += `\n\nIMPORTANT: Respond in ${propertyLanguage}. The guest's messages have been translated for you. Your response will be automatically translated to the guest's language. Do NOT translate your response yourself.`;
    }

    // Add hotel profile if available
    if (hotelProfile) {
      const hotelInfo: string[] = [];

      if (hotelProfile.name) {
        hotelInfo.push(`Hotel Name: ${hotelProfile.name}`);
      }
      if (hotelProfile.address || hotelProfile.city || hotelProfile.country) {
        const location = [hotelProfile.address, hotelProfile.city, hotelProfile.country]
          .filter(Boolean)
          .join(', ');
        if (location) hotelInfo.push(`Location: ${location}`);
      }
      if (hotelProfile.checkInTime) {
        hotelInfo.push(`Check-in Time: ${hotelProfile.checkInTime}`);
      }
      if (hotelProfile.checkOutTime) {
        hotelInfo.push(`Check-out Time: ${hotelProfile.checkOutTime}`);
      }
      if (hotelProfile.contactPhone) {
        hotelInfo.push(`Phone: ${hotelProfile.contactPhone}`);
      }
      if (hotelProfile.contactEmail) {
        hotelInfo.push(`Email: ${hotelProfile.contactEmail}`);
      }
      if (hotelProfile.timezone) {
        hotelInfo.push(`Timezone: ${hotelProfile.timezone}`);
      }

      if (hotelInfo.length > 0) {
        systemContent += '\n\n## Hotel Information:\n- ' + hotelInfo.join('\n- ');
      }
    }

    // Add guest context if available
    if (guestContext?.guest) {
      systemContent += '\n\n## Current Guest Information:';
      systemContent += `\n- Name: ${guestContext.guest.fullName}`;
      if (guestContext.guest.loyaltyTier) {
        systemContent += `\n- Loyalty Status: ${guestContext.guest.loyaltyTier}`;
      }
      if (guestContext.guest.vipStatus) {
        systemContent += `\n- VIP Status: ${guestContext.guest.vipStatus}`;
      }
      if (guestContext.guest.language && guestContext.guest.language !== 'en') {
        systemContent += `\n- Preferred Language: ${guestContext.guest.language}`;
      }
      if (guestContext.guest.preferences && guestContext.guest.preferences.length > 0) {
        systemContent += '\n- Known Preferences:';
        for (const pref of guestContext.guest.preferences) {
          systemContent += `\n  - ${pref.category}: ${pref.value}`;
        }
      }
    }

    // Add guest memories if available
    if (memories && memories.length > 0) {
      systemContent += '\n\n## What Jack Knows About This Guest:';
      for (const memory of memories) {
        systemContent += `\n- ${memory.category}: ${memory.content}`;
      }
    }

    // Add reservation context if available
    if (guestContext?.reservation) {
      const res = guestContext.reservation;
      systemContent += '\n\n## Current Reservation:';
      systemContent += `\n- Confirmation: ${res.confirmationNumber}`;
      if (res.roomNumber) {
        systemContent += `\n- Room: ${res.roomNumber} (${res.roomType})`;
      } else {
        systemContent += `\n- Room Type: ${res.roomType}`;
      }
      systemContent += `\n- Check-in: ${res.arrivalDate}`;
      systemContent += `\n- Check-out: ${res.departureDate}`;
      systemContent += `\n- Status: ${res.isCheckedIn ? 'Currently checked in' : 'Not yet checked in'}`;
      if (res.isCheckedIn) {
        systemContent += `\n- Days Remaining: ${res.daysRemaining}`;
      }
      if (res.specialRequests && res.specialRequests.length > 0) {
        systemContent += '\n- Special Requests:';
        for (const req of res.specialRequests) {
          systemContent += `\n  - ${req}`;
        }
      }
    }

    // Add knowledge context if available
    if (knowledgeContext.length > 0) {
      systemContent += '\n\n## Relevant Hotel Information:\n';
      for (const item of knowledgeContext) {
        systemContent += `\n### ${item.title}\n${item.content}\n`;
      }
    }

    // Add intent context
    if (classification.intent !== 'unknown') {
      systemContent += `\n\n## Detected Intent: ${classification.intent}`;
      if (classification.department) {
        systemContent += ` (Department: ${classification.department})`;
      }
      if (classification.requiresAction) {
        systemContent += '\nNote: This may require creating a task or action.';
      }
    }

    // Verification instructions — only when guest is not yet identified
    if (!guestContext?.guest) {
      if (verificationState && verificationState.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        systemContent += '\n\nIMPORTANT: The guest has exceeded the maximum verification attempts. Apologise and direct them to contact the front desk directly. Do not fulfil any requests.';
      } else if (verificationState?.failed) {
        const remaining = MAX_VERIFICATION_ATTEMPTS - verificationState.attempts;
        systemContent += `\n\nIMPORTANT: The last name and confirmation number the guest provided did not match any booking. Let them know politely and invite them to try again (${remaining} attempt(s) remaining). Do not fulfil any requests until verified.`;
      } else if (verificationState?.lastName && !verificationState.confirmationNumber) {
        systemContent += '\n\nIMPORTANT: The guest has provided their last name. Ask for their booking confirmation number to complete verification.';
      } else if (!verificationState?.lastName && verificationState?.confirmationNumber) {
        systemContent += '\n\nIMPORTANT: The guest has provided their confirmation number. Ask for their last name to complete verification.';
      } else if (classification.requiresIdentity) {
        systemContent += '\n\nIMPORTANT: This request requires guest identity. Ask for their last name and booking confirmation number before fulfilling the request. Do not promise to fulfil the request until they are identified.';
      }
    }

    // Channel-specific actions (e.g., webchat forms)
    if (channelActions && channelActions.actions.length > 0) {
      const isVerified = channelActions.verificationStatus === 'verified';
      const actionLines = channelActions.actions.map(
        (a) => `- ${a.id}: ${a.triggerHint}${a.requiresVerification ? ' (requires guest verification first)' : ''}`,
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
      systemContent += '\nExample: "I\'ll get that sorted! [ACTION:request-service]"';
      systemContent += '\nDo NOT include [ACTION:...] if no action is needed.';
    }

    // Quick reply buttons
    systemContent += '\n\nQUICK REPLIES: When it would help to offer the guest 2-4 clickable options, end your response with [QUICK_REPLIES:option1|option2|option3].';
    systemContent += '\nExample: "How can I help?" [QUICK_REPLIES:Room Service|Housekeeping|Extend Stay|Something Else]';
    systemContent += '\nOnly use when options are genuinely useful. Do NOT use for open-ended questions. Do NOT combine with [ACTION:...].';

    // 8G: Data exposure guardrails
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
    if (guestContext?.guest) {
      systemContent += `\n\n## Important: Address the guest by name (${guestContext.guest.firstName}) when appropriate. Personalize responses based on their profile and reservation details.`;
    }

    messages.push({ role: 'system', content: systemContent });

    // Add conversation history (already mapped to { role, content } by the pipeline)
    for (const msg of history) {
      messages.push(msg);
    }

    // Add current message (history is loaded before saveInboundMessage, so it's never in there)
    messages.push({ role: 'user', content: currentMessage });

    return messages;
  }

  /**
   * Get the knowledge service (for external use)
   */
  getKnowledgeService(): KnowledgeService {
    return this.knowledge;
  }

  /**
   * Get the response cache (for external use)
   */
  getCache(): ResponseCacheService | null {
    return this.cache;
  }
}

export { AIResponder as default };
