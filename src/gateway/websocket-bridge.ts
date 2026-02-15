/**
 * WebSocket Event Bridge
 *
 * Subscribes to domain events and broadcasts updates to connected clients.
 * This keeps services decoupled from WebSocket infrastructure.
 *
 * @module gateway/websocket-bridge
 */

import { events, EventTypes } from '@/events/index.js';
import type { AppEvent, ModelDownloadProgressEvent } from '@/types/events.js';
import { broadcast } from './websocket.js';
import { taskService } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';
import { getApprovalQueue } from '@/core/approval-queue.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('websocket-bridge');

/**
 * Setup event listeners that bridge domain events to WebSocket broadcasts
 */
export function setupWebSocketBridge() {
  log.info('Setting up WebSocket event bridge');

  // ─────────────────────────────────────────────────────────────
  // Task Events
  // ─────────────────────────────────────────────────────────────

  const broadcastTaskStats = async () => {
    try {
      const stats = await taskService.getStats();
      broadcast({ type: 'stats:tasks', payload: stats });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast task stats');
    }
  };

  events.on(EventTypes.TASK_CREATED, broadcastTaskStats);
  events.on(EventTypes.TASK_ASSIGNED, broadcastTaskStats);
  events.on(EventTypes.TASK_COMPLETED, broadcastTaskStats);

  // ─────────────────────────────────────────────────────────────
  // Conversation Events
  // ─────────────────────────────────────────────────────────────

  const broadcastConversationStats = async () => {
    try {
      const stats = await conversationService.getStats();
      broadcast({ type: 'stats:conversations', payload: stats });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast conversation stats');
    }
  };

  events.on(EventTypes.CONVERSATION_CREATED, broadcastConversationStats);
  events.on(EventTypes.CONVERSATION_UPDATED, broadcastConversationStats);
  events.on(EventTypes.CONVERSATION_ESCALATED, broadcastConversationStats);
  events.on(EventTypes.CONVERSATION_RESOLVED, broadcastConversationStats);

  // Broadcast new messages so the dashboard can update instantly
  const broadcastNewMessage = (event: AppEvent) => {
    if ('conversationId' in event && event.conversationId) {
      broadcast({ type: 'conversation:message', payload: { conversationId: event.conversationId } });
    }
  };

  events.on(EventTypes.MESSAGE_RECEIVED, broadcastNewMessage);
  events.on(EventTypes.MESSAGE_SENT, broadcastNewMessage);

  // ─────────────────────────────────────────────────────────────
  // Approval Events
  // ─────────────────────────────────────────────────────────────

  const broadcastApprovalStats = async () => {
    try {
      const queue = getApprovalQueue();
      const stats = await queue.getStats();
      broadcast({ type: 'stats:approvals', payload: stats });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast approval stats');
    }
  };

  events.on(EventTypes.APPROVAL_QUEUED, broadcastApprovalStats);
  events.on(EventTypes.APPROVAL_DECIDED, broadcastApprovalStats);
  events.on(EventTypes.APPROVAL_EXECUTED, broadcastApprovalStats);

  // ─────────────────────────────────────────────────────────────
  // Model Download Events
  // ─────────────────────────────────────────────────────────────

  events.on<ModelDownloadProgressEvent>(EventTypes.MODEL_DOWNLOAD_PROGRESS, (event) => {
    broadcast({ type: 'model:download:progress', payload: event.payload });
  });

  log.info('WebSocket event bridge ready');
}
