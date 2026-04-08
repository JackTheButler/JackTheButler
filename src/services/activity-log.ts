/**
 * Activity Log Service
 *
 * Writes business events to the activity_log table and subscribes to the
 * system event bus. All writes are fire-and-forget — they never block the
 * critical path that emitted the event.
 *
 * Layer 1 subscriber: covers message and conversation events from core.
 * Layers 2–5 write directly via writeActivityLog() from their own modules.
 *
 * @module services/activity-log
 */

import { db, activityLog } from '@/db/index.js';
import { events } from '@/events/index.js';
import {
  EventTypes,
  type MessageReceivedEvent,
  type MessageSentEvent,
  type MessageFailedEvent,
  type ConversationEscalatedEvent,
  type WebchatConnectedEvent,
  type WebchatDisconnectedEvent,
  type WebchatErrorEvent,
} from '@/types/events.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('activity-log');

/**
 * Insert a single row into activity_log.
 * Exported so other layers (webhook middleware, processor, scheduler) can call
 * it directly without going through the event bus.
 */
export function writeActivityLog(
  source: string,
  eventType: string,
  status: 'success' | 'failed',
  conversationId: string | undefined,
  errorMessage: string | undefined,
  latencyMs: number | undefined,
  details: Record<string, unknown> | undefined
): void {
  db.insert(activityLog)
    .values({
      id: crypto.randomUUID(),
      source,
      eventType,
      status,
      conversationId: conversationId ?? null,
      errorMessage: errorMessage ?? null,
      latencyMs: latencyMs ?? null,
      details: details ? JSON.stringify(details) : null,
      createdAt: now(),
    })
    .run();
}

/**
 * Subscribe to the system event bus and write activity log rows.
 * Call once during server startup after the database is ready.
 */
export function subscribeActivityLogToEvents(): void {
  events.on(EventTypes.MESSAGE_RECEIVED, (event: MessageReceivedEvent) => {
    try {
      writeActivityLog(event.channel, 'message.saved', 'success', event.conversationId, undefined, undefined, {
        messageId: event.messageId,
        contentType: event.contentType,
        contentLength: event.content?.length ?? 0,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.MESSAGE_SENT, (event: MessageSentEvent) => {
    try {
      writeActivityLog(event.channel, 'message.sent', 'success', event.conversationId, undefined, undefined, {
        messageId: event.messageId,
        senderType: event.senderType,
        contentLength: event.content?.length ?? 0,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.MESSAGE_FAILED, (event: MessageFailedEvent) => {
    try {
      writeActivityLog(event.channel, 'message.failed', 'failed', event.conversationId, event.error, undefined, {
        messageId: event.messageId,
        channel: event.channel,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.CONVERSATION_ESCALATED, (event: ConversationEscalatedEvent) => {
    try {
      writeActivityLog('system', 'conversation.escalated', 'success', event.conversationId, undefined, undefined, { reasons: event.reasons, priority: event.priority });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.WEBCHAT_CONNECTED, (event: WebchatConnectedEvent) => {
    try {
      writeActivityLog('webchat', 'webchat.connected', 'success', undefined, undefined, undefined, {
        sessionId: event.sessionId,
        restored: event.restored,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.WEBCHAT_DISCONNECTED, (event: WebchatDisconnectedEvent) => {
    try {
      writeActivityLog('webchat', 'webchat.disconnected', 'success', undefined, undefined, undefined, {
        sessionId: event.sessionId,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  events.on(EventTypes.WEBCHAT_ERROR, (event: WebchatErrorEvent) => {
    try {
      writeActivityLog('webchat', 'webchat.error', 'failed', undefined, event.error, undefined, {
        sessionId: event.sessionId,
      });
    } catch (err) {
      log.warn({ err }, 'Activity log write failed');
    }
  });

  log.info('Activity log event subscribers registered');
}
