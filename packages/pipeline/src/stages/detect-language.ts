/**
 * detectLanguage — determines the inbound's language and writes a BCP-47
 * code (e.g. `'en'`, `'fr'`, `'ja'`) to `ctx.inboundLanguage`.
 *
 * Three behaviors in one stage:
 *
 *   1. **Detect** — calls the LLM with the domain's `detector` prompt
 *      and the inbound text. The detector prompt should instruct the
 *      LLM to return just a BCP-47 code; this stage is lenient and
 *      extracts a code-like token from whatever it returns.
 *
 *   2. **Persist** — on a successful detection, writes the code back to
 *      `Conversation.language` via `ConversationProvider.setLanguage` so
 *      subsequent turns and outside consumers (staff-reply translation,
 *      UI language badges) can read it.
 *
 *   3. **Fall back** — when detection fails (LLM error, malformed
 *      response) but the conversation already has a persisted language
 *      from a previous turn, that value is read into `ctx.inboundLanguage`.
 *      Without this, a one-turn detection failure would produce an
 *      English reply for a non-English guest.
 *
 * After this stage, `ctx.inboundLanguage` holds the effective language
 * for the rest of the pipeline: current detection > persisted fallback >
 * undefined (treated as "no translation needed" by downstream stages).
 *
 * @module stages/detect-language
 */

import type { Stage } from '../core/pipeline.js';

export const detectLanguage: Stage = async (ctx, env) => {
  if (!ctx.conversation) return;

  let detected: string | undefined;
  try {
    const result = await env.services.ai.complete({
      messages: [
        { role: 'system', content: env.prompts.detector() },
        { role: 'user', content: ctx.inbound.content },
      ],
      modelTier: 'utility',
      purpose: 'language_detection',
      temperature: 0.1,
      // Attach the extracted code to the AI call's telemetry row so the
      // dashboard can show what language the detector concluded.
      logFields: (response) => {
        const code = extractLanguageCode(response);
        return code ? { detectedLanguage: code } : { detectedLanguage: null };
      },
    });

    detected = extractLanguageCode(result.content);
  } catch (err) {
    env.services.logger.warn({ err }, 'Language detection failed');
  }

  if (detected) {
    ctx.inboundLanguage = detected;
    try {
      await env.services.conversation.setLanguage(ctx.conversation.id, detected);
    } catch (err) {
      env.services.logger.warn({ err }, 'Persisting conversation language failed');
    }
  } else if (ctx.conversation.language) {
    // Detection didn't succeed — fall back to the previously persisted value.
    ctx.inboundLanguage = ctx.conversation.language;
  }
};

/**
 * Extract a BCP-47 code-like token from the LLM's response. Strip
 * surrounding punctuation, then try whole-response match first; fall
 * back to the LAST code-like token, since detector LLMs typically end
 * with the answer (e.g. "The language code is: fr (French).").
 */
function extractLanguageCode(text: string): string | undefined {
  const cleaned = text.replace(/[()"',.;!?]/g, ' ').trim();
  const whole = cleaned.match(/^([a-z]{2,3}(?:-[a-z]{2,4})?)$/i);
  if (whole?.[1]) return whole[1].toLowerCase();
  const all = [...cleaned.matchAll(/\b[a-z]{2,3}(?:-[a-z]{2,4})?\b/gi)];
  const last = all[all.length - 1]?.[0];
  return last?.toLowerCase();
}
