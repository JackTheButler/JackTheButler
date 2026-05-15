/**
 * resolveConversation — first stage. Resolves the entity for this inbound
 * and finds/creates the conversation, populating `ctx.entity` and
 * `ctx.conversation`.
 *
 * Three branches:
 *   1. Inbound carries an explicit `conversationId` → look it up by id.
 *   2. Otherwise → find or create by `channel` + `channelId`.
 *   3. If we couldn't auto-identify but the conversation has an `entityId`
 *      (e.g. post-verification webchat) → look up the entity by id.
 *
 * @module stages/resolve-conversation
 */

import type { Stage } from '../core/pipeline.js';

export const resolveConversation: Stage = async (ctx, env) => {
  // 1. Try to identify the entity from the inbound's channel identity.
  let entity = await env.services.entities.resolve(ctx.inbound);

  // 2. Find or create the conversation.
  let conv;
  if (ctx.inbound.conversationId) {
    conv = await env.services.conversation.findById(ctx.inbound.conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${ctx.inbound.conversationId}`);
    }
  } else {
    conv = await env.services.conversation.findOrCreate(
      ctx.inbound.channel,
      ctx.inbound.channelId,
      entity?.id ?? null,
    );
  }

  // 3. Post-verification fallback: if the inbound couldn't auto-identify
  // but the conversation is already linked to an entity, look it up.
  if (!entity && conv.entityId) {
    entity = await env.services.entities.findById(conv.entityId);
  }

  ctx.conversation = conv;
  ctx.entity = entity;

  env.services.logger.debug(
    { conversationId: conv.id, entityId: entity?.id ?? null },
    'Conversation resolved',
  );
};
