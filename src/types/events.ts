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
  MESSAGE_RECEIVED: 'message.saved',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',
  MESSAGE_FAILED: 'message.failed',

  // Conversation events
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_ESCALATED: 'conversation.escalated',
  CONVERSATION_RESOLVED: 'conversation.resolved',
  CONVERSATION_CLOSED: 'conversation.closed',

  // Task events
  TASK_CREATED: 'task.created',
  TASK_ASSIGNED: 'task.assigned',
  TASK_COMPLETED: 'task.completed',

  // Guest events
  GUEST_CREATED: 'guest.created',
  GUEST_UPDATED: 'guest.updated',

  // Approval events
  APPROVAL_QUEUED: 'approval.queued',
  APPROVAL_DECIDED: 'approval.decided',
  APPROVAL_EXECUTED: 'approval.executed',

  // Model events
  MODEL_DOWNLOAD_PROGRESS: 'model.download.progress',

  // Reservation events
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_UPDATED: 'reservation.updated',
  RESERVATION_CHECKED_IN: 'reservation.checked_in',
  RESERVATION_CHECKED_OUT: 'reservation.checked_out',
  RESERVATION_CANCELLED: 'reservation.cancelled',

  // Staff notification events
  STAFF_NOTIFICATION: 'staff.notification',

  // WebChat lifecycle events
  WEBCHAT_CONNECTED: 'webchat.connected',
  WEBCHAT_DISCONNECTED: 'webchat.disconnected',
  WEBCHAT_ERROR: 'webchat.error',
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
 * Message failed event
 */
export interface MessageFailedEvent extends BaseEvent {
  type: typeof EventTypes.MESSAGE_FAILED;
  conversationId: string;
  messageId: string;
  channel: ChannelType;
  error: string;
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
 * Task assigned event
 */
export interface TaskAssignedEvent extends BaseEvent {
  type: typeof EventTypes.TASK_ASSIGNED;
  taskId: string;
  assignedTo: string;
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent extends BaseEvent {
  type: typeof EventTypes.TASK_COMPLETED;
  taskId: string;
}

/**
 * Approval queued event
 */
export interface ApprovalQueuedEvent extends BaseEvent {
  type: typeof EventTypes.APPROVAL_QUEUED;
  payload: {
    id: string;
    type: string;
    actionType: string;
    conversationId?: string | undefined;
    guestId?: string | undefined;
  };
}

/**
 * Approval decided event
 */
export interface ApprovalDecidedEvent extends BaseEvent {
  type: typeof EventTypes.APPROVAL_DECIDED;
  payload: {
    id: string;
    status: 'approved' | 'rejected';
    staffId: string;
    reason?: string | undefined;
  };
}

/**
 * Approval executed event
 */
export interface ApprovalExecutedEvent extends BaseEvent {
  type: typeof EventTypes.APPROVAL_EXECUTED;
  payload: {
    id: string;
    actionType: string;
    actionData: Record<string, unknown>;
  };
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
 * Staff notification event
 */
export interface StaffNotificationEvent extends BaseEvent {
  type: typeof EventTypes.STAFF_NOTIFICATION;
  payload: {
    role?: string;
    staffId?: string;
    message: string;
    priority: 'low' | 'standard' | 'high' | 'urgent';
    automationRuleId?: string;
  };
}

/**
 * WebChat guest connected event
 */
export interface WebchatConnectedEvent extends BaseEvent {
  type: typeof EventTypes.WEBCHAT_CONNECTED;
  sessionId: string;
  restored: boolean;
}

/**
 * WebChat guest disconnected event
 */
export interface WebchatDisconnectedEvent extends BaseEvent {
  type: typeof EventTypes.WEBCHAT_DISCONNECTED;
  sessionId: string;
}

/**
 * WebChat connection error event
 */
export interface WebchatErrorEvent extends BaseEvent {
  type: typeof EventTypes.WEBCHAT_ERROR;
  sessionId: string;
  error: string;
}

/**
 * Union of all event types
 */
export type AppEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageFailedEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | ConversationEscalatedEvent
  | ConversationClosedEvent
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskCompletedEvent
  | ApprovalQueuedEvent
  | ApprovalDecidedEvent
  | ApprovalExecutedEvent
  | ModelDownloadProgressEvent
  | ReservationCreatedEvent
  | ReservationUpdatedEvent
  | ReservationCheckedInEvent
  | ReservationCheckedOutEvent
  | ReservationCancelledEvent
  | StaffNotificationEvent
  | WebchatConnectedEvent
  | WebchatDisconnectedEvent
  | WebchatErrorEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;
