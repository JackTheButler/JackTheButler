# Component: Gateway

The Gateway is the central coordination hub of Jack The Butler, managing all communication between channels, AI, integrations, and user interfaces.

---

## Purpose

The Gateway serves as the "Joint AI Control Kernel" (JACK) - orchestrating message flow, maintaining conversation state, and ensuring reliable communication across all system components.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 GATEWAY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        API LAYER                                     │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   REST API   │  │  WebSocket   │  │   Webhook    │               │   │
│  │  │   Handler    │  │   Server     │  │   Receiver   │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         │                 │                 │                        │   │
│  └─────────┼─────────────────┼─────────────────┼────────────────────────┘   │
│            │                 │                 │                             │
│            └─────────────────┼─────────────────┘                             │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MESSAGE ROUTER                                   │   │
│  │                                                                      │   │
│  │  • Route inbound messages to AI Engine                              │   │
│  │  • Route outbound messages to Channel Service                       │   │
│  │  • Handle escalations to staff                                      │   │
│  │  • Manage conversation state transitions                            │   │
│  │                                                                      │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         ▼                   ▼                   ▼                           │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐                      │
│  │ Session    │     │ Convo      │     │ Event      │                      │
│  │ Manager    │     │ Manager    │     │ Publisher  │                      │
│  │            │     │            │     │            │                      │
│  │ • Auth     │     │ • State    │     │ • Pub/Sub  │                      │
│  │ • Tokens   │     │ • History  │     │ • Broadcast│                      │
│  │ • Roles    │     │ • Context  │     │ • Notify   │                      │
│  └────────────┘     └────────────┘     └────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Responsibilities

### Message Routing
- Receive messages from Channel Service
- Route to AI Engine for processing
- Deliver responses back through channels
- Handle routing failures and retries

### Session Management
- Authenticate users (guests via channel, staff via JWT)
- Maintain WebSocket connections
- Manage session timeouts and reconnection

### Conversation Orchestration
- Track conversation state (active, escalated, resolved)
- Maintain conversation context across messages
- Handle human-AI handoffs

### Event Distribution
- Publish events to interested subscribers
- Broadcast real-time updates to dashboards
- Trigger automation workflows

---

## Interfaces

### REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/conversations` | GET | List conversations |
| `/api/v1/conversations/:id` | GET | Get conversation details |
| `/api/v1/conversations/:id/messages` | POST | Send message (staff) |
| `/api/v1/conversations/:id/escalate` | POST | Escalate to human |
| `/api/v1/conversations/:id/resolve` | POST | Mark resolved |
| `/api/v1/guests/:id` | GET | Get guest profile |
| `/api/v1/tasks` | GET/POST | Task management |
| `/api/v1/tasks/:id` | PATCH | Update task |

### WebSocket Events

**Client → Server:**
```typescript
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'send_message' | 'typing';
  payload: {
    conversationId?: string;
    content?: string;
    channel?: string;
  };
}
```

**Server → Client:**
```typescript
interface ServerMessage {
  type: 'message' | 'conversation_update' | 'task_update' | 'notification';
  payload: {
    conversationId?: string;
    message?: Message;
    conversation?: Conversation;
    task?: Task;
  };
}
```

### Internal Service API

```typescript
// Channel Service → Gateway
interface InboundMessage {
  channelId: string;
  channelType: 'whatsapp' | 'sms' | 'email' | 'webchat';
  senderId: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

// Gateway → AI Engine
interface AIRequest {
  conversationId: string;
  message: Message;
  context: ConversationContext;
  guestProfile: GuestProfile;
}

// AI Engine → Gateway
interface AIResponse {
  conversationId: string;
  response: string;
  intent: Intent;
  confidence: number;
  actions?: Action[];
  shouldEscalate: boolean;
}
```

---

## State Management

### Conversation States

```
┌─────────┐
│   NEW   │
└────┬────┘
     │ First message
     ▼
┌─────────┐     Confidence < threshold    ┌───────────┐
│  ACTIVE │ ─────────────────────────────►│ ESCALATED │
│  (AI)   │                               │  (Human)  │
└────┬────┘                               └─────┬─────┘
     │                                          │
     │ ◄────────────────────────────────────────┘
     │         Return to AI
     │
     │ Resolved / Timeout
     ▼
┌─────────┐
│ RESOLVED│
└─────────┘
```

### Conversation Context

```typescript
interface ConversationContext {
  conversationId: string;
  guestId: string;

  // Current state
  state: 'new' | 'active' | 'escalated' | 'resolved';
  assignedTo?: string; // Staff ID if escalated

  // History
  messages: Message[];
  messageCount: number;

  // AI context
  currentIntent?: Intent;
  pendingActions?: Action[];

  // Timing
  createdAt: Date;
  lastMessageAt: Date;
  resolvedAt?: Date;
}
```

---

## Configuration

```yaml
gateway:
  server:
    port: 3000
    host: 0.0.0.0

  websocket:
    pingInterval: 30000
    pingTimeout: 5000
    maxConnections: 10000

  session:
    ttl: 3600
    renewalThreshold: 300

  routing:
    aiTimeout: 30000
    maxRetries: 3
    escalationThreshold: 0.7

  rateLimit:
    windowMs: 60000
    maxRequests: 100
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| AI timeout | Return fallback response, flag for review |
| Channel delivery failure | Retry with backoff, notify staff |
| Database unavailable | Queue messages, graceful degradation |
| WebSocket disconnect | Auto-reconnect, resync state |

### Error Recovery Matrix

| Component | Error | Recovery Action | Guest Message |
|-----------|-------|-----------------|---------------|
| AI Engine | Timeout (30s) | Create review task, use fallback | "I'm having a moment - let me connect you with our team to help right away." |
| AI Engine | Toxic/harmful detected | Block response, escalate | "Let me get a team member to assist you with this." |
| Channel | WhatsApp rate limit (80/s) | Queue with 1s delay, batch | (Delivery delayed, no message) |
| Channel | SMS delivery failure | Retry 3x, then fallback to email | (Via email) "We couldn't reach you by SMS..." |
| Channel | Email bounce | Log, notify staff | "Our email couldn't reach you. Please reply here or call us." |
| Integration | PMS unreachable | Use cached data (1hr), flag stale | "I'm checking that for you..." (works from cache) |
| Integration | PMS timeout | Return partial data, create task | "I found [partial info]. Our team will confirm the rest shortly." |
| Gateway | Database locked (SQLite) | Retry 3x with 100ms backoff | (Transparent to guest, <500ms delay) |
| Gateway | Database corruption | Restore from backup, notify ops | (Service degraded, notify ops) |

### Error Recovery Implementation

```typescript
async function handleAIError(
  error: Error,
  conversation: Conversation
): Promise<Response> {
  if (error.code === 'TIMEOUT') {
    // Create task for human review
    await createTask({
      type: 'ai_review',
      conversationId: conversation.id,
      reason: 'AI timeout - needs human response'
    });

    return {
      type: 'fallback',
      message: "I'm having a moment - let me connect you with our team to help right away.",
      autoEscalate: true
    };
  }

  if (error.code === 'CONTENT_FILTERED') {
    // Harmful/toxic content detected
    await logSecurityEvent('content_filtered', conversation.id);
    await escalateConversation(conversation.id, 'content_policy');

    return {
      type: 'escalate',
      message: "Let me get a team member to assist you with this.",
      silent: false
    };
  }

  // Generic error fallback
  return {
    type: 'fallback',
    message: "I'm sorry, I'm having trouble right now. Our team has been notified.",
    autoEscalate: true
  };
}

async function handleChannelError(
  error: ChannelError,
  message: OutboundMessage
): Promise<void> {
  if (error.code === 'RATE_LIMITED') {
    // Queue for delayed delivery
    await outboundQueue.add(message, {
      delay: error.retryAfterMs || 1000
    });
    return;
  }

  if (error.code === 'DELIVERY_FAILED' && error.retryable) {
    // Retry with exponential backoff
    const attempt = message.metadata.retryCount || 0;
    if (attempt < 3) {
      await outboundQueue.add({
        ...message,
        metadata: { ...message.metadata, retryCount: attempt + 1 }
      }, {
        delay: Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      });
      return;
    }
  }

  // Max retries exceeded or not retryable
  if (message.channel !== 'email') {
    // Fallback to email
    await sendViaEmail(message, `We couldn't reach you via ${message.channel}.`);
  } else {
    // Email also failed - create staff task
    await createTask({
      type: 'delivery_failure',
      guestId: message.guestId,
      reason: `Failed to deliver via ${message.channel}: ${error.message}`
    });
  }
}

async function handleDatabaseError(
  error: Error,
  operation: () => Promise<any>
): Promise<any> {
  if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
    // Retry with backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sleep(100 * attempt);
      try {
        return await operation();
      } catch (retryError) {
        if (attempt === 3) throw retryError;
      }
    }
  }
  throw error;
}
```

---

## Conversation State Machine

### Complete State Transitions

```
                    ┌─────────────┐
                    │     NEW     │
                    └──────┬──────┘
                           │ Guest sends first message
                           ▼
                    ┌─────────────┐
         ┌─────────│   ACTIVE    │◄─────────────────────────┐
         │         │    (AI)     │                          │
         │         └──────┬──────┘                          │
         │                │                                 │
         │     ┌──────────┼──────────┬──────────┐          │
         │     │          │          │          │          │
         │     ▼          ▼          ▼          ▼          │
         │  Low       Explicit   Complaint  Sensitive      │
         │ Confidence  Request    High      Topic          │
         │                       Severity                  │
         │     │          │          │          │          │
         │     └──────────┴──────────┴──────────┘          │
         │                │                                 │
         │                ▼                                 │
         │         ┌─────────────┐                          │
         │         │  ESCALATED  │                          │
         │         │  (Human)    │                          │
         │         └──────┬──────┘                          │
         │                │                                 │
         │     ┌──────────┼──────────┐                     │
         │     │          │          │                      │
         │     ▼          ▼          ▼                      │
         │  Staff     Staff     Guest            Return    │
         │ Resolves  Returns   Abandons         to AI     │
         │            to AI                               ─┘
         │     │          │          │
         │     ▼          └──────────┘
         │                    │
         ▼                    ▼
    ┌─────────────┐    ┌─────────────┐
    │  RESOLVED   │    │  ABANDONED  │
    └─────────────┘    └─────────────┘
```

### State Transition Details

| From | To | Trigger | Action |
|------|-----|---------|--------|
| NEW | ACTIVE | First message received | Create conversation, identify guest |
| ACTIVE | ESCALATED | Low confidence (<0.7) | Assign to staff, notify |
| ACTIVE | ESCALATED | Guest requests human | Assign to staff, notify |
| ACTIVE | ESCALATED | Complaint severity high | Assign to manager, alert |
| ACTIVE | ESCALATED | Sensitive topic detected | Assign to staff, notify |
| ACTIVE | RESOLVED | Guest says goodbye + no pending | Close, send satisfaction survey |
| ESCALATED | ACTIVE | Staff clicks "Return to AI" | Remove assignment, AI resumes |
| ESCALATED | RESOLVED | Staff resolves | Close, log resolution |
| ESCALATED | ABANDONED | No response 24h | Close, log abandonment |
| ACTIVE | ABANDONED | No response 2h | Send reminder, then close |

### De-escalation (Return to AI)

```typescript
async function returnToAI(conversationId: string): Promise<void> {
  const conversation = await getConversation(conversationId);

  if (conversation.state !== 'escalated') {
    throw new InvalidStateError('Can only return escalated conversations');
  }

  // Check if there are pending tasks
  const pendingTasks = await getPendingTasks(conversationId);
  if (pendingTasks.length > 0) {
    throw new PendingTasksError('Complete all tasks before returning to AI');
  }

  // Update state
  await updateConversation(conversationId, {
    state: 'active',
    assignedTo: null,
    returnedToAiAt: new Date(),
    returnedToAiBy: getCurrentStaffId()
  });

  // Notify guest
  await sendMessage(conversationId, {
    role: 'system',
    content: "Thanks for your patience! I'm Jack, back to help. Is there anything else you need?"
  });

  // Log event
  await logEvent('conversation.returned_to_ai', {
    conversationId,
    staffId: getCurrentStaffId()
  });
}
```

### Abandonment Handling

```typescript
const ABANDONMENT_CONFIG = {
  reminderAfterMs: 3600000,      // 1 hour
  closeAfterMs: 7200000,         // 2 hours for ACTIVE
  escalatedCloseAfterMs: 86400000 // 24 hours for ESCALATED
};

async function checkAbandonedConversations(): Promise<void> {
  const now = new Date();

  // Active conversations without response
  const staleActive = await db.query.conversations.findMany({
    where: and(
      eq(conversations.state, 'active'),
      lt(conversations.lastMessageAt, subMs(now, ABANDONMENT_CONFIG.reminderAfterMs)),
      eq(conversations.reminderSent, false)
    )
  });

  for (const conv of staleActive) {
    // Send reminder
    await sendMessage(conv.id, {
      role: 'system',
      content: "Hi! Just checking in - is there anything else I can help you with?"
    });
    await updateConversation(conv.id, { reminderSent: true });
  }

  // Close truly abandoned
  const abandoned = await db.query.conversations.findMany({
    where: and(
      eq(conversations.state, 'active'),
      lt(conversations.lastMessageAt, subMs(now, ABANDONMENT_CONFIG.closeAfterMs)),
      eq(conversations.reminderSent, true)
    )
  });

  for (const conv of abandoned) {
    await closeConversation(conv.id, 'abandoned');
  }
}

// Run check every 15 minutes
jobQueue.add('check_abandoned', {}, { repeat: { every: 900000 } });
```

### Concurrent Response Prevention

```typescript
// Prevent staff and AI from responding simultaneously
async function acquireResponseLock(conversationId: string): Promise<Lock | null> {
  const lock = await lockManager.acquire(`response:${conversationId}`, {
    ttlMs: 30000 // 30 second lock
  });

  if (!lock) {
    // Another response in progress
    return null;
  }

  return lock;
}

async function sendResponse(
  conversationId: string,
  message: string,
  sender: 'ai' | 'staff'
): Promise<void> {
  const lock = await acquireResponseLock(conversationId);

  if (!lock) {
    if (sender === 'ai') {
      // AI yields to staff - don't send
      return;
    }
    // Staff waits briefly
    await sleep(500);
    return sendResponse(conversationId, message, sender);
  }

  try {
    await addMessage(conversationId, { content: message, sender });
    await deliverToGuest(conversationId, message);
  } finally {
    await lock.release();
  }
}
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| `gateway.messages.inbound` | Messages received |
| `gateway.messages.outbound` | Messages sent |
| `gateway.messages.routed` | Messages routed to AI |
| `gateway.escalations` | Conversations escalated |
| `gateway.ws.connections` | Active WebSocket connections |
| `gateway.latency.routing` | Message routing latency |

---

## Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| SQLite | Conversation storage | Yes (embedded) |
| Channel Adapters | Message delivery | Yes |
| AI Engine | Response generation | Yes |
| Integration Layer | Hotel systems | No (graceful degradation) |

Note: All services run in-process in the single-container deployment. SQLite and the in-memory cache require no external services.

---

## Related

- [C4 Containers](../c4-containers.md) - Container overview
- [Channel Adapters](channel-adapters.md) - Message sources
- [AI Engine](ai-engine.md) - Response generation
- [API Specification](../../04-specs/api/gateway-api.md)
