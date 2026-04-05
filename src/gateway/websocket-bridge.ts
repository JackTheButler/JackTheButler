/**
 * WebSocket Event Bridge
 *
 * Subscribes to domain events and broadcasts updates to connected clients.
 * This keeps services decoupled from WebSocket infrastructure.
 *
 * @module gateway/websocket-bridge
 */

import { events, EventTypes } from '@/events/index.js';
import type { AppEvent, ModelDownloadProgressEvent, TaskCreatedEvent, ConversationEscalatedEvent, ConversationUpdatedEvent, ReservationCheckedInEvent, ReservationCheckedOutEvent, MessageSentEvent } from '@/types/events.js';
import { db, tasks, conversations, reservations, guests } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import type { ActivityItem } from './routes/activities.js';
import { broadcast } from './websocket.js';
import { taskService } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';
import { getApprovalQueue } from '@/core/approval-queue.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('websocket-bridge');

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Setup event listeners that bridge domain events to WebSocket broadcasts
 */
export function setupWebSocketBridge() {

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

  // ─────────────────────────────────────────────────────────────
  // Activity Feed Events
  // ─────────────────────────────────────────────────────────────

  const broadcastActivity = (item: ActivityItem) => {
    broadcast({ type: 'activity:event', payload: item });
  };

  events.on<TaskCreatedEvent>(EventTypes.TASK_CREATED, async (event) => {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, event.taskId)).limit(1);
      if (!task) return;
      const label = task.type.replace('_', ' ');
      const text = `${label.charAt(0).toUpperCase() + label.slice(1)} task created`;
      const detail = [task.roomNumber ? `Room ${task.roomNumber}` : null, task.priority !== 'standard' ? capitalize(task.priority) : null]
        .filter(Boolean)
        .join(' · ') || 'New task';
      broadcastActivity({ id: `task-${task.id}`, type: 'task_created', text, detail, ts: Date.now(), data: { taskType: task.type, ...(task.priority !== 'standard' ? { priority: task.priority } : {}), ...(task.roomNumber ? { roomNumber: task.roomNumber } : {}) } });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast task activity');
    }
  });

  events.on<ConversationEscalatedEvent>(EventTypes.CONVERSATION_ESCALATED, async (event) => {
    try {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, event.conversationId)).limit(1);
      if (!conv) return;
      const channel = capitalize(conv.channelType);
      const intent = conv.currentIntent ?? 'guest inquiry';
      broadcastActivity({
        id: `conv-esc-${conv.id}`,
        type: 'escalated',
        text: 'Conversation escalated to staff',
        detail: `${channel} · ${intent}`,
        channel: conv.channelType,
        ts: Date.now(),
        data: { ...(conv.currentIntent ? { intent: conv.currentIntent } : {}) },
      });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast escalation activity');
    }
  });

  events.on<ConversationUpdatedEvent>(EventTypes.CONVERSATION_UPDATED, async (event) => {
    if (event.changes.state !== 'resolved') return;
    try {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, event.conversationId)).limit(1);
      if (!conv) return;
      const channel = capitalize(conv.channelType);
      const intent = conv.currentIntent ?? 'guest inquiry';
      broadcastActivity({
        id: `conv-res-${conv.id}`,
        type: 'ai_resolved',
        text: `AI resolved ${intent}`,
        detail: channel,
        channel: conv.channelType,
        ts: Date.now(),
        data: { ...(conv.currentIntent ? { intent: conv.currentIntent } : {}) },
      });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast resolution activity');
    }
  });

  events.on<ReservationCheckedInEvent>(EventTypes.RESERVATION_CHECKED_IN, async (event) => {
    try {
      const [guest] = await db.select().from(guests).where(eq(guests.id, event.guestId)).limit(1);
      if (!guest) return;
      const [res] = await db.select().from(reservations).where(eq(reservations.id, event.reservationId)).limit(1);
      const roomLabel = event.roomNumber ? `Room ${event.roomNumber}` : null;
      const typeLabel = res?.roomType && res.roomType.toLowerCase() !== 'unknown' ? res.roomType : null;
      const detail = [roomLabel, typeLabel].filter(Boolean).join(' · ') || 'Guest stay';
      broadcastActivity({
        id: `res-in-${event.reservationId}`,
        type: 'checkin',
        text: `${guest.firstName} ${guest.lastName} checked in`,
        detail,
        ts: Date.now(),
        data: { guestName: `${guest.firstName} ${guest.lastName}`, ...(event.roomNumber ? { roomNumber: event.roomNumber } : {}), ...((res?.roomType && res.roomType.toLowerCase() !== 'unknown' && res.roomType.trim() !== '') ? { roomType: res.roomType } : {}) },
      });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast check-in activity');
    }
  });

  events.on<MessageSentEvent>(EventTypes.MESSAGE_SENT, (event) => {
    if (event.senderType !== 'ai') return;
    const channel = capitalize(event.channel);
    const snippet = event.content.length > 60 ? event.content.slice(0, 60) + '…' : event.content;
    broadcastActivity({
      id: `msg-${event.messageId}`,
      type: 'ai_reply',
      text: 'AI replied to guest',
      detail: `${channel} · "${snippet}"`,
      channel: event.channel,
      ts: Date.now(),
      data: { snippet },
    });
  });

  events.on<ReservationCheckedOutEvent>(EventTypes.RESERVATION_CHECKED_OUT, async (event) => {
    try {
      const [guest] = await db.select().from(guests).where(eq(guests.id, event.guestId)).limit(1);
      if (!guest) return;
      broadcastActivity({
        id: `res-out-${event.reservationId}`,
        type: 'checkout',
        text: `${guest.firstName} ${guest.lastName} checked out`,
        detail: event.roomNumber ? `Room ${event.roomNumber}` : 'Guest stay',
        ts: Date.now(),
        data: { guestName: `${guest.firstName} ${guest.lastName}`, ...(event.roomNumber ? { roomNumber: event.roomNumber } : {}) },
      });
    } catch (error) {
      log.error({ error }, 'Failed to broadcast check-out activity');
    }
  });

  log.info('WebSocket event bridge ready');
}
