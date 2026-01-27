/**
 * Intent Classifier
 *
 * Classifies guest messages into intent categories using LLM.
 */

import type { LLMProvider } from '../types.js';
import { IntentTaxonomy, getIntentDefinition } from './taxonomy.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:intent');

export { IntentTaxonomy, getIntentDefinition, getIntentNames } from './taxonomy.js';

/**
 * Classification result
 */
export interface ClassificationResult {
  intent: string;
  confidence: number;
  department: string | null;
  requiresAction: boolean;
  reasoning?: string | undefined;
}

/**
 * Intent Classifier using LLM
 */
export class IntentClassifier {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
    log.info({ provider: provider.name }, 'Intent classifier initialized');
  }

  /**
   * Classify a message into an intent category
   */
  async classify(message: string): Promise<ClassificationResult> {
    log.debug({ message: message.substring(0, 50) }, 'Classifying message');

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(message);

    try {
      const response = await this.provider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 150,
        temperature: 0.1, // Low temperature for consistent classification
      });

      const result = this.parseResponse(response.content);

      log.info(
        {
          message: message.substring(0, 30),
          intent: result.intent,
          confidence: result.confidence,
        },
        'Message classified'
      );

      return result;
    } catch (error) {
      log.error({ error, message: message.substring(0, 50) }, 'Classification failed');

      // Return unknown intent on error
      return {
        intent: 'unknown',
        confidence: 0,
        department: null,
        requiresAction: false,
      };
    }
  }

  /**
   * Build the system prompt with intent taxonomy
   */
  private buildSystemPrompt(): string {
    const intentList = Object.entries(IntentTaxonomy)
      .map(([name, def]) => `- ${name}: ${def.description}`)
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

  /**
   * Build the user prompt
   */
  private buildUserPrompt(message: string): string {
    return `Classify this guest message:

"${message}"

Respond with JSON only.`;
  }

  /**
   * Parse the LLM response into a ClassificationResult
   */
  private parseResponse(content: string): ClassificationResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        intent: string;
        confidence: number;
        reasoning?: string;
      };

      const intent = parsed.intent || 'unknown';
      const definition = getIntentDefinition(intent);

      return {
        intent,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        department: definition?.department ?? null,
        requiresAction: definition?.requiresAction ?? false,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      log.warn({ error, content: content.substring(0, 100) }, 'Failed to parse classification');

      return {
        intent: 'unknown',
        confidence: 0,
        department: null,
        requiresAction: false,
      };
    }
  }

  /**
   * Classify multiple messages in batch
   */
  async classifyBatch(messages: string[]): Promise<ClassificationResult[]> {
    // For now, classify sequentially (could be parallelized)
    const results: ClassificationResult[] = [];

    for (const message of messages) {
      const result = await this.classify(message);
      results.push(result);
    }

    return results;
  }
}

export { IntentClassifier as default };
