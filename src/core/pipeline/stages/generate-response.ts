import { defaultResponder } from '@/core/ai/index.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function generateResponse(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;
  ctx.aiResponse = await defaultResponder.generate(ctx.conversation, ctx.inbound, ctx.guestContext, ctx.knowledgeResults, ctx.memories, ctx.classification, ctx.verification);
  log.debug({ conversationId: ctx.conversation.id, intent: ctx.aiResponse.intent }, 'Response generated');
}
