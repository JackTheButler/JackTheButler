/**
 * Event Types
 *
 * Type definitions for system events.
 */

import type { ChannelType, ContentType } from '@jackthebutler/shared';
import type { ConversationState } from './conversation.js';
import type { SenderType } from './message.js';

/**
 * Event type constants
 */
export const EventTypes = {
  // Message events
  MESSAGE_RECEIVED: 'message.saved',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',

  // Conversation events
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_ESCALATED: 'conversation.escalated',
  CONVERSATION_RESOLVED: 'conversation.resolved',
  CONVERSATION_CLOSED: 'conversation.closed',

  // Guest events
  GUEST_CREATED: 'guest.created',
  GUEST_UPDATED: 'guest.updated',

  // Model events
  MODEL_DOWNLOAD_PROGRESS: 'model.download.progress',

  // Reservation events
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_UPDATED: 'reservation.updated',
  RESERVATION_CHECKED_IN: 'reservation.checked_in',
  RESERVATION_CHECKED_OUT: 'reservation.checked_out',
  RESERVATION_CANCELLED: 'reservation.cancelled',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

/**
 * Base event interface
 */
export interface BaseEvent {
  type: EventType;
  timestamp: Date;
}

/**
 * Message received event
 */
export interface MessageReceivedEvent extends BaseEvent {
  type: typeof EventTypes.MESSAGE_RECEIVED;
  conversationId: string;
  messageId: string;
  channel: ChannelType;
  content: string;
  contentType: ContentType;
  detectedLanguage?: string;
}

/**
 * Message sent event
 */
export interface MessageSentEvent extends BaseEvent {
  type: typeof EventTypes.MESSAGE_SENT;
  conversationId: string;
  messageId: string;
  content: string;
  senderType: SenderType;
  channel: ChannelType;
}

/**
 * Conversation created event
 */
export interface ConversationCreatedEvent extends BaseEvent {
  type: typeof EventTypes.CONVERSATION_CREATED;
  conversationId: string;
  channel: ChannelType;
  channelId: string;
  guestId?: string;
}

/**
 * Conversation updated event
 */
export interface ConversationUpdatedEvent extends BaseEvent {
  type: typeof EventTypes.CONVERSATION_UPDATED;
  conversationId: string;
  changes: {
    state?: ConversationState;
    assignedTo?: string | null;
    currentIntent?: string;
  };
}

/**
 * Conversation escalated event
 */
export interface ConversationEscalatedEvent extends BaseEvent {
  type: typeof EventTypes.CONVERSATION_ESCALATED;
  conversationId: string;
  reasons: string[];
  priority: 'urgent' | 'high' | 'standard';
}

/**
 * Conversation closed event
 */
export interface ConversationClosedEvent extends BaseEvent {
  type: typeof EventTypes.CONVERSATION_CLOSED;
  conversationId: string;
  guestId: string | null;
  reason: 'timeout' | 'staff_resolved' | 'guest_satisfied';
}

/**
 * Model download progress event
 */
export interface ModelDownloadProgressEvent extends BaseEvent {
  type: typeof EventTypes.MODEL_DOWNLOAD_PROGRESS;
  payload: {
    model: string;
    status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
    file?: string;
    progress?: number; // 0-100
    loaded?: number;
    total?: number;
  };
}

/**
 * Reservation created event
 */
export interface ReservationCreatedEvent extends BaseEvent {
  type: typeof EventTypes.RESERVATION_CREATED;
  reservationId: string;
  guestId: string;
  roomNumber?: string;
  arrivalDate: string;
  departureDate: string;
}

/**
 * Reservation updated event
 */
export interface ReservationUpdatedEvent extends BaseEvent {
  type: typeof EventTypes.RESERVATION_UPDATED;
  reservationId: string;
  guestId: string;
  changes: {
    roomNumber?: string;
    arrivalDate?: string;
    departureDate?: string;
    status?: string;
  };
}

/**
 * Reservation checked in event
 */
export interface ReservationCheckedInEvent extends BaseEvent {
  type: typeof EventTypes.RESERVATION_CHECKED_IN;
  reservationId: string;
  guestId: string;
  roomNumber: string;
}

/**
 * Reservation checked out event
 */
export interface ReservationCheckedOutEvent extends BaseEvent {
  type: typeof EventTypes.RESERVATION_CHECKED_OUT;
  reservationId: string;
  guestId: string;
  roomNumber: string;
}

/**
 * Reservation cancelled event
 */
export interface ReservationCancelledEvent extends BaseEvent {
  type: typeof EventTypes.RESERVATION_CANCELLED;
  reservationId: string;
  guestId: string;
}

/**
 * Union of all event types
 */
export type AppEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | ConversationEscalatedEvent
  | ConversationClosedEvent
  | ModelDownloadProgressEvent
  | ReservationCreatedEvent
  | ReservationUpdatedEvent
  | ReservationCheckedInEvent
  | ReservationCheckedOutEvent
  | ReservationCancelledEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;
