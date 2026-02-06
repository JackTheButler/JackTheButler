# Specifications

Technical specifications for Jack The Butler.

---

## API

| Document | Description | Status |
|----------|-------------|--------|
| [REST API](api/rest-api.md) | HTTP endpoints | Implemented |
| [WebSocket](api/websocket.md) | Real-time events | Implemented |
| [Webhooks](api/webhooks.md) | Inbound webhook handling | Implemented |
| [Authentication](api/authentication.md) | JWT auth flow | Implemented |
| [Rate Limiting](api/rate-limiting.md) | Request throttling | Planned |

## Channels

| Document | Description | Status |
|----------|-------------|--------|
| [WhatsApp](channels/whatsapp.md) | Meta Cloud API | Implemented |
| [SMS](channels/sms.md) | Twilio | Implemented |
| [Email](channels/email.md) | SMTP/Mailgun/SendGrid | Implemented |

## Features

| Document | Description | Status |
|----------|-------------|--------|
| [Intent Taxonomy](features/intent-taxonomy.md) | Message classification | Implemented |
| [Conversation FSM](features/conversation-fsm.md) | State machine | Implemented |
| [Task Routing](features/task-routing.md) | Department routing | Implemented |
| [Autonomy](features/autonomy.md) | L1/L2 approval flow | Implemented |
| [Knowledge Base](features/knowledge-base.md) | RAG and embeddings | Implemented |
| [Automation](features/automation.md) | Triggers and actions | Implemented |
| [Guest Memory](features/guest-memory.md) | Preferences and history | Planned |
| [Multi-Language](features/multi-language.md) | i18n support | Planned |
| [Analytics](features/analytics.md) | Metrics pipeline | Planned |
| [File Uploads](features/file-uploads.md) | Media handling | Planned |
| [Vector Search](features/vector-search.md) | Semantic search | Planned |

## PMS

| Document | Description | Status |
|----------|-------------|--------|
| [PMS Integration](pms/index.md) | Adapter interface | Partial |
| [Sync Conflicts](pms/sync-conflicts.md) | Conflict resolution | Planned |

---

## Related

- [Architecture](../03-architecture/) — System design
- [Use Cases](../02-use-cases/) — Feature requirements
