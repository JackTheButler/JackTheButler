/**
 * translateOutbound — translates the AI response from `env.systemLanguage`
 * back to the user's language when they differ, writes the result to
 * `ctx.outboundTranslation`. `saveOutboundMessage` then uses the
 * translated text when persisting the outbound message.
 *
 * Skips when no AI response, no detected language, or languages match.
 *
 * @module stages/translate-outbound
 */

import type { Stage } from '../core/pipeline.js';

export const translateOutbound: Stage = async (ctx, env) => {
  if (!ctx.aiResponse) return;
  if (!ctx.inboundLanguage) return;
  if (ctx.inboundLanguage === env.systemLanguage) return;

  const from = env.systemLanguage;
  const to = ctx.inboundLanguage;
  const systemPrompt = env.prompts.translator(from, to);

  try {
    const result = await env.services.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ctx.aiResponse.content },
      ],
      modelTier: 'utility',
      purpose: 'translation',
      temperature: 0.1,
      // Attach the translation direction to the telemetry row so the
      // System Health dashboard distinguishes inbound vs outbound
      // translation calls and shows what language pair was processed.
      logFields: () => ({ from, to, direction: 'outbound' }),
    });
    ctx.outboundTranslation = result.content.trim();
  } catch (err) {
    env.services.logger.warn({ err }, 'Outbound translation failed');
  }
};
