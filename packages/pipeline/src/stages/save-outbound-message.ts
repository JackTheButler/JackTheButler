/**
 * saveOutboundMessage — persists the AI response to the conversation
 * as an assistant turn and builds the `OutboundMessage` that
 * `pipeline.process` returns.
 *
 * Symmetric with `saveInboundMessage`:
 *   - `Message.content` carries the **original** AI output (in the
 *     system language).
 *   - `Message.translation` carries the user-language version produced
 *     by `translateOutbound`, when one exists.
 *   - The `OutboundMessage` returned to the caller carries the
 *     **delivered** text — translation if present, otherwise the
 *     original — so the channel can send it to the user as-is.
 *
 * Storing both lets consumers audit what the AI wrote vs what was sent.
 *
 * @module stages/save-outbound-message
 */

import type { Stage } from '../core/pipeline.js';

export const saveOutboundMessage: Stage = async (ctx, env) => {
  if (!ctx.conversation || !ctx.aiResponse) return;

  const original = ctx.aiResponse.content;
  const translation = ctx.outboundTranslation;
  const delivered = translation ?? original;
  const metadata = ctx.aiResponse.metadata;

  const { id } = await env.services.conversation.addMessage(ctx.conversation.id, {
    role: 'assistant',
    content: original,
    language: env.systemLanguage,
    ...(translation ? { translation } : {}),
    ...(metadata ? { metadata } : {}),
  });

  ctx.outbound = {
    id,
    conversationId: ctx.conversation.id,
    content: delivered,
    createdAt: new Date(),
    ...(metadata ? { metadata } : {}),
  };
};
