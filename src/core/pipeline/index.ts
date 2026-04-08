/**
 * Message Pipeline
 *
 * Orchestrates the processing of an inbound guest message through a sequence
 * of discrete stages. Each stage reads from and writes to a shared MessageContext.
 *
 * Error handling and activity logging wrap the pipeline — they are not stages.
 *
 * @module core/pipeline
 */

import { createContext, runPipeline } from './context.js';
import { resolveConversation } from './stages/resolve-conversation.js';
import { detectLanguage } from './stages/detect-language.js';
import { loadConversationHistory } from './stages/load-conversation-history.js';
import { saveInboundMessage } from './stages/save-inbound-message.js';
import { computeEmbedding } from './stages/compute-embedding.js';
import { searchKnowledge } from './stages/search-knowledge.js';
import { recallMemories } from './stages/recall-memories.js';
import { classifyIntent } from './stages/classify-intent.js';
import { checkVerification } from './stages/check-verification.js';
import { generateResponse } from './stages/generate-response.js';
import { routeTask } from './stages/route-task.js';
import { checkEscalation } from './stages/check-escalation.js';
import { checkAutonomy } from './stages/check-autonomy.js';
import { translateResponse } from './stages/translate-response.js';
import { saveOutboundMessage } from './stages/save-outbound-message.js';
import { events, EventTypes } from '@/events/index.js';
import { writeActivityLog } from '@/services/activity-log.js';
import { createLogger } from '@/utils/logger.js';
import type { InboundMessage, OutboundMessage } from '@/types/message.js';

const log = createLogger('core:processor');

const STAGES = [
  resolveConversation,
  detectLanguage,
  loadConversationHistory,
  saveInboundMessage,
  classifyIntent,
  checkVerification,
  computeEmbedding,
  searchKnowledge,
  recallMemories,
  generateResponse,
  routeTask,
  checkEscalation,
  checkAutonomy,
  translateResponse,
  saveOutboundMessage,
];

export async function processMessage(inbound: InboundMessage): Promise<OutboundMessage> {
  const ctx = createContext(inbound);

  log.info(
    { messageId: inbound.id, channel: inbound.channel, channelId: inbound.channelId },
    'Processing inbound message'
  );

  try {
    await runPipeline(ctx, STAGES);

    const knowledgeContext = ctx.aiResponse?.metadata?.knowledgeContext as
      | Array<{ title: string; similarity: number }>
      | undefined;

    ctx.outcome = 'success';
    ctx.outcomeDetails = {
      actionTaken: ctx.approvalId ? 'approval_queued' : 'responded',
      intent: ctx.aiResponse?.intent,
      confidence: ctx.aiResponse?.confidence,
      detectedLanguage: ctx.detectedLanguage,
      escalated: ctx.escalated ?? false,
      taskCreated: ctx.taskCreated ?? false,
      taskId: ctx.aiResponse?.metadata?.taskId ?? undefined,
      approvalId: ctx.approvalId,
      approvalReason: ctx.approvalReason,
      responseLength: ctx.outbound?.content.length,
      knowledgeHits: knowledgeContext?.length ?? 0,
      ...(knowledgeContext?.[0] && {
        topKnowledgeMatch: knowledgeContext[0].title,
        topKnowledgeSimilarity: knowledgeContext[0].similarity,
      }),
    };

    const duration = Date.now() - ctx.startTime;
    log.info(
      { conversationId: ctx.conversation?.id, duration, intent: ctx.aiResponse?.intent, pendingApproval: !!ctx.approvalId },
      'Message processed'
    );

    return ctx.outbound!;
  } catch (err) {
    ctx.outcome = 'failed';
    ctx.outcomeDetails = {
      actionTaken: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };

    if (ctx.conversation?.id && ctx.savedInboundId) {
      try {
        events.emit({
          type: EventTypes.MESSAGE_FAILED,
          conversationId: ctx.conversation.id,
          messageId: ctx.savedInboundId,
          channel: inbound.channel,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date(),
        });
      } catch {
        // Never let event emission affect the original error
      }
    }

    throw err;
  } finally {
    try {
      writeActivityLog(
        inbound.channel,
        'processor.outcome',
        ctx.outcome ?? 'failed',
        ctx.conversation?.id,
        ctx.outcome === 'failed'
          ? (ctx.outcomeDetails?.error as string | undefined)
          : undefined,
        Date.now() - ctx.startTime,
        ctx.outcomeDetails
      );
    } catch {
      // Never let a log write replace the original error or block the response
    }
  }
}
