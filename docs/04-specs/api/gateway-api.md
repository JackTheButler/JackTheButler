# Specification: Gateway API

REST and WebSocket API for Jack The Butler Gateway.

---

## Overview

The Gateway exposes two interfaces:
1. **REST API** - CRUD operations, queries, actions
2. **WebSocket API** - Real-time updates, live conversations

Base URL: `https://api.jackthebutler.com/v1`

---

## Authentication

> **Full specification:** See [Authentication Specification](authentication.md) for complete details on JWT tokens, refresh flows, session management, and API keys.

### Quick Reference

**Staff Authentication (JWT):**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "staff@hotel.com",
  "password": "securePassword123",
  "deviceId": "device-fingerprint",
  "clientType": "dashboard"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "staff_V1StGXR8_Z5jdHi6B-myT",
    "email": "staff@hotel.com",
    "name": "Maria Garcia",
    "role": "front_desk",
    "permissions": ["conversations:read", "conversations:write", "tasks:read"]
  }
}
```

All subsequent requests include:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Token Refresh:**
```http
POST /auth/refresh
{"refreshToken": "eyJhbGciOiJIUzI1NiIs..."}
```

**Logout:**
```http
POST /auth/logout           # Current device
POST /auth/logout-all       # All devices
```

### Service Authentication

API keys for external service callbacks (webhooks).

```http
X-API-Key: jack_live_sk_V1StGXR8Z5jdHi6BmyTxYz123AbC456
X-Jack-Signature: sha256=abc123...
X-Jack-Timestamp: 1705312200
```

---

## REST API Endpoints

### Conversations

#### List Conversations

```http
GET /conversations
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | Filter by state: `active`, `escalated`, `resolved` |
| `assignedTo` | string | Filter by assigned staff ID |
| `channel` | string | Filter by channel type |
| `since` | datetime | Conversations updated since |
| `limit` | integer | Max results (default 50, max 100) |
| `cursor` | string | Pagination cursor |

Response:
```json
{
  "conversations": [
    {
      "id": "conv_789",
      "guestId": "guest_123",
      "guestName": "Sarah Chen",
      "roomNumber": "412",
      "channel": "whatsapp",
      "state": "active",
      "lastMessage": {
        "content": "Can I get extra towels?",
        "direction": "inbound",
        "createdAt": "2024-01-15T10:30:00Z"
      },
      "messageCount": 5,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "cursor": "eyJpZCI6ImNvbnZfNzg5In0="
}
```

#### Get Conversation

```http
GET /conversations/:id
```

Response:
```json
{
  "id": "conv_789",
  "guestId": "guest_123",
  "reservationId": "res_456",
  "channel": "whatsapp",
  "channelId": "+15551234567",
  "state": "active",
  "assignedTo": null,
  "currentIntent": "request.service.towels",
  "metadata": {},
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "guest": {
    "id": "guest_123",
    "firstName": "Sarah",
    "lastName": "Chen",
    "loyaltyTier": "gold",
    "preferences": []
  },
  "reservation": {
    "confirmationNumber": "ABC123",
    "roomNumber": "412",
    "arrivalDate": "2024-01-14",
    "departureDate": "2024-01-17"
  }
}
```

#### Get Conversation Messages

```http
GET /conversations/:id/messages
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Max messages (default 50) |
| `before` | string | Messages before this ID |
| `after` | string | Messages after this ID |

Response:
```json
{
  "messages": [
    {
      "id": "msg_001",
      "direction": "inbound",
      "senderType": "guest",
      "content": "Hi, can I get some extra towels?",
      "contentType": "text",
      "intent": "request.service.towels",
      "confidence": 0.95,
      "createdAt": "2024-01-15T10:25:00Z"
    },
    {
      "id": "msg_002",
      "direction": "outbound",
      "senderType": "ai",
      "content": "Of course! I'm sending 2 bath towels and 2 hand towels to room 412. They should arrive within 15 minutes.",
      "contentType": "text",
      "createdAt": "2024-01-15T10:25:05Z"
    }
  ]
}
```

#### Send Message (Staff)

```http
POST /conversations/:id/messages
Content-Type: application/json

{
  "content": "Hi Sarah, this is Maria from the front desk...",
  "contentType": "text"
}
```

Response:
```json
{
  "id": "msg_003",
  "direction": "outbound",
  "senderType": "staff",
  "senderId": "usr_123",
  "content": "Hi Sarah, this is Maria from the front desk...",
  "contentType": "text",
  "deliveryStatus": "sent",
  "createdAt": "2024-01-15T10:35:00Z"
}
```

#### Escalate Conversation

```http
POST /conversations/:id/escalate
Content-Type: application/json

{
  "reason": "Guest requested human assistance",
  "assignTo": "usr_123"  // Optional
}
```

#### Resolve Conversation

```http
POST /conversations/:id/resolve
Content-Type: application/json

{
  "resolution": "Request fulfilled",
  "feedback": {
    "rating": 5,
    "comment": "Quick response!"
  }
}
```

---

### Guests

#### Search Guests

```http
GET /guests
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search by name, email, or phone |
| `email` | string | Exact email match |
| `phone` | string | Exact phone match |
| `roomNumber` | string | Current room number |

#### Get Guest Profile

```http
GET /guests/:id
```

Response:
```json
{
  "id": "guest_123",
  "firstName": "Sarah",
  "lastName": "Chen",
  "email": "sarah@example.com",
  "phone": "+15551234567",
  "language": "en",
  "loyaltyTier": "gold",
  "preferences": [
    {
      "category": "room",
      "key": "floor",
      "value": "high",
      "source": "stated"
    },
    {
      "category": "room",
      "key": "pillow",
      "value": "firm",
      "source": "learned"
    }
  ],
  "stayCount": 4,
  "totalRevenue": 2847.00,
  "currentStay": {
    "reservationId": "res_456",
    "confirmationNumber": "ABC123",
    "roomNumber": "412",
    "arrivalDate": "2024-01-14",
    "departureDate": "2024-01-17",
    "status": "checked_in"
  },
  "notes": "Tech executive, appreciates efficiency",
  "tags": ["vip", "business"],
  "createdAt": "2023-03-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

#### Update Guest Preferences

```http
PATCH /guests/:id/preferences
Content-Type: application/json

{
  "preferences": [
    {
      "category": "dining",
      "key": "dietary",
      "value": "vegetarian",
      "source": "stated"
    }
  ]
}
```

---

### Tasks

#### List Tasks

```http
GET /tasks
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | `pending`, `assigned`, `in_progress`, `completed` |
| `department` | string | `housekeeping`, `maintenance`, `concierge` |
| `assignedTo` | string | Staff ID |
| `priority` | string | `urgent`, `high`, `standard`, `low` |

#### Create Task

```http
POST /tasks
Content-Type: application/json

{
  "type": "housekeeping",
  "department": "housekeeping",
  "roomNumber": "412",
  "description": "Extra towels requested",
  "items": [
    { "item": "bath_towel", "quantity": 2 },
    { "item": "hand_towel", "quantity": 2 }
  ],
  "priority": "standard",
  "conversationId": "conv_789",
  "dueAt": "2024-01-15T10:45:00Z"
}
```

#### Update Task Status

```http
PATCH /tasks/:id
Content-Type: application/json

{
  "status": "completed",
  "notes": "Delivered to room"
}
```

---

## WebSocket API

### Protocol Overview

The WebSocket API provides real-time bidirectional communication for the staff dashboard and mobile apps.

| Parameter | Value |
|-----------|-------|
| Endpoint | `wss://api.jackthebutler.com/v1/ws` |
| Subprotocol | `jack.v1` |
| Max message size | 64 KB |
| Ping interval | 30 seconds |
| Pong timeout | 10 seconds |
| Auth timeout | 5 seconds |
| Idle timeout | 5 minutes |

### Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WebSocket Connection Lifecycle                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Client                                Server                      │
│     │                                     │                         │
│     │──────── Connect ────────────────────▶                         │
│     │                                     │                         │
│     │◀─────── Connected ──────────────────│                         │
│     │                                     │                         │
│     │──────── auth (JWT) ─────────────────▶  ◄── 5s timeout         │
│     │                                     │                         │
│     │◀─────── auth_success ───────────────│                         │
│     │           OR                        │                         │
│     │◀─────── auth_error + close ─────────│                         │
│     │                                     │                         │
│     │──────── subscribe ──────────────────▶                         │
│     │◀─────── subscribed ─────────────────│                         │
│     │                                     │                         │
│     │◀═══════ Server events ══════════════│  (messages, updates)    │
│     │                                     │                         │
│     │◀─────── ping ───────────────────────│  ◄── every 30s          │
│     │──────── pong ───────────────────────▶  ◄── within 10s         │
│     │                                     │                         │
│     │──────── close ──────────────────────▶                         │
│     │◀─────── close ──────────────────────│                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Connection

```javascript
const ws = new WebSocket('wss://api.jackthebutler.com/v1/ws', 'jack.v1');

ws.onopen = () => {
  // Must authenticate within 5 seconds or connection closes
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'eyJhbGciOiJIUzI1NiIs...'
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'auth_success':
      console.log('Authenticated as', msg.user.name);
      // Now safe to subscribe
      break;
    case 'auth_error':
      console.error('Auth failed:', msg.error);
      // Connection will close automatically
      break;
    case 'ping':
      // Respond to keep connection alive
      ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
      break;
    // ... handle other message types
  }
};

ws.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
  // Implement reconnection logic
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Authentication

Authentication must occur within 5 seconds of connection or the server closes the socket.

**Client sends:**
```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "clientId": "dashboard-abc123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Must be `"auth"` |
| `token` | string | Yes | Valid JWT access token |
| `clientId` | string | No | Unique client identifier for multi-device tracking |

**Server responds (success):**
```json
{
  "type": "auth_success",
  "user": {
    "id": "staff_123",
    "name": "Maria Garcia",
    "role": "front_desk"
  },
  "sessionId": "ws_sess_abc123",
  "serverTime": "2024-01-15T10:00:00Z"
}
```

**Server responds (failure):**
```json
{
  "type": "auth_error",
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "JWT token has expired"
  }
}
```
*Connection closes with code 4001 after auth_error.*

### Ping/Pong Heartbeat

The server sends `ping` every 30 seconds. Client must respond with `pong` within 10 seconds.

**Server sends:**
```json
{
  "type": "ping",
  "id": "ping_12345",
  "timestamp": 1705312800000
}
```

**Client responds:**
```json
{
  "type": "pong",
  "id": "ping_12345"
}
```

If the client fails to respond in time, the server closes the connection with code 4002.

### Message Acknowledgment

All client-initiated requests that expect a response include a `requestId`. The server echoes it back for correlation.

**Client sends:**
```json
{
  "type": "subscribe",
  "requestId": "req_001",
  "channel": "conversations",
  "filters": { "state": ["active"] }
}
```

**Server responds:**
```json
{
  "type": "subscribed",
  "requestId": "req_001",
  "channel": "conversations",
  "subscriptionId": "sub_xyz789"
}
```

### Message Envelope

All WebSocket messages follow this envelope format:

```typescript
interface WebSocketMessage {
  type: string;           // Message type
  requestId?: string;     // Client-provided ID for request/response correlation
  subscriptionId?: string;// Server-assigned subscription ID
  timestamp?: number;     // Unix timestamp (ms)
  [key: string]: unknown; // Type-specific payload
}
```

### Error Messages

WebSocket errors use this format:

```json
{
  "type": "error",
  "requestId": "req_001",
  "error": {
    "code": "INVALID_SUBSCRIPTION",
    "message": "Conversation conv_999 not found",
    "details": {
      "conversationId": "conv_999"
    }
  }
}
```

**Error Codes:**

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Message sent before authentication |
| `AUTH_FAILED` | Invalid or expired token |
| `TOKEN_EXPIRED` | JWT has expired |
| `INVALID_MESSAGE` | Malformed message format |
| `INVALID_TYPE` | Unknown message type |
| `INVALID_SUBSCRIPTION` | Invalid channel or resource |
| `PERMISSION_DENIED` | User lacks permission |
| `RATE_LIMITED` | Too many messages |
| `INTERNAL_ERROR` | Server error |

### Close Codes

| Code | Meaning | Client Action |
|------|---------|---------------|
| 1000 | Normal close | None |
| 1001 | Going away (server shutdown) | Reconnect with backoff |
| 1008 | Policy violation | Do not reconnect |
| 1011 | Server error | Reconnect with backoff |
| 4000 | Unknown error | Reconnect with backoff |
| 4001 | Authentication failed | Re-authenticate, then reconnect |
| 4002 | Pong timeout | Reconnect immediately |
| 4003 | Auth timeout | Reconnect and auth faster |
| 4004 | Idle timeout | Reconnect when needed |
| 4005 | Session replaced | Another client connected |
| 4006 | Token revoked | Re-authenticate |

### Client Reconnection Strategy

```typescript
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000;  // 1 second
  private maxDelay = 30000;  // 30 seconds
  private messageQueue: QueuedMessage[] = [];

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(WS_URL, 'jack.v1');
      this.setupHandlers();
      await this.waitForOpen();
      await this.authenticate();
      this.reconnectAttempts = 0;  // Reset on success
      this.flushMessageQueue();
    } catch (error) {
      await this.handleReconnect(error);
    }
  }

  private async handleReconnect(error: Error): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('max_reconnects_exceeded');
      return;
    }

    const delay = this.calculateBackoff();
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await sleep(delay);
    await this.connect();
  }

  private calculateBackoff(): number {
    // Exponential backoff with jitter
    const exponential = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    const capped = Math.min(exponential, this.maxDelay);
    const jitter = capped * 0.2 * Math.random();  // 0-20% jitter
    return Math.floor(capped + jitter);
  }

  // Queue messages during disconnection
  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue for later (except pings)
      if (message.type !== 'pong') {
        this.messageQueue.push({
          message,
          queuedAt: Date.now(),
          attempts: 0
        });
      }
    }
  }

  private flushMessageQueue(): void {
    const now = Date.now();
    const maxAge = 60000;  // 1 minute

    // Filter out stale messages
    this.messageQueue = this.messageQueue.filter(
      item => (now - item.queuedAt) < maxAge
    );

    // Send queued messages
    for (const item of this.messageQueue) {
      this.ws?.send(JSON.stringify(item.message));
    }
    this.messageQueue = [];
  }
}

interface QueuedMessage {
  message: WebSocketMessage;
  queuedAt: number;
  attempts: number;
}
```

### Messages During Disconnection

When connection is lost:

1. **Client-side:** Messages are queued (up to 1 minute old)
2. **Server-side:** Events for subscribed channels are stored temporarily (up to 5 minutes)
3. **On reconnect:** Client receives missed events via `sync` message

**Sync on reconnect:**
```json
{
  "type": "sync",
  "missedEvents": [
    {
      "type": "message",
      "conversationId": "conv_789",
      "message": { "id": "msg_005", ... },
      "occurredAt": "2024-01-15T10:42:00Z"
    },
    {
      "type": "task_update",
      "task": { "id": "task_123", "status": "completed" },
      "occurredAt": "2024-01-15T10:43:00Z"
    }
  ],
  "syncedUntil": "2024-01-15T10:45:00Z"
}
```

### Client Messages

#### Subscribe to Conversations

```json
{
  "type": "subscribe",
  "channel": "conversations",
  "filters": {
    "state": ["active", "escalated"]
  }
}
```

#### Subscribe to Specific Conversation

```json
{
  "type": "subscribe",
  "channel": "conversation",
  "conversationId": "conv_789"
}
```

#### Send Typing Indicator

```json
{
  "type": "typing",
  "conversationId": "conv_789",
  "isTyping": true
}
```

### Server Messages

#### New Message

```json
{
  "type": "message",
  "conversationId": "conv_789",
  "message": {
    "id": "msg_004",
    "direction": "inbound",
    "senderType": "guest",
    "content": "Thank you!",
    "createdAt": "2024-01-15T10:40:00Z"
  }
}
```

#### Conversation Update

```json
{
  "type": "conversation_update",
  "conversation": {
    "id": "conv_789",
    "state": "resolved",
    "updatedAt": "2024-01-15T10:45:00Z"
  }
}
```

#### Task Update

```json
{
  "type": "task_update",
  "task": {
    "id": "task_123",
    "status": "completed",
    "completedAt": "2024-01-15T10:42:00Z"
  }
}
```

#### Notification

```json
{
  "type": "notification",
  "notification": {
    "id": "notif_001",
    "title": "Escalation",
    "body": "Room 412 conversation escalated",
    "conversationId": "conv_789",
    "priority": "high",
    "createdAt": "2024-01-15T10:35:00Z"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

### API Rate Limits

| Endpoint Type | Limit | Window | Algorithm |
|---------------|-------|--------|-----------|
| REST API | 100 requests | 1 minute | Sliding window |
| WebSocket messages | 60 messages | 1 minute | Sliding window |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315260
```

### Guest Message Rate Limits

Prevent message flooding from guests:

| Limit Type | Limit | Window | Action on Exceed |
|------------|-------|--------|------------------|
| Per-guest inbound | 30 messages | 1 minute | Soft block, auto-message |
| Per-guest burst | 5 messages | 10 seconds | Queue, delay processing |
| Per-channel global | 1000 messages | 1 minute | Alert ops, graceful degrade |

```typescript
// Guest rate limit exceeded message
const RATE_LIMIT_GUEST_MESSAGE =
  "I'm receiving your messages! Give me a moment to catch up and respond.";
```

### Proactive Message Rate Limits

Prevent spamming guests with outbound messages:

| Limit Type | Limit | Window | Rationale |
|------------|-------|--------|-----------|
| Per-guest proactive | 5 messages | 1 hour | Don't overwhelm |
| Per-guest daily | 10 messages | 24 hours | Respectful engagement |
| Per-property hourly | 100 messages | 1 hour | Prevent mass blast |
| Same-template | 1 per guest | 24 hours | No duplicate proactive |

```typescript
interface ProactiveRateCheck {
  canSend: boolean;
  reason?: 'hourly_limit' | 'daily_limit' | 'template_duplicate' | 'property_limit';
  nextAllowedAt?: Date;
}

async function checkProactiveLimit(
  guestId: string,
  templateId: string
): Promise<ProactiveRateCheck> {
  // Check per-guest hourly
  const hourlyCount = await getProactiveCount(guestId, 'hour');
  if (hourlyCount >= 5) {
    return { canSend: false, reason: 'hourly_limit' };
  }

  // Check per-guest daily
  const dailyCount = await getProactiveCount(guestId, 'day');
  if (dailyCount >= 10) {
    return { canSend: false, reason: 'daily_limit' };
  }

  // Check template duplicate
  const sentTemplate = await hasReceivedTemplate(guestId, templateId, 'day');
  if (sentTemplate) {
    return { canSend: false, reason: 'template_duplicate' };
  }

  return { canSend: true };
}
```

### Escalation Notification Rate Limits

Prevent notification fatigue for staff:

| Notification Type | Limit | Window | Behavior |
|-------------------|-------|--------|----------|
| Per-staff push | 20 | 1 hour | Queue, batch after limit |
| Per-staff SMS | 5 | 1 hour | Email fallback |
| Critical escalation | Unlimited | — | Always deliver immediately |
| Department broadcast | 1 per event | — | Deduplicate |

### Rate Limit Algorithm

Jack uses a **sliding window** algorithm for fair rate limiting:

```typescript
class SlidingWindowRateLimiter {
  private windowSizeMs: number;
  private maxRequests: number;

  async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowStart = now - this.windowSizeMs;

    // Count requests in current window
    const requests = await this.getRequests(key, windowStart, now);

    // Calculate weighted count (requests at window start count less)
    const weightedCount = requests.reduce((sum, req) => {
      const age = now - req.timestamp;
      const weight = 1 - (age / this.windowSizeMs);
      return sum + weight;
    }, 0);

    const allowed = weightedCount < this.maxRequests;
    const remaining = Math.max(0, Math.floor(this.maxRequests - weightedCount));

    if (allowed) {
      await this.recordRequest(key, now);
    }

    return { allowed, remaining };
  }
}
```

### Rate Limit Scopes

| Scope | Key Pattern | Use Case |
|-------|-------------|----------|
| Global | `global` | System-wide protection |
| Per-property | `property:{id}` | Property isolation |
| Per-channel | `channel:{type}` | Channel-specific limits |
| Per-guest | `guest:{id}` | Individual guest limits |
| Per-staff | `staff:{id}` | Staff action limits |
| Per-IP | `ip:{addr}` | Anonymous rate limiting |

### Configuration

```yaml
rateLimiting:
  algorithm: sliding_window

  api:
    rest:
      limit: 100
      windowMs: 60000
    websocket:
      limit: 60
      windowMs: 60000

  guest:
    inbound:
      perMinute: 30
      burstLimit: 5
      burstWindowMs: 10000
    outbound:
      perHour: 5
      perDay: 10

  notifications:
    staff:
      pushPerHour: 20
      smsPerHour: 5
    critical:
      unlimited: true
```

---

## Related

- [Gateway Component](../../03-architecture/c4-components/gateway.md)
- [Webhook Spec](webhook-spec.md)
