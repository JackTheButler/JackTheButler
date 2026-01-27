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
  propertyId: string;

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
| PostgreSQL | Conversation storage | Yes |
| Redis | Pub/sub, sessions | Yes |
| Channel Service | Message delivery | Yes |
| AI Engine | Response generation | Yes |
| Integration Service | Hotel systems | No (graceful degradation) |

---

## Related

- [C4 Containers](../c4-containers.md) - Container overview
- [Channel Adapters](channel-adapters.md) - Message sources
- [AI Engine](ai-engine.md) - Response generation
- [API Specification](../../04-specs/api/gateway-api.md)
