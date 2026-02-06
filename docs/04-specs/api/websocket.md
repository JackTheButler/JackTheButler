# WebSocket API

Real-time communication for the staff dashboard.

---

## Connection

**Endpoint:** `ws://{host}/ws`

**Authentication:** Pass JWT token as query parameter:

```
ws://localhost:3000/ws?token=<jwt-access-token>
```

On successful connection, server sends:

```json
{
  "type": "connected",
  "payload": {
    "authenticated": true,
    "timestamp": 1699999999999
  }
}
```

Authenticated connections automatically receive initial stats for tasks, conversations, and approvals.

---

## Message Format

All messages are JSON with `type` and optional `payload`:

```json
{
  "type": "message-type",
  "payload": { ... }
}
```

---

## Client → Server Messages

| Type | Description |
|------|-------------|
| `ping` | Keepalive ping |
| `subscribe` | Subscribe to topic (future) |

### ping

```json
{ "type": "ping" }
```

Server responds with `pong`.

---

## Server → Client Messages

| Type | Description |
|------|-------------|
| `connected` | Connection established |
| `pong` | Response to ping |
| `stats:tasks` | Task statistics update |
| `stats:conversations` | Conversation statistics update |
| `stats:approvals` | Approval queue statistics update |
| `model:download:progress` | Ollama model download progress |
| `subscribed` | Subscription confirmed |
| `error` | Error message |

### stats:tasks

Broadcast when tasks are created, assigned, or completed.

```json
{
  "type": "stats:tasks",
  "payload": {
    "pending": 5,
    "assigned": 3,
    "in_progress": 2,
    "completed": 50,
    "cancelled": 1
  }
}
```

### stats:conversations

Broadcast when conversations change state.

```json
{
  "type": "stats:conversations",
  "payload": {
    "new": 2,
    "active": 8,
    "waiting": 1,
    "escalated": 3,
    "resolved": 45,
    "closed": 100
  }
}
```

### stats:approvals

Broadcast when approval items are queued or decided.

```json
{
  "type": "stats:approvals",
  "payload": {
    "pending": 4,
    "approved": 20,
    "rejected": 2
  }
}
```

### model:download:progress

Broadcast during Ollama model downloads.

```json
{
  "type": "model:download:progress",
  "payload": {
    "model": "llama3.2",
    "status": "progress",
    "file": "model.bin",
    "progress": 45,
    "loaded": 2500000000,
    "total": 5500000000
  }
}
```

Status values: `initiate`, `download`, `progress`, `done`, `ready`

### error

```json
{
  "type": "error",
  "payload": {
    "message": "Invalid message format"
  }
}
```

---

## Heartbeat

Server sends ping every 30 seconds. Connections that don't respond with pong are terminated.

---

## Event Triggers

Server-to-client messages are triggered by internal domain events:

| Event | Broadcasts |
|-------|------------|
| `task.created` | `stats:tasks` |
| `task.assigned` | `stats:tasks` |
| `task.completed` | `stats:tasks` |
| `conversation.created` | `stats:conversations` |
| `conversation.updated` | `stats:conversations` |
| `conversation.escalated` | `stats:conversations` |
| `conversation.resolved` | `stats:conversations` |
| `approval.queued` | `stats:approvals` |
| `approval.decided` | `stats:approvals` |
| `approval.executed` | `stats:approvals` |
| `model.download.progress` | `model:download:progress` |

---

## Related

- [REST API](rest-api.md) — HTTP endpoints
- [Authentication](authentication.md) — JWT token details
