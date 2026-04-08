import { conversationService } from '@/services/conversation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

/**
 * Loads the last 5 messages of the conversation into ctx.conversationHistory.
 *
 * Runs BEFORE saveInboundMessage so the current message is not yet in the DB
 * and no filtering by savedInboundId is needed.
 */
export async function loadConversationHistory(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;

  try {
    const messages = await conversationService.getMessages(ctx.conversation.id, { limit: 5 });
    if (messages.length > 0) {
      ctx.conversationHistory = messages.map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: (m.direction === 'inbound' && m.translatedContent) ? m.translatedContent : m.content,
      }));
    }
  } catch (err) {
    log.warn({ err }, 'loadConversationHistory: failed to load history');
  }
}
