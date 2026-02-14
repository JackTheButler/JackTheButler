/**
 * AI Responder
 *
 * Generates intelligent responses using LLM with RAG (knowledge base context)
 * and intent classification.
 */

import { eq } from 'drizzle-orm';
import type { Conversation, Message } from '@/db/schema.js';
import { db, settings } from '@/db/index.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/services/guest-context.js';
import type { LLMProvider, Response, Responder } from './types.js';
import { KnowledgeService, type KnowledgeSearchResult } from './knowledge/index.js';
import { IntentClassifier, type ClassificationResult } from './intent/index.js';
import { ConversationService } from '@/services/conversation.js';
import { createLogger } from '@/utils/logger.js';
import { getResponseCache, type ResponseCacheService } from './cache.js';
import { metrics } from '@/monitoring/index.js';

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
- Always respond in the language the guest is using. If unsure, default to English
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
  maxContextMessages?: number | undefined;
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
  private classifier: IntentClassifier;
  private conversationService: ConversationService;
  private cache: ResponseCacheService | null;
  private maxContextMessages: number;
  private maxKnowledgeResults: number;
  private minKnowledgeSimilarity: number;

  constructor(config: AIResponderConfig) {
    this.provider = config.provider;
    this.knowledge = new KnowledgeService(config.embeddingProvider || config.provider);
    this.classifier = new IntentClassifier(config.provider);
    this.conversationService = new ConversationService();
    this.maxContextMessages = config.maxContextMessages ?? 10;
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
  async generate(conversation: Conversation, message: InboundMessage, guestContext?: GuestContext): Promise<Response> {
    const startTime = Date.now();

    log.debug(
      {
        conversationId: conversation.id,
        message: message.content.substring(0, 50),
        hasGuestContext: !!guestContext?.guest,
        hasReservation: !!guestContext?.reservation,
      },
      'Generating AI response'
    );

    // Check cache for simple queries (no guest context = FAQ-style)
    const canUseCache = this.cache !== null && !guestContext?.guest;
    if (canUseCache && this.cache) {
      const cached = await this.cache.get(message.content);
      if (cached) {
        const duration = Date.now() - startTime;
        metrics.aiCacheHits.inc();
        metrics.aiResponseTime.observe(duration);

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

    // 1. Classify intent
    const classification = await this.classifier.classify(message.content);

    // 2. Search knowledge base for context
    const knowledgeContext = await this.knowledge.search(message.content, {
      limit: this.maxKnowledgeResults,
      minSimilarity: this.minKnowledgeSimilarity,
    });

    // 3. Get conversation history
    const history = await this.getConversationHistory(conversation.id);

    // 4. Get hotel profile
    const hotelProfile = await this.getHotelProfile();

    // 5. Build the prompt
    const channelActions = message.metadata?.channelActions as ChannelActionsMetadata | undefined;
    const messages = this.buildPromptMessages(message.content, classification, knowledgeContext, history, guestContext, hotelProfile, channelActions);

    // 6. Generate response
    metrics.aiRequests.inc();
    const response = await this.provider.complete({
      messages,
      maxTokens: 500,
      temperature: 0.7,
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

    metrics.aiResponseTime.observe(duration);

    log.info(
      {
        conversationId: conversation.id,
        intent: classification.intent,
        confidence: classification.confidence,
        knowledgeHits: knowledgeContext.length,
        guestName: guestContext?.guest?.fullName,
        roomNumber: guestContext?.reservation?.roomNumber,
        suggestedAction,
        duration,
      },
      'AI response generated'
    );

    // Cache the response for FAQ-style queries
    if (canUseCache && this.cache && classification.confidence > 0.7) {
      this.cache.set(message.content, content, classification.intent).catch((err) => {
        log.error({ err }, 'Failed to cache response');
      });
    }

    return {
      content,
      confidence: classification.confidence,
      intent: classification.intent,
      metadata: {
        classification,
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
   * Get recent conversation history
   */
  private async getConversationHistory(conversationId: string): Promise<Message[]> {
    const messages = await this.conversationService.getMessages(conversationId, {
      limit: this.maxContextMessages,
    });

    return messages;
  }

  /**
   * Get hotel profile from settings
   */
  private async getHotelProfile(): Promise<HotelProfile | null> {
    try {
      const row = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'hotel_profile'))
        .get();

      if (!row) return null;
      return JSON.parse(row.value) as HotelProfile;
    } catch {
      log.warn('Failed to load hotel profile');
      return null;
    }
  }

  /**
   * Build the prompt messages for the LLM
   */
  private buildPromptMessages(
    currentMessage: string,
    classification: ClassificationResult,
    knowledgeContext: KnowledgeSearchResult[],
    history: Message[],
    guestContext?: GuestContext,
    hotelProfile?: HotelProfile | null,
    channelActions?: ChannelActionsMetadata,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // System prompt with context
    let systemContent = BUTLER_SYSTEM_PROMPT;

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

    // Add conversation history
    for (const msg of history) {
      const role = msg.direction === 'inbound' ? 'user' : 'assistant';
      messages.push({ role, content: msg.content });
    }

    // Add current message (if not already in history)
    const lastHistoryMsg = history[history.length - 1];
    if (!lastHistoryMsg || lastHistoryMsg.content !== currentMessage) {
      messages.push({ role: 'user', content: currentMessage });
    }

    return messages;
  }

  /**
   * Get the knowledge service (for external use)
   */
  getKnowledgeService(): KnowledgeService {
    return this.knowledge;
  }

  /**
   * Get the intent classifier (for external use)
   */
  getClassifier(): IntentClassifier {
    return this.classifier;
  }

  /**
   * Get the response cache (for external use)
   */
  getCache(): ResponseCacheService | null {
    return this.cache;
  }
}

export { AIResponder as default };
