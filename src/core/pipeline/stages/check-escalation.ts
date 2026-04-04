import { getEscalationManager } from '@/core/escalation-engine.js';
import { conversationService } from '@/services/conversation.js';
import { events, EventTypes } from '@/events/index.js';
import { createLogger } from '@/utils/logger.js';
import { mergeResponseMetadata } from '../context.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function checkEscalation(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse || !ctx.conversation) return;

  const escalationManager = getEscalationManager();
  const decision = await escalationManager.shouldEscalate(
    ctx.conversation.id,
    ctx.inbound.content,
    ctx.aiResponse.confidence ?? 0.5
  );

  if (!decision.shouldEscalate) return;

  ctx.escalated = true;

  log.info(
    { conversationId: ctx.conversation.id, reasons: decision.reasons, priority: decision.priority },
    'Escalating conversation'
  );

  await conversationService.update(ctx.conversation.id, { state: 'escalated' });

  events.emit({
    type: EventTypes.CONVERSATION_ESCALATED,
    conversationId: ctx.conversation.id,
    reasons: decision.reasons,
    priority: decision.priority,
    timestamp: new Date(),
  });

  const notice = decision.priority === 'urgent'
    ? "I'm also connecting you with a staff member who will be with you shortly."
    : "I'm also connecting you with a staff member who can assist you further.";

  ctx.aiResponse.content = `${ctx.aiResponse.content}\n\n${notice}`;
  mergeResponseMetadata(ctx, {
    escalated: true,
    escalationReasons: decision.reasons,
    escalationPriority: decision.priority,
  });
}
