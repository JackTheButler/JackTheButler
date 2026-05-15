/**
 * translateInbound — translates the inbound content to `env.systemLanguage`
 * when the user wrote in a different language, writes the result to
 * `ctx.inboundTranslation`. Downstream stages (classifier, responder, …)
 * operate on the translation when available.
 *
 * Runs after `detectLanguage` (which sets `ctx.inboundLanguage`). Skips
 * when no language was detected or it matches the system language.
 *
 * @module stages/translate-inbound
 */

import type { Stage } from '../core/pipeline.js';

export const translateInbound: Stage = async (ctx, env) => {
  if (!ctx.inboundLanguage) return;
  if (ctx.inboundLanguage === env.systemLanguage) return;

  const from = ctx.inboundLanguage;
  const to = env.systemLanguage;
  const systemPrompt = env.prompts.translator(from, to);

  try {
    const result = await env.services.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ctx.inbound.content },
      ],
      modelTier: 'utility',
      purpose: 'translation',
      temperature: 0.1,
      // Attach the translation direction to the telemetry row so the
      // System Health dashboard distinguishes inbound vs outbound
      // translation calls and shows what language pair was processed.
      logFields: () => ({ from, to, direction: 'inbound' }),
    });
    ctx.inboundTranslation = result.content.trim();
  } catch (err) {
    env.services.logger.warn({ err }, 'Inbound translation failed');
  }
};
