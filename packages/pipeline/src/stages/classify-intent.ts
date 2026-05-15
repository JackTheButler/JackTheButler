/**
 * classifyIntent — runs LLM intent classification on the inbound (or its
 * translation), writes the result to `ctx.classification`.
 *
 * Reads the catalog from `env.intents`, builds the system prompt via
 * `env.prompts.classifier(catalog)`, and parses a JSON response of the
 * form `{ "intent": "...", "confidence": 0.X, "reasoning": "..." }`.
 *
 * When `ctx.history` is populated, recent turns are included in the user
 * prompt as text context so the classifier can resolve short ambiguous
 * replies (e.g. "yes" → confirmation of the previous question).
 *
 * On failure (LLM error, malformed JSON), leaves `ctx.classification`
 * undefined — downstream stages treat that as "no intent matched."
 *
 * @module stages/classify-intent
 */

import type { Stage } from '../core/pipeline.js';
import type { Message } from '../types/conversation.js';

export const classifyIntent: Stage = async (ctx, env) => {
  const catalog = env.intents.list();
  if (catalog.length === 0) return;

  const systemPrompt = env.prompts.classifier(catalog);
  const text = ctx.inboundTranslation ?? ctx.inbound.content;
  const userPrompt = buildUserPrompt(text, ctx.history);

  try {
    const result = await env.services.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      modelTier: 'utility',
      purpose: 'intent_classification',
      temperature: 0.1,
      // Attach the parsed intent + confidence + reasoning to the AI
      // call's telemetry row so System Health dashboards can show what
      // the classifier decided, not just that a call happened.
      logFields: (response) => {
        const parsed = parseClassifierResponse(response);
        if (!parsed) return { parseFailed: true };
        return {
          intent: parsed.intent ?? 'unknown',
          confidence: clamp01(parsed.confidence ?? 0),
          ...(parsed.reasoning ? { reasoning: parsed.reasoning } : {}),
        };
      },
    });

    const parsed = parseClassifierResponse(result.content);
    if (!parsed) return;

    ctx.classification = {
      intent: parsed.intent || 'unknown',
      confidence: clamp01(parsed.confidence ?? 0),
      ...(parsed.reasoning ? { reasoning: parsed.reasoning } : {}),
    };
  } catch (err) {
    env.services.logger.warn({ err }, 'Intent classification failed');
  }
};

function buildUserPrompt(text: string, history: readonly Message[] | undefined): string {
  if (!history || history.length === 0) {
    return `Classify this message:\n\n"${text}"\n\nRespond with JSON only.`;
  }

  const contextLines = history
    .map((m) => `[${m.role === 'assistant' ? 'Assistant' : 'User'}] ${m.content}`)
    .join('\n');

  return `Classify the current user message based on the recent conversation context.

Recent conversation:
${contextLines}

Current message: "${text}"

Respond with JSON only.`;
}

interface ParsedClassifier {
  intent?: string;
  confidence?: number;
  reasoning?: string;
}

function parseClassifierResponse(content: string): ParsedClassifier | null {
  // Strip markdown fences if present, then try parsing.
  const cleaned = content.replace(/```json?\s*|\s*```/g, '').trim();
  try {
    return JSON.parse(cleaned) as ParsedClassifier;
  } catch {
    // Try to extract a JSON object from within surrounding text.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ParsedClassifier;
      } catch {
        // fall through
      }
    }
    return null;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
