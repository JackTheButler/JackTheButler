/**
 * AI Responder
 *
 * Generates intelligent responses using LLM with RAG (knowledge base context)
 * and intent classification.
 */

import type { Conversation, Message } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { Response, Responder } from '@/pipeline/responder.js';
import type { GuestContext } from '@/services/guest-context.js';
import type { LLMProvider } from './types.js';
import { KnowledgeService, type KnowledgeSearchResult } from './knowledge/index.js';
import { IntentClassifier, type ClassificationResult } from './intent/index.js';
import { ConversationService } from '@/services/conversation.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:responder');

/**
 * System prompt for the hotel butler
 */
const BUTLER_SYSTEM_PROMPT = `You are Jack, an AI-powered hotel concierge assistant. You are helpful, professional, and friendly.

Your role is to:
1. Answer guest questions about the hotel and its services
2. Help with service requests (housekeeping, room service, etc.)
3. Provide local recommendations
4. Escalate to human staff when needed

Guidelines:
- Be concise but complete in your responses
- Always be polite and professional
- If you don't know something, say so and offer to connect the guest with staff
- Use the provided context from the knowledge base when available
- For service requests, confirm what the guest needs
- Never make up information about the hotel

Current hotel information is provided in the context below.`;

/**
 * AI Responder configuration
 */
export interface AIResponderConfig {
  provider: LLMProvider;
  embeddingProvider?: LLMProvider | undefined;
  maxContextMessages?: number | undefined;
  maxKnowledgeResults?: number | undefined;
  minKnowledgeSimilarity?: number | undefined;
}

/**
 * AI-powered responder using LLM with RAG
 */
export class AIResponder implements Responder {
  private provider: LLMProvider;
  private knowledge: KnowledgeService;
  private classifier: IntentClassifier;
  private conversationService: ConversationService;
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

    log.info({ provider: config.provider.name }, 'AI responder initialized');
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

    // 1. Classify intent
    const classification = await this.classifier.classify(message.content);

    // 2. Search knowledge base for context
    const knowledgeContext = await this.knowledge.search(message.content, {
      limit: this.maxKnowledgeResults,
      minSimilarity: this.minKnowledgeSimilarity,
    });

    // 3. Get conversation history
    const history = await this.getConversationHistory(conversation.id);

    // 4. Build the prompt
    const messages = this.buildPromptMessages(message.content, classification, knowledgeContext, history, guestContext);

    // 5. Generate response
    const response = await this.provider.complete({
      messages,
      maxTokens: 500,
      temperature: 0.7,
    });

    const duration = Date.now() - startTime;

    log.info(
      {
        conversationId: conversation.id,
        intent: classification.intent,
        confidence: classification.confidence,
        knowledgeHits: knowledgeContext.length,
        guestName: guestContext?.guest?.fullName,
        roomNumber: guestContext?.reservation?.roomNumber,
        duration,
      },
      'AI response generated'
    );

    return {
      content: response.content,
      confidence: classification.confidence,
      intent: classification.intent,
      metadata: {
        classification,
        knowledgeContext: knowledgeContext.map((k) => ({ id: k.id, title: k.title, similarity: k.similarity })),
        usage: response.usage,
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
   * Build the prompt messages for the LLM
   */
  private buildPromptMessages(
    currentMessage: string,
    classification: ClassificationResult,
    knowledgeContext: KnowledgeSearchResult[],
    history: Message[],
    guestContext?: GuestContext
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // System prompt with context
    let systemContent = BUTLER_SYSTEM_PROMPT;

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
}

export { AIResponder as default };
