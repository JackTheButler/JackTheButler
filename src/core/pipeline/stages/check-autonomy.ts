import { getAutonomyEngine, type GuestContext as AutonomyContext } from '@/core/approval/autonomy.js';
import type { ClassificationResult } from '@/core/ai/intent/index.js';
import { getApprovalQueue } from '@/core/approval/queue.js';
import { conversationService } from '@/services/conversation.js';
import { translate } from '@/utils/translation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function checkAutonomy(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse || !ctx.conversation) return;

  const autonomyEngine = getAutonomyEngine();
  await autonomyEngine.ensureLoaded();

  const autonomyContext: AutonomyContext = {
    guestId: ctx.guestContext?.guest?.id ?? undefined,
    loyaltyTier: ctx.guestContext?.guest?.loyaltyTier ?? undefined,
    roomNumber: ctx.guestContext?.reservation?.roomNumber ?? undefined,
  };

  const canAutoExecute = autonomyEngine.canAutoExecute('respondToGuest', autonomyContext);
  const confidenceDecision = autonomyEngine.shouldAutoExecuteByConfidence(ctx.aiResponse.confidence ?? 0.5);

  if (canAutoExecute && confidenceDecision !== 'approval_required') return;

  const approvalQueue = getApprovalQueue();
  const approvalItem = await approvalQueue.queueForApproval({
    type: 'response',
    actionType: 'respondToGuest',
    actionData: {
      conversationId: ctx.conversation.id,
      content: ctx.aiResponse.content,
      intent: ctx.aiResponse.intent,
      confidence: ctx.aiResponse.confidence,
      metadata: ctx.aiResponse.metadata,
    },
    conversationId: ctx.conversation.id,
    guestId: ctx.guestContext?.guest?.id ?? undefined,
  });

  ctx.approvalReason = !canAutoExecute ? 'autonomy_level' : 'low_confidence';
  ctx.approvalId = approvalItem.id;

  log.info(
    { conversationId: ctx.conversation.id, approvalId: approvalItem.id, reason: ctx.approvalReason },
    'Response queued for approval'
  );

  const pendingContent = getPendingMessage(ctx.classification, ctx.guestContext?.guest?.firstName);
  const guestLang = ctx.detectedLanguage ?? ctx.conversation.guestLanguage ?? 'en';
  let translatedPending: string | undefined;

  // Translate the pending holding message — separate from the translateResponse stage,
  // which handles ctx.aiResponse.content in the normal (non-approval) path.
  if (guestLang !== ctx.propertyLanguage) {
    try {
      translatedPending = await translate(pendingContent, guestLang, ctx.propertyLanguage ?? 'en');
    } catch (err) {
      log.warn({ err }, 'Pending message translation failed');
    }
  }

  await conversationService.addMessage(ctx.conversation.id, {
    direction: 'outbound',
    senderType: 'ai',
    content: pendingContent,
    translatedContent: translatedPending,
    contentType: 'text',
  });

  ctx.outbound = {
    conversationId: ctx.conversation.id,
    content: translatedPending ?? pendingContent,
    contentType: 'text',
    metadata: {
      pendingApproval: true,
      approvalId: approvalItem.id,
      originalResponse: ctx.aiResponse.content,
    },
  };
  ctx.done = true;
}

function getPendingMessage(classification?: ClassificationResult, firstName?: string): string {
  const name = firstName ?? 'there';
  const prefix = `Thanks ${name}`;
  const intent = classification?.intent;
  const department = classification?.department;

  // Special cases that need intent-level precision
  if (intent === 'emergency') {
    return `${prefix}, I've immediately alerted our team. Someone will be with you right away.`;
  }
  if (intent === 'feedback.complaint') {
    return `${prefix}, I'm sorry to hear that. I've flagged your concern and a manager will follow up with you shortly.`;
  }
  if (intent?.startsWith('inquiry')) {
    return `${prefix}, great question! Let me check on that — someone from our team will get back to you shortly.`;
  }

  // Route by department for all other intents
  switch (department) {
    case 'housekeeping':
      return `${prefix}, I've noted your housekeeping request. Our team will arrange this and confirm shortly.`;
    case 'maintenance':
      return `${prefix}, I've flagged this with our maintenance team. Someone will look into it shortly.`;
    case 'room_service':
      return `${prefix}, I've passed your order along. Our room service team will confirm shortly.`;
    case 'concierge':
      return `${prefix}, I'm arranging this for you. Someone will confirm the details shortly.`;
    case 'front_desk':
      return `${prefix}, I've forwarded your request to our front desk. They'll get back to you shortly.`;
    default:
      return `${prefix}, I'm looking into this for you. Someone from our team will get back to you shortly.`;
  }
}
