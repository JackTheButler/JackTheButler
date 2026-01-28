/**
 * Event Types
 *
 * Type definitions for system events.
 */

import type { ChannelType, ContentType } from './channel.js';
import type { ConversationState } from './conversation.js';
import type { SenderType } from './message.js';

/**
 * Event type constants
 */
export const EventTypes = {
  // Message events
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',
  MESSAGE_FAILED: 'message.failed',

  // Conversation events
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_ESCALATED: 'conversation.escalated',
  CONVERSATION_RESOLVED: 'conversation.resolved',

  // Task events
  TASK_CREATED: 'task.created',
  TASK_ASSIGNED: 'task.assigned',
  TASK_COMPLETED: 'task.completed',

  // Guest events
  GUEST_CREATED: 'guest.created',
  GUEST_UPDATED: 'guest.updated',
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
 * Task created event
 */
export interface TaskCreatedEvent extends BaseEvent {
  type: typeof EventTypes.TASK_CREATED;
  taskId: string;
  conversationId?: string;
  type_: string;
  department: string;
  priority: string;
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
  | TaskCreatedEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;
