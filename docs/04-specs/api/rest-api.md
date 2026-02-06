# REST API

HTTP API reference for Jack The Butler.

---

## Overview

**Base URL:** `/api/v1`

All requests require authentication (except `/auth/login`). Include the JWT token:

```
Authorization: Bearer <token>
```

**Response Format:**

Success:
```json
{
  "data": { ... }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format"
  }
}
```

**Pagination:**

List endpoints support `limit` and `offset` query parameters.

```
GET /api/v1/conversations?limit=50&offset=0
```

---

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout current session |
| GET | `/auth/me` | Get current user |

### POST /auth/login

```json
{
  "email": "staff@hotel.com",
  "password": "password",
  "rememberMe": false
}
```

Returns `accessToken`, `refreshToken`, and user info.

---

## Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/conversations` | List conversations |
| GET | `/conversations/stats` | Get counts by state |
| GET | `/conversations/:id` | Get conversation by ID |
| PATCH | `/conversations/:id` | Update conversation |
| GET | `/conversations/:id/messages` | Get messages |
| POST | `/conversations/:id/messages` | Send message to guest |
| GET | `/conversations/:id/context` | Get guest context |

### Query Parameters (list)

| Param | Type | Description |
|-------|------|-------------|
| state | string | Filter by state: `new`, `active`, `escalated`, `resolved`, `closed` |
| assignedTo | string | Filter by staff ID |
| limit | number | Max results (default 50) |
| offset | number | Pagination offset |

### POST /conversations/:id/messages

```json
{
  "content": "Your room is ready!",
  "contentType": "text"
}
```

Sends message via the conversation's channel (WhatsApp, SMS, Email).

---

## Guests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/guests` | List guests |
| GET | `/guests/:id` | Get guest by ID |
| POST | `/guests` | Create guest |
| PATCH | `/guests/:id` | Update guest |
| DELETE | `/guests/:id` | Delete guest |
| GET | `/guests/:id/conversations` | Get guest's conversations |
| GET | `/guests/:id/reservations` | Get guest's reservations |

---

## Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List tasks |
| GET | `/tasks/stats` | Get counts by status |
| GET | `/tasks/:id` | Get task by ID |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Update task |
| POST | `/tasks/:id/complete` | Mark task complete |

### Query Parameters (list)

| Param | Type | Description |
|-------|------|-------------|
| status | string | `pending`, `assigned`, `in_progress`, `completed`, `cancelled` |
| department | string | Filter by department |
| assignedTo | string | Filter by staff ID |
| source | string | `manual`, `auto`, `automation` |

---

## Reservations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reservations` | List reservations |
| GET | `/reservations/:id` | Get reservation by ID |
| GET | `/reservations/arriving-today` | Today's arrivals |
| GET | `/reservations/in-house` | Current in-house guests |

---

## Knowledge Base

| Method | Path | Description |
|--------|------|-------------|
| GET | `/knowledge` | List knowledge entries |
| GET | `/knowledge/:id` | Get entry by ID |
| POST | `/knowledge` | Create entry |
| PATCH | `/knowledge/:id` | Update entry |
| DELETE | `/knowledge/:id` | Delete entry |
| POST | `/knowledge/search` | Semantic search |

---

## Apps

| Method | Path | Description |
|--------|------|-------------|
| GET | `/apps` | List all app manifests |
| GET | `/apps/:category` | List apps by category |
| GET | `/apps/:category/:providerId` | Get app config |
| PUT | `/apps/:category/:providerId` | Update app config |
| POST | `/apps/:category/:providerId/test` | Test connection |
| GET | `/apps/:category/:providerId/logs` | Get app logs |

---

## Automation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/automation/rules` | List automation rules |
| GET | `/automation/rules/:id` | Get rule by ID |
| POST | `/automation/rules` | Create rule |
| PATCH | `/automation/rules/:id` | Update rule |
| DELETE | `/automation/rules/:id` | Delete rule |
| POST | `/automation/rules/:id/test` | Test rule |
| GET | `/automation/rules/:id/logs` | Get rule execution logs |

---

## Autonomy & Approvals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/autonomy` | Get autonomy settings |
| PUT | `/settings/autonomy` | Update autonomy settings |
| GET | `/approvals` | List pending approvals |
| GET | `/approvals/:id` | Get approval item |
| POST | `/approvals/:id/approve` | Approve action |
| POST | `/approvals/:id/reject` | Reject action |

---

## System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/system/info` | System info and version |
| GET | `/system/settings` | Get global settings |
| PUT | `/system/settings` | Update settings |

---

## Hotel Profile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/hotel` | Get hotel profile |
| PUT | `/settings/hotel` | Update hotel profile |

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Related

- [WebSocket](websocket.md) — Real-time events
- [Webhooks](webhooks.md) — Inbound webhook handling
- [Authentication](authentication.md) — Auth flow details
