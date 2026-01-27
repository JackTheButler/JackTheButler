# OpenAPI Request/Response Examples

This document provides comprehensive request/response examples for all Jack The Butler API endpoints.

---

## Authentication

### POST /auth/login

**Request:**
```json
{
  "email": "front.desk@grandhotel.com",
  "password": "SecureP@ssw0rd123"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdGFmZl9hYmMxMjMiLCJlbWFpbCI6ImZyb250LmRlc2tAZ3JhbmRob3RlbC5jb20iLCJyb2xlIjoiZnJvbnRfZGVzayIsImlhdCI6MTcwNjEyMzQ1NiwiZXhwIjoxNzA2MTI0MzU2fQ.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdGFmZl9hYmMxMjMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTcwNjEyMzQ1NiwiZXhwIjoxNzA2NzI4MjU2fQ.signature",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "staff_abc123",
    "email": "front.desk@grandhotel.com",
    "name": "Sarah Johnson",
    "role": "front_desk",
    "department": "front_office"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

### POST /auth/refresh

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newtoken...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newrefresh...",
  "expiresIn": 900
}
```

---

## Conversations

### GET /conversations

**Request:**
```http
GET /api/v1/conversations?status=active&channel=whatsapp&limit=20&offset=0
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "conversations": [
    {
      "id": "conv_7kQm9xPvN2hL3jR4",
      "guestId": "guest_9mNp2qRs5tUv8wXy",
      "channel": "whatsapp",
      "status": "active",
      "startedAt": "2024-01-15T14:30:00Z",
      "lastMessageAt": "2024-01-15T15:45:23Z",
      "messageCount": 8,
      "handledBy": "ai",
      "guest": {
        "id": "guest_9mNp2qRs5tUv8wXy",
        "name": "John Smith",
        "phone": "+14155551234",
        "roomNumber": "401",
        "loyaltyTier": "gold"
      },
      "lastMessage": {
        "id": "msg_3nKp5rTs7vWx9yZa",
        "content": "What time does the spa close?",
        "direction": "inbound",
        "createdAt": "2024-01-15T15:45:23Z"
      }
    },
    {
      "id": "conv_2bCd4eFg6hIj8kLm",
      "guestId": "guest_4pQr6sTu8vWx0yZa",
      "channel": "whatsapp",
      "status": "escalated",
      "startedAt": "2024-01-15T13:00:00Z",
      "lastMessageAt": "2024-01-15T15:30:00Z",
      "messageCount": 12,
      "handledBy": "staff",
      "assignedTo": "staff_abc123",
      "escalatedAt": "2024-01-15T14:00:00Z",
      "escalationReason": "complaint",
      "priority": "high",
      "guest": {
        "id": "guest_4pQr6sTu8vWx0yZa",
        "name": "Emily Davis",
        "phone": "+14155559876",
        "roomNumber": "802",
        "loyaltyTier": "platinum",
        "vipStatus": true
      },
      "lastMessage": {
        "id": "msg_8oPq0rSt2uVw4xYz",
        "content": "I've been waiting for 30 minutes for my room service",
        "direction": "inbound",
        "createdAt": "2024-01-15T15:30:00Z"
      }
    }
  ],
  "pagination": {
    "total": 47,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### GET /conversations/{id}

**Response (200 OK):**
```json
{
  "id": "conv_7kQm9xPvN2hL3jR4",
  "guestId": "guest_9mNp2qRs5tUv8wXy",
  "channel": "whatsapp",
  "channelId": "14155551234",
  "status": "active",
  "startedAt": "2024-01-15T14:30:00Z",
  "lastMessageAt": "2024-01-15T15:45:23Z",
  "messageCount": 8,
  "handledBy": "ai",
  "intent": "spa.inquiry",
  "sentiment": "neutral",
  "guest": {
    "id": "guest_9mNp2qRs5tUv8wXy",
    "name": "John Smith",
    "email": "john.smith@email.com",
    "phone": "+14155551234",
    "language": "en",
    "roomNumber": "401",
    "checkInDate": "2024-01-14",
    "checkOutDate": "2024-01-18",
    "loyaltyTier": "gold",
    "preferences": {
      "pillowType": "firm",
      "roomTemperature": "cool",
      "dietaryRestrictions": ["vegetarian"]
    }
  },
  "context": {
    "reservation": {
      "confirmationNumber": "CONF123456",
      "roomType": "Deluxe King",
      "totalNights": 4,
      "totalAmount": 1599.96
    },
    "recentRequests": [
      "Extra towels (completed)",
      "Late checkout requested"
    ]
  }
}
```

### GET /conversations/{id}/messages

**Response (200 OK):**
```json
{
  "messages": [
    {
      "id": "msg_1aBc2dEf3gHi4jKl",
      "conversationId": "conv_7kQm9xPvN2hL3jR4",
      "direction": "inbound",
      "content": "Hi, I'd like to know about spa services",
      "channel": "whatsapp",
      "createdAt": "2024-01-15T14:30:00Z",
      "deliveredAt": "2024-01-15T14:30:01Z",
      "readAt": "2024-01-15T14:30:05Z"
    },
    {
      "id": "msg_2cDe3fGh4iJk5lMn",
      "conversationId": "conv_7kQm9xPvN2hL3jR4",
      "direction": "outbound",
      "content": "Hello John! I'd be happy to help you with information about our spa. The Grand Hotel Spa offers a full range of treatments including massages, facials, and body treatments. Would you like to know about specific services or our hours of operation?",
      "channel": "whatsapp",
      "sender": {
        "type": "ai",
        "name": "Jack"
      },
      "createdAt": "2024-01-15T14:30:15Z",
      "deliveredAt": "2024-01-15T14:30:16Z",
      "readAt": "2024-01-15T14:30:20Z"
    },
    {
      "id": "msg_3nKp5rTs7vWx9yZa",
      "conversationId": "conv_7kQm9xPvN2hL3jR4",
      "direction": "inbound",
      "content": "What time does the spa close?",
      "channel": "whatsapp",
      "createdAt": "2024-01-15T15:45:23Z",
      "deliveredAt": "2024-01-15T15:45:24Z"
    }
  ],
  "pagination": {
    "total": 8,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### POST /conversations/{id}/messages

**Request:**
```json
{
  "content": "The spa is open from 8 AM to 9 PM daily. Would you like me to book a treatment for you?",
  "type": "text"
}
```

**Response (201 Created):**
```json
{
  "id": "msg_4oPq6rSt8uVw0xYz",
  "conversationId": "conv_7kQm9xPvN2hL3jR4",
  "direction": "outbound",
  "content": "The spa is open from 8 AM to 9 PM daily. Would you like me to book a treatment for you?",
  "channel": "whatsapp",
  "sender": {
    "type": "staff",
    "id": "staff_abc123",
    "name": "Sarah Johnson"
  },
  "createdAt": "2024-01-15T15:46:00Z",
  "status": "sent"
}
```

### POST /conversations/{id}/escalate

**Request:**
```json
{
  "reason": "Guest requested human assistance",
  "priority": "normal",
  "department": "concierge",
  "notes": "Guest wants to book a special anniversary dinner"
}
```

**Response (200 OK):**
```json
{
  "id": "conv_7kQm9xPvN2hL3jR4",
  "status": "escalated",
  "escalatedAt": "2024-01-15T15:50:00Z",
  "escalationReason": "guest_requested",
  "priority": "normal",
  "assignedTo": null,
  "task": {
    "id": "task_5pQr7sTu9vWx1yZa",
    "type": "escalation",
    "status": "pending",
    "department": "concierge",
    "createdAt": "2024-01-15T15:50:00Z"
  }
}
```

### POST /conversations/{id}/resolve

**Request:**
```json
{
  "resolution": "Provided spa hours and booked 60-minute massage for tomorrow at 2 PM",
  "sendSurvey": true
}
```

**Response (200 OK):**
```json
{
  "id": "conv_7kQm9xPvN2hL3jR4",
  "status": "resolved",
  "resolvedAt": "2024-01-15T16:00:00Z",
  "resolvedBy": "staff",
  "resolverId": "staff_abc123",
  "resolution": "Provided spa hours and booked 60-minute massage for tomorrow at 2 PM",
  "surveyScheduled": true
}
```

---

## Tasks

### GET /tasks

**Request:**
```http
GET /api/v1/tasks?status=pending&department=housekeeping&limit=10
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "tasks": [
    {
      "id": "task_6qRs8tUv0wXy2zAb",
      "type": "housekeeping",
      "subtype": "extra_towels",
      "status": "pending",
      "priority": "normal",
      "department": "housekeeping",
      "description": "Guest requested extra towels",
      "roomNumber": "401",
      "guestId": "guest_9mNp2qRs5tUv8wXy",
      "guestName": "John Smith",
      "conversationId": "conv_7kQm9xPvN2hL3jR4",
      "createdAt": "2024-01-15T15:00:00Z",
      "dueAt": "2024-01-15T15:30:00Z",
      "assignedTo": null,
      "slaStatus": "on_track"
    },
    {
      "id": "task_7rSt9uVw1xYz3aBc",
      "type": "housekeeping",
      "subtype": "room_cleaning",
      "status": "pending",
      "priority": "high",
      "department": "housekeeping",
      "description": "VIP guest room needs urgent cleaning",
      "roomNumber": "802",
      "guestId": "guest_4pQr6sTu8vWx0yZa",
      "guestName": "Emily Davis",
      "conversationId": "conv_2bCd4eFg6hIj8kLm",
      "createdAt": "2024-01-15T14:30:00Z",
      "dueAt": "2024-01-15T15:00:00Z",
      "assignedTo": "staff_def456",
      "assignedToName": "Maria Garcia",
      "slaStatus": "at_risk"
    }
  ],
  "pagination": {
    "total": 23,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

### POST /tasks

**Request:**
```json
{
  "type": "maintenance",
  "subtype": "hvac_issue",
  "priority": "high",
  "department": "maintenance",
  "description": "AC not cooling properly in room 503",
  "roomNumber": "503",
  "guestId": "guest_8nOp0qRs2tUv4wXy",
  "conversationId": "conv_9cDe1fGh3iJk5lMn",
  "notes": "Guest mentioned the room has been warm since check-in"
}
```

**Response (201 Created):**
```json
{
  "id": "task_8sTu0vWx2yZa4bCd",
  "type": "maintenance",
  "subtype": "hvac_issue",
  "status": "pending",
  "priority": "high",
  "department": "maintenance",
  "description": "AC not cooling properly in room 503",
  "roomNumber": "503",
  "guestId": "guest_8nOp0qRs2tUv4wXy",
  "guestName": "Michael Brown",
  "conversationId": "conv_9cDe1fGh3iJk5lMn",
  "createdAt": "2024-01-15T16:00:00Z",
  "dueAt": "2024-01-15T17:00:00Z",
  "assignedTo": null,
  "slaDeadline": "2024-01-15T17:00:00Z"
}
```

### PATCH /tasks/{id}

**Request:**
```json
{
  "status": "completed",
  "completionNotes": "Replaced AC filter and recharged refrigerant. System now cooling properly.",
  "actualDuration": 45
}
```

**Response (200 OK):**
```json
{
  "id": "task_8sTu0vWx2yZa4bCd",
  "type": "maintenance",
  "subtype": "hvac_issue",
  "status": "completed",
  "priority": "high",
  "department": "maintenance",
  "description": "AC not cooling properly in room 503",
  "roomNumber": "503",
  "completedAt": "2024-01-15T16:45:00Z",
  "completedBy": "staff_ghi789",
  "completionNotes": "Replaced AC filter and recharged refrigerant. System now cooling properly.",
  "actualDuration": 45,
  "slaStatus": "met"
}
```

---

## Guests

### GET /guests/{id}

**Response (200 OK):**
```json
{
  "id": "guest_9mNp2qRs5tUv8wXy",
  "name": "John Smith",
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@email.com",
  "phone": "+14155551234",
  "language": "en",
  "channel": "whatsapp",
  "channelId": "14155551234",
  "status": "active",
  "loyaltyNumber": "GOLD789456",
  "loyaltyTier": "gold",
  "vipStatus": false,
  "totalStays": 8,
  "totalNights": 24,
  "currentReservation": {
    "id": "res_1aBc2dEf3gHi4jKl",
    "confirmationNumber": "CONF123456",
    "roomNumber": "401",
    "roomType": "Deluxe King",
    "checkInDate": "2024-01-14",
    "checkOutDate": "2024-01-18",
    "adults": 2,
    "children": 0,
    "status": "checked_in",
    "specialRequests": "High floor, away from elevator"
  },
  "preferences": {
    "pillowType": "firm",
    "roomTemperature": "cool",
    "floorPreference": "high",
    "newspaper": "Wall Street Journal",
    "dietaryRestrictions": ["vegetarian"],
    "wakeUpCall": false
  },
  "notes": "Prefers quiet rooms. Celebrated anniversary here last year.",
  "createdAt": "2022-06-15T10:00:00Z",
  "lastStayAt": "2023-09-20T14:00:00Z"
}
```

### PATCH /guests/{id}/preferences

**Request:**
```json
{
  "pillowType": "soft",
  "roomTemperature": "warm",
  "dietaryRestrictions": ["vegetarian", "gluten-free"]
}
```

**Response (200 OK):**
```json
{
  "id": "guest_9mNp2qRs5tUv8wXy",
  "preferences": {
    "pillowType": "soft",
    "roomTemperature": "warm",
    "floorPreference": "high",
    "newspaper": "Wall Street Journal",
    "dietaryRestrictions": ["vegetarian", "gluten-free"],
    "wakeUpCall": false
  },
  "updatedAt": "2024-01-15T16:30:00Z"
}
```

---

## Staff

### GET /staff

**Response (200 OK):**
```json
{
  "staff": [
    {
      "id": "staff_abc123",
      "email": "sarah.johnson@grandhotel.com",
      "name": "Sarah Johnson",
      "role": "front_desk",
      "department": "front_office",
      "status": "available",
      "workload": {
        "activeConversations": 3,
        "activeTasks": 1,
        "utilizationPercent": 60
      },
      "lastActivityAt": "2024-01-15T16:25:00Z"
    },
    {
      "id": "staff_def456",
      "email": "maria.garcia@grandhotel.com",
      "name": "Maria Garcia",
      "role": "housekeeping",
      "department": "housekeeping",
      "status": "busy",
      "workload": {
        "activeConversations": 0,
        "activeTasks": 3,
        "utilizationPercent": 100
      },
      "lastActivityAt": "2024-01-15T16:20:00Z"
    }
  ],
  "summary": {
    "total": 24,
    "available": 12,
    "busy": 8,
    "away": 2,
    "offline": 2
  }
}
```

### PATCH /staff/{id}/status

**Request:**
```json
{
  "status": "away",
  "reason": "On break"
}
```

**Response (200 OK):**
```json
{
  "id": "staff_abc123",
  "status": "away",
  "statusChangedAt": "2024-01-15T16:30:00Z",
  "statusReason": "On break"
}
```

---

## Webhooks

### WhatsApp Incoming Message

**Webhook Payload:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "123456789012345",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "123456789"
            },
            "contacts": [
              {
                "profile": {
                  "name": "John Smith"
                },
                "wa_id": "14155551234"
              }
            ],
            "messages": [
              {
                "from": "14155551234",
                "id": "wamid.HBgLMTQxNTU1NTEyMzQVAgASGBYzRUIwRjgyNDI0NEY3QTNEMTYyMA==",
                "timestamp": "1705332323",
                "text": {
                  "body": "Hi, I need extra towels please"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "status": "received",
  "messageId": "msg_5pQr7sTu9vWx1yZa"
}
```

### Twilio SMS Incoming

**Webhook Payload (form-urlencoded):**
```
ToCountry=US&ToState=CA&SmsMessageSid=SMxxxxxxxx&NumMedia=0&ToCity=SAN+FRANCISCO&FromZip=94105&SmsSid=SMxxxxxxxx&FromState=CA&SmsStatus=received&FromCity=SAN+FRANCISCO&Body=I+need+late+checkout+please&FromCountry=US&To=%2B15551234567&ToZip=94107&NumSegments=1&MessageSid=SMxxxxxxxx&AccountSid=ACxxxxxxxx&From=%2B14155559876&ApiVersion=2010-04-01
```

**Response (200 OK - TwiML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

---

## Health Checks

### GET /health/live

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T16:30:00Z"
}
```

### GET /health/ready

**Response (200 OK):**
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "ai": "ok",
    "channels": "ok"
  },
  "timestamp": "2024-01-15T16:30:00Z"
}
```

### GET /health/detailed

**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.2.3",
  "uptime": 864000,
  "checks": {
    "database": {
      "status": "ok",
      "latency": 2,
      "details": {
        "connections": 5,
        "maxConnections": 10
      }
    },
    "ai": {
      "status": "ok",
      "provider": "claude",
      "latency": 150,
      "tokensUsedToday": 125000,
      "tokensLimit": 1000000
    },
    "channels": {
      "whatsapp": {
        "status": "ok",
        "connected": true,
        "lastWebhookAt": "2024-01-15T16:29:45Z"
      },
      "twilio": {
        "status": "ok",
        "connected": true,
        "balance": 145.67
      },
      "email": {
        "status": "ok",
        "connected": true
      }
    },
    "memory": {
      "status": "ok",
      "heapUsed": 128000000,
      "heapTotal": 256000000,
      "rss": 312000000
    },
    "jobs": {
      "status": "ok",
      "pending": 12,
      "processing": 3,
      "failed": 0
    }
  },
  "timestamp": "2024-01-15T16:30:00Z"
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "priority",
      "message": "Must be one of: low, normal, high, urgent"
    }
  ],
  "requestId": "req_9tUv1wXy3zAb5cDe"
}
```

### 401 Unauthorized

```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "requestId": "req_0uVw2xYz4aBc6dEf"
}
```

### 403 Forbidden

```json
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions to perform this action",
  "requiredRole": "manager",
  "currentRole": "front_desk",
  "requestId": "req_1vWx3yZa5bCd7eFg"
}
```

### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Conversation not found",
  "resourceType": "conversation",
  "resourceId": "conv_invalid123",
  "requestId": "req_2wXy4zAb6cDe8fGh"
}
```

### 429 Too Many Requests

```json
{
  "error": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "retryAfter": 30,
  "limit": 100,
  "remaining": 0,
  "resetAt": "2024-01-15T16:31:00Z",
  "requestId": "req_3xYz5aBc7dEf9gHi"
}
```

### 500 Internal Server Error

```json
{
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred",
  "requestId": "req_4yZa6bCd8eFg0hIj"
}
```

---

## Pagination

All list endpoints support pagination:

**Request:**
```http
GET /api/v1/conversations?limit=20&offset=40
```

**Response includes:**
```json
{
  "data": [...],
  "pagination": {
    "total": 147,
    "limit": 20,
    "offset": 40,
    "hasMore": true
  }
}
```

---

## Filtering

Common filter parameters:

| Parameter | Type | Example |
|-----------|------|---------|
| `status` | string | `?status=active` |
| `channel` | string | `?channel=whatsapp` |
| `department` | string | `?department=housekeeping` |
| `priority` | string | `?priority=high` |
| `assignedTo` | string | `?assignedTo=staff_abc123` |
| `createdAfter` | ISO date | `?createdAfter=2024-01-15T00:00:00Z` |
| `createdBefore` | ISO date | `?createdBefore=2024-01-16T00:00:00Z` |

Multiple values can be comma-separated:
```http
GET /api/v1/tasks?status=pending,in_progress&priority=high,urgent
```

---

## Related

- [Gateway API](gateway-api.md) - Full API specification
- [Authentication](authentication.md) - Auth details
- [Webhook Spec](webhook-spec.md) - Webhook details
