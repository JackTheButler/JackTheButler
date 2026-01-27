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

### Staff Authentication

JWT-based authentication for staff dashboard and mobile app.

```http
POST /auth/login
Content-Type: application/json

{
  "email": "staff@hotel.com",
  "password": "..."
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2024-01-15T12:00:00Z",
  "user": {
    "id": "usr_123",
    "email": "staff@hotel.com",
    "name": "Maria Garcia",
    "role": "front_desk"
  }
}
```

All subsequent requests include:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Service Authentication

API keys for external service callbacks (webhooks).

```http
X-API-Key: jack_sk_live_...
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

### Connection

```javascript
const ws = new WebSocket('wss://api.jackthebutler.com/v1/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'eyJhbGciOiJIUzI1NiIs...'
  }));
};
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

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| REST API | 100 requests | 1 minute |
| WebSocket messages | 60 messages | 1 minute |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315260
```

---

## Related

- [Gateway Component](../../03-architecture/c4-components/gateway.md)
- [Webhook Spec](webhook-spec.md)
