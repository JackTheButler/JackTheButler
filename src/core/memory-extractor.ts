/**
 * Memory Extractor
 *
 * Extracts durable guest facts from a closed conversation transcript
 * using the active AI provider. Returns typed MemoryFact[] for storage
 * by MemoryService. Does not write to the database.
 *
 * @module core/memory-extractor
 */

import type { Message } from '@/db/schema.js';
import type { LLMProvider } from '@/ai/types.js';
import type { MemoryFact } from '@/services/memory.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('core:memory-extractor');

const EXTRACTION_SYSTEM_PROMPT = `You are a hotel guest profiling assistant. Your job is to read a hotel conversation and extract durable facts about the guest that would be useful to remember on their next visit.

EXTRACT facts that are:
- Preferences (room type, temperature, pillow type, floor, noise sensitivity, view)
- Complaints (recurring issues the guest raised)
- Habits (things the guest always does or orders)
- Personal details (travelling with family/pets, reason for stay, dietary needs)
- Standing requests (things they always want prepared on arrival)

DO NOT EXTRACT:
- One-time transient requests ("please send towels now", "wake me at 7am today")
- Payment, card, or financial details
- Passport, ID, or government document numbers
- Diagnosed medical conditions or prescription medications
- Anything that was already resolved and won't recur

NOTE: Food allergies, dietary requirements (vegetarian, halal, gluten-free), and practical intolerances (feather pillows, certain fabrics) SHOULD be extracted under "personal" — these are safety-relevant and recurring.

OUTPUT FORMAT:
Return a JSON array. Each element must have exactly these fields:
- "category": one of "preference", "complaint", "habit", "personal", "request"
- "content": a short, clear statement in third person ("Prefers a quiet room away from the elevator")
- "confidence": a number from 0.0 to 1.0 reflecting how certain you are this is a durable fact

If there are no durable facts to extract, return an empty array: []

Return ONLY the JSON array — no explanation, no markdown, no code fences.`;

/**
 * Formats a conversation transcript for the extraction prompt.
 * Uses translatedContent when available so the AI always reads English.
 */
function formatTranscript(messages: Message[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    // Skip system messages (internal routing, status updates)
    if (msg.senderType === 'system') continue;

    const speaker = msg.senderType === 'guest' ? 'Guest' : 'Jack';
    // Use the translated version if available — extraction always runs on English content
    const text = msg.translatedContent ?? msg.content;
    lines.push(`${speaker}: ${text}`);
  }

  return lines.join('\n');
}

/**
 * Strips markdown code fences the AI sometimes wraps around JSON output.
 */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Validates that a parsed value matches the MemoryFact shape.
 */
function isValidFact(value: unknown): value is MemoryFact {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  const validCategories = ['preference', 'complaint', 'habit', 'personal', 'request'];
  return (
    typeof v['category'] === 'string' &&
    validCategories.includes(v['category']) &&
    typeof v['content'] === 'string' &&
    v['content'].length > 0 &&
    typeof v['confidence'] === 'number' &&
    v['confidence'] >= 0 &&
    v['confidence'] <= 1
  );
}

/**
 * Extracts durable guest facts from a conversation transcript.
 */
export class MemoryExtractor {
  constructor(private readonly provider: LLMProvider) {}

  /**
   * Extract durable facts from a list of conversation messages.
   * @param messages - All messages from the closed conversation
   * @param conversationId - Optional, used only for log context
   * Returns an empty array if parsing fails — never throws.
   */
  async extract(messages: Message[], conversationId?: string): Promise<MemoryFact[]> {
    if (messages.length === 0) return [];

    const transcript = formatTranscript(messages);
    if (!transcript.trim()) return [];

    try {
      const response = await this.provider.complete({
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Here is the conversation transcript:\n\n${transcript}\n\nExtract the durable guest facts as a JSON array.`,
          },
        ],
        modelTier: 'utility',
        temperature: 0.1, // low temperature for consistent structured output
        maxTokens: 2048,
      });

      const raw = stripCodeFences(response.content);
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        log.warn({ raw }, 'Memory extractor: AI response was not a JSON array');
        return [];
      }

      const facts = parsed.filter(isValidFact);

      if (facts.length < parsed.length) {
        log.warn(
          { total: parsed.length, valid: facts.length },
          'Memory extractor: some facts were invalid and skipped',
        );
      }

      log.info({ count: facts.length, conversationId }, 'Extracted guest memory facts');
      return facts;
    } catch (err) {
      log.error({ err, conversationId }, 'Memory extractor: failed to extract facts');
      return [];
    }
  }
}
