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
import { conversationService } from '@/services/conversation.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('websocket-bridge');

/**
 * Setup event listeners that bridge domain events to WebSocket broadcasts
 */
export function setupWebSocketBridge() {

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
  // Model Download Events
  // ─────────────────────────────────────────────────────────────

  events.on<ModelDownloadProgressEvent>(EventTypes.MODEL_DOWNLOAD_PROGRESS, (event) => {
    broadcast({ type: 'model:download:progress', payload: event.payload });
  });

  log.info('WebSocket event bridge ready');
}
