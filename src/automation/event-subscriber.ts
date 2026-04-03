/**
 * Automation Event Subscriber
 *
 * Bridges the event system to the automation engine.
 * Listens for system events and triggers automation rule evaluation.
 */

import { events } from '@/events/index.js';
import {
  EventTypes,
  type ReservationCreatedEvent,
  type ReservationUpdatedEvent,
  type ReservationCheckedInEvent,
  type ReservationCheckedOutEvent,
  type ReservationCancelledEvent,
  type ConversationEscalatedEvent,
  type ConversationCreatedEvent,
  type TaskCreatedEvent,
  type TaskCompletedEvent,
  type MessageReceivedEvent,
} from '@/types/events.js';
import { getAutomationEngine } from './index.js';
import { logger } from '@/utils/logger.js';

const log = logger.child({ component: 'automation:events' });

/**
 * Subscribe the automation engine to system events
 */
export function subscribeAutomationToEvents(): void {
  const engine = getAutomationEngine();

  // Reservation events
  events.on(EventTypes.RESERVATION_CREATED, (event: ReservationCreatedEvent) => {
    log.debug({ event: event.type, reservationId: event.reservationId }, 'Automation: reservation created');
    engine.evaluate({
      type: 'reservation.created',
      data: {
        reservationId: event.reservationId,
        guestId: event.guestId,
        roomNumber: event.roomNumber,
        arrivalDate: event.arrivalDate,
        departureDate: event.departureDate,
      },
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.RESERVATION_UPDATED, (event: ReservationUpdatedEvent) => {
    log.debug({ event: event.type, reservationId: event.reservationId }, 'Automation: reservation updated');
    engine.evaluate({
      type: 'reservation.updated',
      data: {
        reservationId: event.reservationId,
        guestId: event.guestId,
        changes: event.changes,
      },
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.RESERVATION_CHECKED_IN, (event: ReservationCheckedInEvent) => {
    log.debug({ event: event.type, reservationId: event.reservationId }, 'Automation: guest checked in');
    engine.evaluate({
      type: 'reservation.checked_in',
      data: {
        reservationId: event.reservationId,
        guestId: event.guestId,
        roomNumber: event.roomNumber,
      },
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.RESERVATION_CHECKED_OUT, (event: ReservationCheckedOutEvent) => {
    log.debug({ event: event.type, reservationId: event.reservationId }, 'Automation: guest checked out');
    engine.evaluate({
      type: 'reservation.checked_out',
      data: {
        reservationId: event.reservationId,
        guestId: event.guestId,
        roomNumber: event.roomNumber,
      },
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.RESERVATION_CANCELLED, (event: ReservationCancelledEvent) => {
    log.debug({ event: event.type, reservationId: event.reservationId }, 'Automation: reservation cancelled');
    engine.evaluate({
      type: 'reservation.cancelled',
      data: {
        reservationId: event.reservationId,
        guestId: event.guestId,
      },
      timestamp: event.timestamp,
    });
  });

  // Conversation events
  events.on(EventTypes.CONVERSATION_ESCALATED, (event: ConversationEscalatedEvent) => {
    log.debug({ event: event.type, conversationId: event.conversationId }, 'Automation: conversation escalated');
    engine.evaluate({
      type: 'conversation.escalated',
      data: {
        conversationId: event.conversationId,
        reasons: event.reasons,
        priority: event.priority,
      },
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.CONVERSATION_CREATED, (event: ConversationCreatedEvent) => {
    log.debug({ event: event.type, conversationId: event.conversationId }, 'Automation: conversation created');
    const data: Record<string, unknown> = {
      conversationId: event.conversationId,
      channel: event.channel,
      channelId: event.channelId,
    };
    if (event.guestId) {
      data.guestId = event.guestId;
    }
    engine.evaluate({
      type: 'conversation.escalated', // Use existing event type for now
      data,
      timestamp: event.timestamp,
    });
  });

  // Task events
  events.on(EventTypes.TASK_CREATED, (event: TaskCreatedEvent) => {
    log.debug({ event: event.type, taskId: event.taskId }, 'Automation: task created');
    const data: Record<string, unknown> = {
      taskId: event.taskId,
      type: event.type_,
      department: event.department,
      priority: event.priority,
    };
    if (event.conversationId) {
      data.conversationId = event.conversationId;
    }
    engine.evaluate({
      type: 'task.created',
      data,
      timestamp: event.timestamp,
    });
  });

  events.on(EventTypes.TASK_COMPLETED, (event: TaskCompletedEvent) => {
    log.debug({ event: event.type, taskId: event.taskId }, 'Automation: task completed');
    engine.evaluate({
      type: 'task.completed',
      data: {
        taskId: event.taskId,
      },
      timestamp: event.timestamp,
    });
  });

  // Message events
  events.on(EventTypes.MESSAGE_RECEIVED, (event: MessageReceivedEvent) => {
    log.debug({ event: event.type, messageId: event.messageId }, 'Automation: message received');
    engine.evaluate({
      type: 'reservation.created', // Use existing event type - would need to add message.received to EventType
      data: {
        conversationId: event.conversationId,
        messageId: event.messageId,
        channel: event.channel,
        content: event.content,
        contentType: event.contentType,
      },
      timestamp: event.timestamp,
    });
  });

  log.info('Automation event subscribers registered for all event types');
}
