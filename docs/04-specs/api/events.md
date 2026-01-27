# Event Bus Specification

This document defines all internal events used by Jack The Butler's in-memory event bus.

---

## Overview

The event bus provides pub/sub communication between components using Node.js EventEmitter. Events are used for:

- Real-time updates to dashboards
- Loosely coupled component communication
- Async notifications without blocking
- Audit logging triggers

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│  Event Bus  │────▶│  Dashboard  │
└─────────────┘     │             │     └─────────────┘
                    │             │
┌─────────────┐     │             │     ┌─────────────┐
│  AI Engine  │────▶│             │────▶│   Logger    │
└─────────────┘     │             │     └─────────────┘
                    │             │
┌─────────────┐     │             │     ┌─────────────┐
│   Channels  │────▶│             │────▶│  Scheduler  │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Event Bus Implementation

### TypedEventEmitter

```typescript
import { EventEmitter } from 'events';

// Type-safe event emitter
export class TypedEventEmitter<T extends Record<string, any>> {
  private emitter = new EventEmitter();

  constructor() {
    // Configure max listeners (default 10 is too low)
    this.emitter.setMaxListeners(50);

    // Warn on potential memory leaks
    this.emitter.on('newListener', (event) => {
      const count = this.emitter.listenerCount(event);
      if (count >= 40) {
        console.warn(`Event "${String(event)}" has ${count} listeners. Potential memory leak.`);
      }
    });
  }

  emit<K extends keyof T>(event: K, payload: T[K]): boolean {
    return this.emitter.emit(event as string, payload);
  }

  on<K extends keyof T>(event: K, listener: (payload: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  once<K extends keyof T>(event: K, listener: (payload: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (payload: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.emitter.listenerCount(event as string);
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    this.emitter.removeAllListeners(event as string);
    return this;
  }
}

// Create singleton event bus
export const eventBus = new TypedEventEmitter<EventMap>();
```

---

## Event Type Enum

```typescript
/**
 * All event types in the system.
 * Format: domain:action or domain:entity:action
 */
export enum EventType {
  // Message Events
  MESSAGE_RECEIVED = 'message:received',
  MESSAGE_SENT = 'message:sent',
  MESSAGE_DELIVERED = 'message:delivered',
  MESSAGE_READ = 'message:read',
  MESSAGE_FAILED = 'message:failed',

  // Conversation Events
  CONVERSATION_CREATED = 'conversation:created',
  CONVERSATION_UPDATED = 'conversation:updated',
  CONVERSATION_ESCALATED = 'conversation:escalated',
  CONVERSATION_RESOLVED = 'conversation:resolved',
  CONVERSATION_ASSIGNED = 'conversation:assigned',

  // Guest Events
  GUEST_CREATED = 'guest:created',
  GUEST_UPDATED = 'guest:updated',
  GUEST_IDENTIFIED = 'guest:identified',
  GUEST_MERGED = 'guest:merged',

  // Task Events
  TASK_CREATED = 'task:created',
  TASK_ASSIGNED = 'task:assigned',
  TASK_UPDATED = 'task:updated',
  TASK_COMPLETED = 'task:completed',
  TASK_ESCALATED = 'task:escalated',
  TASK_OVERDUE = 'task:overdue',

  // Staff Events
  STAFF_ONLINE = 'staff:online',
  STAFF_OFFLINE = 'staff:offline',
  STAFF_STATUS_CHANGED = 'staff:status:changed',

  // AI Events
  AI_RESPONSE_GENERATED = 'ai:response:generated',
  AI_INTENT_CLASSIFIED = 'ai:intent:classified',
  AI_SKILL_EXECUTED = 'ai:skill:executed',
  AI_ESCALATION_TRIGGERED = 'ai:escalation:triggered',
  AI_ERROR = 'ai:error',

  // Channel Events
  CHANNEL_CONNECTED = 'channel:connected',
  CHANNEL_DISCONNECTED = 'channel:disconnected',
  CHANNEL_ERROR = 'channel:error',
  CHANNEL_RATE_LIMITED = 'channel:rate:limited',

  // Integration Events
  PMS_SYNC_COMPLETED = 'pms:sync:completed',
  PMS_SYNC_FAILED = 'pms:sync:failed',
  PMS_RESERVATION_UPDATED = 'pms:reservation:updated',
  INTEGRATION_ERROR = 'integration:error',

  // Knowledge Base Events
  KNOWLEDGE_UPDATED = 'knowledge:updated',
  KNOWLEDGE_EMBEDDING_COMPLETED = 'knowledge:embedding:completed',

  // Notification Events
  NOTIFICATION_SCHEDULED = 'notification:scheduled',
  NOTIFICATION_SENT = 'notification:sent',
  NOTIFICATION_FAILED = 'notification:failed',

  // System Events
  SYSTEM_STARTUP = 'system:startup',
  SYSTEM_SHUTDOWN = 'system:shutdown',
  SYSTEM_HEALTH_CHECK = 'system:health:check',
  SYSTEM_ERROR = 'system:error',

  // Audit Events
  AUDIT_LOG = 'audit:log',

  // Job Events
  JOB_SCHEDULED = 'job:scheduled',
  JOB_STARTED = 'job:started',
  JOB_COMPLETED = 'job:completed',
  JOB_FAILED = 'job:failed',

  // WebSocket Events (internal)
  WS_CLIENT_CONNECTED = 'ws:client:connected',
  WS_CLIENT_DISCONNECTED = 'ws:client:disconnected',
  WS_CLIENT_AUTHENTICATED = 'ws:client:authenticated',
}
```

---

## Event Payloads

### Base Event Payload

All events include common metadata:

```typescript
interface BaseEventPayload {
  eventId: string;           // Unique event ID (evt_xxx)
  timestamp: Date;           // When event occurred
  source: string;            // Component that emitted (gateway, ai-engine, etc.)
  correlationId?: string;    // For tracing related events
}

// Helper to create event payloads
function createEventPayload<T>(source: string, data: T, correlationId?: string): T & BaseEventPayload {
  return {
    eventId: generateId('evt'),
    timestamp: new Date(),
    source,
    correlationId,
    ...data,
  };
}
```

### Message Event Payloads

```typescript
interface MessageReceivedPayload extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  guestId: string;
  channel: ChannelType;
  content: string;
  contentType: 'text' | 'image' | 'audio' | 'document';
  metadata?: Record<string, any>;
}

interface MessageSentPayload extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  guestId: string;
  channel: ChannelType;
  content: string;
  contentType: 'text' | 'image' | 'template';
  sentBy: 'ai' | 'staff';
  staffId?: string;
}

interface MessageDeliveredPayload extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  channel: ChannelType;
  deliveredAt: Date;
  providerMessageId?: string;
}

interface MessageReadPayload extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  channel: ChannelType;
  readAt: Date;
}

interface MessageFailedPayload extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  channel: ChannelType;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  attemptCount: number;
}
```

### Conversation Event Payloads

```typescript
interface ConversationCreatedPayload extends BaseEventPayload {
  conversationId: string;
  guestId: string;
  channel: ChannelType;
  initialMessage?: string;
}

interface ConversationUpdatedPayload extends BaseEventPayload {
  conversationId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

interface ConversationEscalatedPayload extends BaseEventPayload {
  conversationId: string;
  guestId: string;
  reason: EscalationReason;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context: {
    lastMessages: string[];
    sentiment: string;
    intent: string;
  };
}

type EscalationReason =
  | 'low_confidence'
  | 'negative_sentiment'
  | 'explicit_request'
  | 'complex_request'
  | 'complaint'
  | 'vip_guest'
  | 'repeated_failure';

interface ConversationResolvedPayload extends BaseEventPayload {
  conversationId: string;
  guestId: string;
  resolvedBy: 'ai' | 'staff';
  staffId?: string;
  resolutionType: 'completed' | 'transferred' | 'timeout' | 'guest_ended';
  duration: number;          // Conversation duration in seconds
  messageCount: number;
}

interface ConversationAssignedPayload extends BaseEventPayload {
  conversationId: string;
  staffId: string;
  previousStaffId?: string;
  reason: 'escalation' | 'transfer' | 'manual' | 'auto_assign';
}
```

### Guest Event Payloads

```typescript
interface GuestCreatedPayload extends BaseEventPayload {
  guestId: string;
  channel: ChannelType;
  identifier: string;        // Phone, email, etc.
  name?: string;
}

interface GuestUpdatedPayload extends BaseEventPayload {
  guestId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  updatedBy: 'system' | 'staff' | 'pms_sync';
}

interface GuestIdentifiedPayload extends BaseEventPayload {
  guestId: string;
  reservationId: string;
  guestName: string;
  roomNumber?: string;
  loyaltyTier?: string;
  previouslyUnknown: boolean;
}

interface GuestMergedPayload extends BaseEventPayload {
  primaryGuestId: string;
  mergedGuestIds: string[];
  mergedBy: string;          // Staff ID
  reason: string;
}
```

### Task Event Payloads

```typescript
interface TaskCreatedPayload extends BaseEventPayload {
  taskId: string;
  conversationId?: string;
  guestId?: string;
  type: TaskType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  dueAt?: Date;
  createdBy: 'ai' | 'staff' | 'system';
}

type TaskType =
  | 'service_request'
  | 'housekeeping'
  | 'maintenance'
  | 'concierge'
  | 'complaint'
  | 'follow_up'
  | 'escalation';

interface TaskAssignedPayload extends BaseEventPayload {
  taskId: string;
  staffId: string;
  previousStaffId?: string;
  assignedBy: 'system' | 'staff';
  reason?: string;
}

interface TaskUpdatedPayload extends BaseEventPayload {
  taskId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  updatedBy: string;
}

interface TaskCompletedPayload extends BaseEventPayload {
  taskId: string;
  completedBy: string;       // Staff ID
  resolution: string;
  duration: number;          // Time from creation to completion (seconds)
  guestNotified: boolean;
}

interface TaskEscalatedPayload extends BaseEventPayload {
  taskId: string;
  fromStaffId: string;
  toStaffId?: string;
  reason: string;
  newPriority: 'low' | 'medium' | 'high' | 'critical';
}

interface TaskOverduePayload extends BaseEventPayload {
  taskId: string;
  assignedTo?: string;
  dueAt: Date;
  overdueBy: number;         // Seconds overdue
}
```

### Staff Event Payloads

```typescript
interface StaffOnlinePayload extends BaseEventPayload {
  staffId: string;
  name: string;
  role: string;
  channels: ChannelType[];
}

interface StaffOfflinePayload extends BaseEventPayload {
  staffId: string;
  reason: 'logout' | 'timeout' | 'disconnected';
  activeConversations: string[];  // Conversation IDs to reassign
  activeTasks: string[];          // Task IDs to reassign
}

interface StaffStatusChangedPayload extends BaseEventPayload {
  staffId: string;
  oldStatus: StaffStatus;
  newStatus: StaffStatus;
}

type StaffStatus = 'available' | 'busy' | 'away' | 'offline';
```

### AI Event Payloads

```typescript
interface AIResponseGeneratedPayload extends BaseEventPayload {
  conversationId: string;
  messageId: string;
  intent: string;
  confidence: number;
  responseType: 'answer' | 'clarification' | 'action' | 'escalation';
  tokensUsed: {
    input: number;
    output: number;
  };
  latencyMs: number;
}

interface AIIntentClassifiedPayload extends BaseEventPayload {
  conversationId: string;
  messageId: string;
  intent: string;
  confidence: number;
  entities: Array<{
    type: string;
    value: any;
    confidence: number;
  }>;
  sentiment: {
    polarity: 'positive' | 'neutral' | 'negative';
    score: number;
  };
}

interface AISkillExecutedPayload extends BaseEventPayload {
  conversationId: string;
  skillId: string;
  parameters: Record<string, any>;
  result: {
    success: boolean;
    partial?: boolean;
    data?: any;
    error?: string;
  };
  executionTimeMs: number;
}

interface AIEscalationTriggeredPayload extends BaseEventPayload {
  conversationId: string;
  reason: EscalationReason;
  confidence: number;
  suggestedPriority: 'low' | 'medium' | 'high' | 'critical';
}

interface AIErrorPayload extends BaseEventPayload {
  conversationId?: string;
  errorType: 'provider_error' | 'timeout' | 'rate_limit' | 'invalid_response';
  provider: string;
  error: {
    code: string;
    message: string;
  };
  retryAttempt?: number;
}
```

### Channel Event Payloads

```typescript
interface ChannelConnectedPayload extends BaseEventPayload {
  channel: ChannelType;
  provider: string;
  status: 'connected' | 'reconnected';
}

interface ChannelDisconnectedPayload extends BaseEventPayload {
  channel: ChannelType;
  provider: string;
  reason: string;
  willRetry: boolean;
}

interface ChannelErrorPayload extends BaseEventPayload {
  channel: ChannelType;
  provider: string;
  error: {
    code: string;
    message: string;
    httpStatus?: number;
  };
  affectedMessages?: string[];
}

interface ChannelRateLimitedPayload extends BaseEventPayload {
  channel: ChannelType;
  provider: string;
  limit: number;
  remaining: number;
  resetAt: Date;
  queuedMessages: number;
}

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';
```

### Integration Event Payloads

```typescript
interface PMSSyncCompletedPayload extends BaseEventPayload {
  syncType: 'full' | 'incremental';
  reservationsUpdated: number;
  guestsUpdated: number;
  duration: number;          // Sync duration in ms
}

interface PMSSyncFailedPayload extends BaseEventPayload {
  syncType: 'full' | 'incremental';
  error: {
    code: string;
    message: string;
  };
  willRetry: boolean;
  nextRetryAt?: Date;
}

interface PMSReservationUpdatedPayload extends BaseEventPayload {
  reservationId: string;
  externalId: string;
  guestId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

interface IntegrationErrorPayload extends BaseEventPayload {
  integration: string;       // pms, pos, housekeeping, etc.
  operation: string;
  error: {
    code: string;
    message: string;
  };
  context?: Record<string, any>;
}
```

### Knowledge Base Event Payloads

```typescript
interface KnowledgeUpdatedPayload extends BaseEventPayload {
  path: string;
  action: 'create' | 'update' | 'delete';
  updatedBy: string;
  version: number;
}

interface KnowledgeEmbeddingCompletedPayload extends BaseEventPayload {
  path: string;
  chunksProcessed: number;
  duration: number;
}
```

### Notification Event Payloads

```typescript
interface NotificationScheduledPayload extends BaseEventPayload {
  notificationId: string;
  type: NotificationType;
  guestId: string;
  channel: ChannelType;
  scheduledFor: Date;
}

type NotificationType =
  | 'pre_arrival'
  | 'welcome'
  | 'checkout_reminder'
  | 'feedback_request'
  | 'custom';

interface NotificationSentPayload extends BaseEventPayload {
  notificationId: string;
  type: NotificationType;
  guestId: string;
  channel: ChannelType;
  messageId: string;
}

interface NotificationFailedPayload extends BaseEventPayload {
  notificationId: string;
  type: NotificationType;
  guestId: string;
  channel: ChannelType;
  error: {
    code: string;
    message: string;
  };
}
```

### System Event Payloads

```typescript
interface SystemStartupPayload extends BaseEventPayload {
  version: string;
  environment: 'development' | 'staging' | 'production';
  config: {
    channels: ChannelType[];
    aiProvider: string;
    features: string[];
  };
}

interface SystemShutdownPayload extends BaseEventPayload {
  reason: 'manual' | 'signal' | 'error';
  graceful: boolean;
}

interface SystemHealthCheckPayload extends BaseEventPayload {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: Record<string, {
    status: 'up' | 'down' | 'degraded';
    latency?: number;
    error?: string;
  }>;
}

interface SystemErrorPayload extends BaseEventPayload {
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context?: Record<string, any>;
  severity: 'warning' | 'error' | 'critical';
}
```

### Audit Event Payload

```typescript
interface AuditLogPayload extends BaseEventPayload {
  action: string;            // e.g., 'guest.view', 'task.create', 'settings.update'
  actorId: string;           // Staff ID or 'system'
  actorType: 'staff' | 'system' | 'guest';
  resourceType: string;      // e.g., 'guest', 'task', 'conversation'
  resourceId: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}
```

### Job Event Payloads

```typescript
interface JobScheduledPayload extends BaseEventPayload {
  jobId: string;
  jobType: string;
  scheduledFor: Date;
  data?: Record<string, any>;
}

interface JobStartedPayload extends BaseEventPayload {
  jobId: string;
  jobType: string;
  attempt: number;
}

interface JobCompletedPayload extends BaseEventPayload {
  jobId: string;
  jobType: string;
  duration: number;
  result?: any;
}

interface JobFailedPayload extends BaseEventPayload {
  jobId: string;
  jobType: string;
  attempt: number;
  maxAttempts: number;
  error: {
    code: string;
    message: string;
  };
  willRetry: boolean;
  nextRetryAt?: Date;
}
```

### WebSocket Event Payloads

```typescript
interface WSClientConnectedPayload extends BaseEventPayload {
  connectionId: string;
  clientType: 'dashboard' | 'widget';
  ip?: string;
}

interface WSClientDisconnectedPayload extends BaseEventPayload {
  connectionId: string;
  staffId?: string;
  reason: 'close' | 'timeout' | 'error';
}

interface WSClientAuthenticatedPayload extends BaseEventPayload {
  connectionId: string;
  staffId: string;
  role: string;
  permissions: string[];
}
```

---

## Complete Event Map

```typescript
/**
 * Type-safe mapping of event types to their payloads.
 */
export interface EventMap {
  // Message Events
  [EventType.MESSAGE_RECEIVED]: MessageReceivedPayload;
  [EventType.MESSAGE_SENT]: MessageSentPayload;
  [EventType.MESSAGE_DELIVERED]: MessageDeliveredPayload;
  [EventType.MESSAGE_READ]: MessageReadPayload;
  [EventType.MESSAGE_FAILED]: MessageFailedPayload;

  // Conversation Events
  [EventType.CONVERSATION_CREATED]: ConversationCreatedPayload;
  [EventType.CONVERSATION_UPDATED]: ConversationUpdatedPayload;
  [EventType.CONVERSATION_ESCALATED]: ConversationEscalatedPayload;
  [EventType.CONVERSATION_RESOLVED]: ConversationResolvedPayload;
  [EventType.CONVERSATION_ASSIGNED]: ConversationAssignedPayload;

  // Guest Events
  [EventType.GUEST_CREATED]: GuestCreatedPayload;
  [EventType.GUEST_UPDATED]: GuestUpdatedPayload;
  [EventType.GUEST_IDENTIFIED]: GuestIdentifiedPayload;
  [EventType.GUEST_MERGED]: GuestMergedPayload;

  // Task Events
  [EventType.TASK_CREATED]: TaskCreatedPayload;
  [EventType.TASK_ASSIGNED]: TaskAssignedPayload;
  [EventType.TASK_UPDATED]: TaskUpdatedPayload;
  [EventType.TASK_COMPLETED]: TaskCompletedPayload;
  [EventType.TASK_ESCALATED]: TaskEscalatedPayload;
  [EventType.TASK_OVERDUE]: TaskOverduePayload;

  // Staff Events
  [EventType.STAFF_ONLINE]: StaffOnlinePayload;
  [EventType.STAFF_OFFLINE]: StaffOfflinePayload;
  [EventType.STAFF_STATUS_CHANGED]: StaffStatusChangedPayload;

  // AI Events
  [EventType.AI_RESPONSE_GENERATED]: AIResponseGeneratedPayload;
  [EventType.AI_INTENT_CLASSIFIED]: AIIntentClassifiedPayload;
  [EventType.AI_SKILL_EXECUTED]: AISkillExecutedPayload;
  [EventType.AI_ESCALATION_TRIGGERED]: AIEscalationTriggeredPayload;
  [EventType.AI_ERROR]: AIErrorPayload;

  // Channel Events
  [EventType.CHANNEL_CONNECTED]: ChannelConnectedPayload;
  [EventType.CHANNEL_DISCONNECTED]: ChannelDisconnectedPayload;
  [EventType.CHANNEL_ERROR]: ChannelErrorPayload;
  [EventType.CHANNEL_RATE_LIMITED]: ChannelRateLimitedPayload;

  // Integration Events
  [EventType.PMS_SYNC_COMPLETED]: PMSSyncCompletedPayload;
  [EventType.PMS_SYNC_FAILED]: PMSSyncFailedPayload;
  [EventType.PMS_RESERVATION_UPDATED]: PMSReservationUpdatedPayload;
  [EventType.INTEGRATION_ERROR]: IntegrationErrorPayload;

  // Knowledge Base Events
  [EventType.KNOWLEDGE_UPDATED]: KnowledgeUpdatedPayload;
  [EventType.KNOWLEDGE_EMBEDDING_COMPLETED]: KnowledgeEmbeddingCompletedPayload;

  // Notification Events
  [EventType.NOTIFICATION_SCHEDULED]: NotificationScheduledPayload;
  [EventType.NOTIFICATION_SENT]: NotificationSentPayload;
  [EventType.NOTIFICATION_FAILED]: NotificationFailedPayload;

  // System Events
  [EventType.SYSTEM_STARTUP]: SystemStartupPayload;
  [EventType.SYSTEM_SHUTDOWN]: SystemShutdownPayload;
  [EventType.SYSTEM_HEALTH_CHECK]: SystemHealthCheckPayload;
  [EventType.SYSTEM_ERROR]: SystemErrorPayload;

  // Audit Events
  [EventType.AUDIT_LOG]: AuditLogPayload;

  // Job Events
  [EventType.JOB_SCHEDULED]: JobScheduledPayload;
  [EventType.JOB_STARTED]: JobStartedPayload;
  [EventType.JOB_COMPLETED]: JobCompletedPayload;
  [EventType.JOB_FAILED]: JobFailedPayload;

  // WebSocket Events
  [EventType.WS_CLIENT_CONNECTED]: WSClientConnectedPayload;
  [EventType.WS_CLIENT_DISCONNECTED]: WSClientDisconnectedPayload;
  [EventType.WS_CLIENT_AUTHENTICATED]: WSClientAuthenticatedPayload;
}
```

---

## Event Ordering Guarantees

### Within a Single Event Type

Events of the same type are delivered **in order** to each listener:

```typescript
// Listeners receive events in emission order
eventBus.on(EventType.MESSAGE_RECEIVED, (msg1) => { /* first */ });
eventBus.emit(EventType.MESSAGE_RECEIVED, msg1);
eventBus.emit(EventType.MESSAGE_RECEIVED, msg2);
// Listener receives msg1, then msg2
```

### Across Different Event Types

Events of different types have **no ordering guarantee**:

```typescript
// These may be processed in any order
eventBus.emit(EventType.MESSAGE_RECEIVED, msg);
eventBus.emit(EventType.CONVERSATION_UPDATED, conv);
// No guarantee which listener runs first
```

### Synchronous Execution

All listeners are executed **synchronously** in registration order:

```typescript
eventBus.on(EventType.TASK_CREATED, (task) => {
  console.log('First listener');  // Runs first
});

eventBus.on(EventType.TASK_CREATED, (task) => {
  console.log('Second listener'); // Runs second
});
```

### Async Listeners

For async listeners, the event bus does not await completion:

```typescript
// Event bus does NOT wait for async operations
eventBus.on(EventType.TASK_CREATED, async (task) => {
  await saveToDatabase(task);  // Runs in background
});

eventBus.emit(EventType.TASK_CREATED, task);
// Continues immediately, doesn't wait for saveToDatabase
```

### Ensuring Order for Critical Flows

For flows requiring strict order, use explicit chaining:

```typescript
// Option 1: Single listener that handles sequence
eventBus.on(EventType.CONVERSATION_ESCALATED, async (payload) => {
  await createTask(payload);          // Step 1
  await notifyStaff(payload);         // Step 2
  await updateConversation(payload);  // Step 3
});

// Option 2: Emit next event after completion
eventBus.on(EventType.TASK_CREATED, async (task) => {
  const assigned = await assignTask(task);
  eventBus.emit(EventType.TASK_ASSIGNED, assigned);
});
```

---

## Error Handling

### Listener Error Isolation

Errors in one listener do not affect other listeners:

```typescript
class SafeEventEmitter<T extends Record<string, any>> extends TypedEventEmitter<T> {
  emit<K extends keyof T>(event: K, payload: T[K]): boolean {
    const listeners = this.listeners(event);

    for (const listener of listeners) {
      try {
        const result = listener(payload);

        // Handle async listeners
        if (result instanceof Promise) {
          result.catch((error) => {
            this.handleListenerError(event, error, payload);
          });
        }
      } catch (error) {
        this.handleListenerError(event, error, payload);
      }
    }

    return listeners.length > 0;
  }

  private handleListenerError<K extends keyof T>(
    event: K,
    error: Error,
    payload: T[K]
  ): void {
    // Log error with context
    console.error(`Event listener error for "${String(event)}":`, {
      error: error.message,
      stack: error.stack,
      payload: JSON.stringify(payload).slice(0, 500),
    });

    // Emit system error event (but don't recurse)
    if (event !== EventType.SYSTEM_ERROR) {
      this.emit(EventType.SYSTEM_ERROR, {
        eventId: generateId('evt'),
        timestamp: new Date(),
        source: 'event-bus',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context: {
          event: String(event),
        },
        severity: 'error',
      });
    }
  }
}
```

### Dead Letter Queue for Failed Events

Critical events that fail processing can be stored for retry:

```typescript
interface DeadLetterEntry {
  id: string;
  event: string;
  payload: any;
  error: string;
  failedAt: Date;
  retryCount: number;
  lastRetryAt?: Date;
}

async function handleCriticalEventError(
  event: string,
  payload: any,
  error: Error
): Promise<void> {
  // Store in dead letter queue
  await db.prepare(`
    INSERT INTO event_dead_letter (id, event, payload, error, failed_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(
    generateId('dlq'),
    event,
    JSON.stringify(payload),
    error.message
  );
}

// Critical events that should never be lost
const CRITICAL_EVENTS = [
  EventType.MESSAGE_RECEIVED,
  EventType.TASK_CREATED,
  EventType.CONVERSATION_ESCALATED,
];
```

---

## Configuration

### Max Listeners

```typescript
const EVENT_BUS_CONFIG = {
  maxListeners: 50,              // Per event type
  warnThreshold: 40,             // Warn when approaching limit

  // Events that commonly have many listeners
  highListenerEvents: [
    EventType.MESSAGE_RECEIVED,
    EventType.CONVERSATION_UPDATED,
    EventType.TASK_CREATED,
  ],
  highListenerMax: 100,          // Higher limit for these events
};
```

### Event-Specific Configuration

```typescript
const EVENT_CONFIG: Partial<Record<EventType, EventTypeConfig>> = {
  [EventType.MESSAGE_RECEIVED]: {
    critical: true,              // Use dead letter queue on failure
    logPayload: false,           // Don't log payload (may contain PII)
  },
  [EventType.AUDIT_LOG]: {
    critical: true,
    persist: true,               // Always persist to database
  },
  [EventType.SYSTEM_HEALTH_CHECK]: {
    critical: false,
    logLevel: 'debug',           // Reduce log noise
  },
};

interface EventTypeConfig {
  critical: boolean;
  persist?: boolean;
  logPayload?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

---

## Usage Examples

### Emitting Events

```typescript
import { eventBus, EventType, createEventPayload } from '@/events';

// In Gateway when message received
eventBus.emit(
  EventType.MESSAGE_RECEIVED,
  createEventPayload('gateway', {
    messageId: 'msg_123',
    conversationId: 'conv_456',
    guestId: 'guest_789',
    channel: 'whatsapp',
    content: 'What time is checkout?',
    contentType: 'text',
  }, requestId)
);

// In AI Engine after classification
eventBus.emit(
  EventType.AI_INTENT_CLASSIFIED,
  createEventPayload('ai-engine', {
    conversationId: 'conv_456',
    messageId: 'msg_123',
    intent: 'inquiry.policy',
    confidence: 0.92,
    entities: [],
    sentiment: {
      polarity: 'neutral',
      score: 0.1,
    },
  }, requestId)
);
```

### Subscribing to Events

```typescript
import { eventBus, EventType } from '@/events';

// Dashboard real-time updates
eventBus.on(EventType.CONVERSATION_CREATED, (payload) => {
  broadcastToStaff('conversation:new', payload);
});

eventBus.on(EventType.TASK_CREATED, (payload) => {
  broadcastToStaff('task:new', payload);
});

// Audit logging
eventBus.on(EventType.GUEST_UPDATED, (payload) => {
  logAudit('guest.update', payload);
});

// Analytics
eventBus.on(EventType.AI_RESPONSE_GENERATED, (payload) => {
  recordMetric('ai.response.latency', payload.latencyMs);
  recordMetric('ai.tokens.used', payload.tokensUsed.input + payload.tokensUsed.output);
});
```

### One-Time Listeners

```typescript
// Wait for system startup before proceeding
eventBus.once(EventType.SYSTEM_STARTUP, (payload) => {
  console.log(`System started: v${payload.version}`);
  startAcceptingConnections();
});
```

---

## Related

- [ADR-003: Message Queue](../../03-architecture/decisions/003-message-queue.md) - In-memory vs Redis decision
- [Gateway API](gateway-api.md) - WebSocket events to clients
- [Job Scheduler](../../03-architecture/decisions/005-job-scheduler.md) - Job events
