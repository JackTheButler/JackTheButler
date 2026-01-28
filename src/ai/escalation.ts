/**
 * Escalation Manager
 *
 * Determines when conversations should be escalated to human staff.
 * Uses multiple signals: confidence, sentiment, repetition, explicit requests, VIP status.
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { messages, conversations, guests, reservations } from '@/db/schema.js';
import type { Guest } from '@/db/schema.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:escalation');

/**
 * Escalation decision result
 */
export interface EscalationDecision {
  shouldEscalate: boolean;
  reasons: string[];
  priority: 'urgent' | 'high' | 'standard';
  confidence: number;
}

/**
 * Escalation configuration
 */
export interface EscalationConfig {
  confidenceThreshold: number; // Escalate if AI confidence below this
  sentimentThreshold: number; // Escalate if sentiment below this (negative)
  repetitionWindow: number; // Number of recent messages to check for repetition
  repetitionThreshold: number; // Similarity threshold for repetition detection
}

const DEFAULT_CONFIG: EscalationConfig = {
  confidenceThreshold: 0.6,
  sentimentThreshold: -0.5,
  repetitionWindow: 5,
  repetitionThreshold: 0.7,
};

/**
 * Patterns that indicate guest wants to speak to a human
 */
const ESCALATION_PATTERNS = [
  /\b(speak|talk)\s*(to|with)\s*(a\s*)?(human|person|staff|manager|someone|agent|representative)/i,
  /\b(need|want)\s*(a\s*)?(human|person|staff|manager|real\s*person)/i,
  /\breal\s*person/i,
  /\bnot\s*(a\s*)?bot/i,
  /\bstop\s*(the\s*)?bot/i,
  /\bget\s*me\s*(a\s*)?(human|manager|staff)/i,
  /\bmanager\s*please/i,
  /\bhuman\s*please/i,
  /\bescalate/i,
  /\bfront\s*desk/i,
  /\bcall\s*(the\s*)?(hotel|reception)/i,
];

/**
 * Patterns that indicate frustration or negative sentiment
 */
const NEGATIVE_PATTERNS = [
  /\b(terrible|horrible|awful|worst|disgusting|unacceptable|ridiculous|pathetic)/i,
  /\b(angry|furious|outraged|livid|upset|frustrated|annoyed|irritated)/i,
  /\b(never\s*again|waste\s*of\s*(time|money))/i,
  /\b(don't\s*understand|not\s*listening|you're\s*not\s*helping)/i,
  /\b(useless|hopeless|incompetent|stupid)/i,
  /(!{2,}|\?{2,})/i, // Multiple exclamation or question marks
];

/**
 * Patterns that indicate positive sentiment
 */
const POSITIVE_PATTERNS = [
  /\b(thank|thanks|appreciate|grateful|wonderful|excellent|amazing|great|perfect|lovely)/i,
  /\b(helpful|fantastic|brilliant|outstanding)/i,
  /\b(love\s*it|love\s*this|enjoying)/i,
];

/**
 * Escalation Manager
 */
export class EscalationManager {
  private config: EscalationConfig;

  constructor(config: Partial<EscalationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info({ config: this.config }, 'Escalation manager initialized');
  }

  /**
   * Determine if a conversation should be escalated
   */
  async shouldEscalate(
    conversationId: string,
    messageContent: string,
    classificationConfidence: number
  ): Promise<EscalationDecision> {
    const reasons: string[] = [];

    // Get conversation details
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();

    if (!conversation) {
      log.warn({ conversationId }, 'Conversation not found for escalation check');
      return {
        shouldEscalate: false,
        reasons: [],
        priority: 'standard',
        confidence: 1,
      };
    }

    // 1. Check low confidence
    if (classificationConfidence < this.config.confidenceThreshold) {
      reasons.push(`Low AI confidence (${(classificationConfidence * 100).toFixed(0)}%)`);
    }

    // 2. Check for explicit escalation request
    if (this.detectEscalationRequest(messageContent)) {
      reasons.push('Guest requested human assistance');
    }

    // 3. Analyze sentiment
    const sentiment = this.analyzeSentiment(messageContent);
    if (sentiment < this.config.sentimentThreshold) {
      reasons.push(`Negative sentiment detected (${sentiment.toFixed(2)})`);
    }

    // 4. Check for repetition (frustration indicator)
    const recentMessages = await this.getRecentMessages(conversationId);
    if (this.detectRepetition(messageContent, recentMessages)) {
      reasons.push('Guest repeating similar request');
    }

    // 5. Check VIP status
    let guest: Guest | null = null;
    if (conversation.guestId) {
      guest = await db
        .select()
        .from(guests)
        .where(eq(guests.id, conversation.guestId))
        .get() || null;

      if (guest?.vipStatus) {
        reasons.push(`VIP guest (${guest.vipStatus})`);
      }
    }

    // 6. Check active reservation status
    if (conversation.reservationId) {
      const reservation = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, conversation.reservationId))
        .get();

      if (reservation?.status === 'checked_in') {
        // Currently staying guests get slightly higher priority
        if (reasons.length > 0) {
          reasons.push('Currently checked-in guest');
        }
      }
    }

    // Calculate priority based on reasons
    const priority = this.calculatePriority(reasons, guest);

    // Calculate decision confidence
    const decisionConfidence = reasons.length > 0 ? Math.min(reasons.length * 0.3, 0.95) : 0;

    const decision: EscalationDecision = {
      shouldEscalate: reasons.length > 0,
      reasons,
      priority,
      confidence: decisionConfidence,
    };

    if (decision.shouldEscalate) {
      log.info(
        {
          conversationId,
          reasons,
          priority,
        },
        'Escalation triggered'
      );
    }

    return decision;
  }

  /**
   * Detect if the message contains an explicit escalation request
   */
  detectEscalationRequest(content: string): boolean {
    return ESCALATION_PATTERNS.some((pattern) => pattern.test(content));
  }

  /**
   * Analyze sentiment of a message
   * Returns a value from -1 (very negative) to 1 (very positive)
   */
  analyzeSentiment(content: string): number {
    let score = 0;

    // Check negative patterns
    for (const pattern of NEGATIVE_PATTERNS) {
      if (pattern.test(content)) {
        score -= 0.4;
      }
    }

    // Check positive patterns
    for (const pattern of POSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        score += 0.3;
      }
    }

    // Check for all caps (shouting)
    const words = content.split(/\s+/).filter((w) => w.length > 3);
    const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
    if (words.length > 0 && capsWords.length / words.length > 0.5) {
      score -= 0.3;
    }

    // Normalize to [-1, 1]
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Get recent messages from a conversation
   */
  private async getRecentMessages(conversationId: string): Promise<string[]> {
    const recentMsgs = await db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(this.config.repetitionWindow);

    return recentMsgs.map((m) => m.content);
  }

  /**
   * Detect if the current message is similar to recent messages
   * (indicates guest frustration from repeating themselves)
   */
  detectRepetition(currentMessage: string, recentMessages: string[]): boolean {
    if (recentMessages.length < 2) {
      return false;
    }

    const currentNormalized = this.normalizeForComparison(currentMessage);

    // Check similarity against recent messages (skip first as it might be the same)
    for (let i = 1; i < recentMessages.length; i++) {
      const prevMessage = recentMessages[i];
      if (!prevMessage) continue;

      const prevNormalized = this.normalizeForComparison(prevMessage);
      const similarity = this.calculateSimilarity(currentNormalized, prevNormalized);

      if (similarity > this.config.repetitionThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize message for comparison (remove punctuation, lowercase)
   */
  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate simple word-based similarity between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));

    if (wordsA.size === 0 || wordsB.size === 0) {
      return 0;
    }

    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;

    return intersection / union; // Jaccard similarity
  }

  /**
   * Calculate priority based on escalation reasons
   */
  private calculatePriority(
    reasons: string[],
    guest: Guest | null
  ): 'urgent' | 'high' | 'standard' {
    // VIP always gets high priority minimum
    if (guest?.vipStatus === 'platinum' || guest?.vipStatus === 'gold') {
      if (reasons.length >= 2) {
        return 'urgent';
      }
      return 'high';
    }

    // Multiple reasons = higher priority
    if (reasons.length >= 3) {
      return 'urgent';
    }

    if (reasons.length >= 2) {
      return 'high';
    }

    // Check for specific urgent triggers
    const urgentTriggers = [
      'Guest requested human assistance',
      'Guest repeating similar request',
    ];

    for (const reason of reasons) {
      if (urgentTriggers.some((trigger) => reason.includes(trigger))) {
        return 'high';
      }
    }

    return 'standard';
  }
}

/**
 * Cached manager instance
 */
let cachedManager: EscalationManager | null = null;

/**
 * Get the escalation manager
 */
export function getEscalationManager(config?: Partial<EscalationConfig>): EscalationManager {
  if (!cachedManager) {
    cachedManager = new EscalationManager(config);
  }
  return cachedManager;
}

/**
 * Reset cached manager (for testing)
 */
export function resetEscalationManager(): void {
  cachedManager = null;
}
