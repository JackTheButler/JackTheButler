/**
 * saveInboundMessage — persists the inbound message to the conversation
 * as a user turn. Runs after `resolveConversation`.
 *
 * Saves the original content as `content` and, when detection / translation
 * ran, the language code and translated content as `language` / `translation`.
 * Consumers are free to persist these to separate columns or to merge them
 * into a single record — the package only declares the shape.
 *
 * @module stages/save-inbound-message
 */

import type { Stage } from '../core/pipeline.js';

export const saveInboundMessage: Stage = async (ctx, env) => {
  if (!ctx.conversation) return;

  const { id } = await env.services.conversation.addMessage(ctx.conversation.id, {
    role: 'user',
    content: ctx.inbound.content,
    ...(ctx.inboundLanguage ? { language: ctx.inboundLanguage } : {}),
    ...(ctx.inboundTranslation ? { translation: ctx.inboundTranslation } : {}),
    ...(ctx.inbound.metadata ? { metadata: ctx.inbound.metadata } : {}),
  });

  ctx.savedInboundId = id;
};
