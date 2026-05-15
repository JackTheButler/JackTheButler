/**
 * generateResponse — calls the AI for a response, populating `ctx.aiResponse`.
 *
 * Composes the LLM message stream as:
 *   - system: `env.prompts.responder(ctx, env)` — the domain reads whatever
 *     it needs from ctx (entity, intent, knowledge hits, memories, plus any
 *     domain-specific extensions on `TCtx`) and env, and may run async work
 *     (e.g. fetching hotel profile) before returning the prompt string.
 *   - history: recent conversation turns (if `loadHistory` ran)
 *   - user: the inbound content (translated if `translateInbound` ran)
 *
 * The domain owns the prompt; the pipeline owns the call.
 *
 * @module stages/generate-response
 */

import type { Stage } from '../core/pipeline.js';
import type { AICompletionMessage } from '../types/ai.js';

export const generateResponse: Stage = async (ctx, env) => {
  if (!ctx.conversation) return;

  // Build the responder prompt from the domain. May be async.
  const systemPrompt = await env.prompts.responder(ctx, env);

  // Compose: system prompt + history + the current user message.
  const messages: AICompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(ctx.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: ctx.inboundTranslation ?? ctx.inbound.content },
  ];

  const result = await env.services.ai.complete({
    messages,
    modelTier: 'reasoning',
    purpose: 'response_generation',
    // Attach a preview of the generated response so the System Health
    // dashboard shows what the AI actually said for each run.
    logFields: (response) => ({
      response: response.length > 120 ? `${response.slice(0, 120)}…` : response,
    }),
  });

  ctx.aiResponse = {
    content: result.content,
    ...(result.usage ? { usage: result.usage } : {}),
  };

  env.services.logger.debug(
    { conversationId: ctx.conversation.id, intent: ctx.classification?.intent },
    'Response generated',
  );
};
