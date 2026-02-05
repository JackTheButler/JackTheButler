# System Overview

How Jack The Butler is structured as a running system.

---

## Overview

Jack runs as a **single Node.js process** inside a Docker container. All components — HTTP server, WebSocket, AI engine, channel adapters, automation — share the same process and communicate via in-memory events and direct function calls.

No external services are required beyond the AI provider APIs and messaging platform webhooks.

---

## System Context

```
┌──────────────────────────────────────────────────┐
│                     GUESTS                        │
│          WhatsApp, SMS, Email, Web Chat           │
└────────────────────────┬─────────────────────────┘
                         │
                  Channel Webhooks
                         │
                         ▼
┌──────────────┐   ┌───────────────┐   ┌──────────────┐
│  Hotel PMS   │◄─►│    JACK THE   │◄─►│ AI Providers │
│  (Mews,      │   │    BUTLER     │   │ (Claude,     │
│   Opera,     │   │               │   │  OpenAI,     │
│   Cloudbeds) │   │  Gateway      │   │  Ollama,     │
└──────────────┘   │  Core Engine  │   │  Local)      │
                   │  SQLite DB    │   └──────────────┘
                   │  Automation   │
                   └───────┬───────┘
                           │
                        WebSocket
                           │
                           ▼
                   ┌───────────────┐
                   │    STAFF      │
                   │   DASHBOARD   │
                   │  (React SPA)  │
                   └───────────────┘
```

### Actors

| Actor | Interaction | Channel |
|-------|-------------|---------|
| Guest | Sends messages, makes requests | WhatsApp, SMS, Email |
| Staff | Manages conversations, completes tasks | Dashboard (browser) |
| Admin | Configures system, manages apps | Dashboard (settings) |

### External Systems

| System | Purpose | Integration |
|--------|---------|-------------|
| AI Providers | Response generation, intent classification, embeddings | REST API |
| WhatsApp | Guest messaging | Meta Cloud API webhooks |
| Twilio | SMS messaging | REST API + webhooks |
| Email services | Email sending | SMTP / provider API |
| Hotel PMS | Reservations, guest data | REST API sync |

---

## Internal Components

```
┌─────────────────────────────────────────────────────────┐
│                     GATEWAY (Hono)                       │
│         REST API · WebSocket · Webhooks · Auth           │
└────┬──────────┬──────────┬──────────┬───────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
│  CORE  │ │   AI   │ │  APPS  │ │ AUTOMATION │
│        │ │ ENGINE │ │ SYSTEM │ │   ENGINE   │
│Message │ │        │ │        │ │            │
│Processor│ │Responder│ │Registry│ │ Triggers  │
│Task    │ │Intent  │ │Loader  │ │ Actions   │
│Router  │ │Knowledge│ │Manifests│ │ Chains   │
│Escalation│ │Cache  │ │        │ │ Retries  │
│FSM     │ │        │ │        │ │            │
└────┬───┘ └────┬───┘ └────┬───┘ └────┬───────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                      SERVICES                            │
│  Conversation · Guest · Task · Auth · AppConfig · Audit  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  SQLite + sqlite-vec                      │
│              data/jack.db (single file)                   │
└─────────────────────────────────────────────────────────┘
```

| Component | Directory | Responsibility |
|-----------|-----------|---------------|
| Gateway | `src/gateway/` | HTTP/WebSocket entry point, routing, middleware |
| Core | `src/core/` | Business logic: message processing, task routing, escalation, autonomy |
| AI Engine | `src/ai/` | Response generation, intent classification, knowledge retrieval |
| App System | `src/apps/` | Provider registry, manifests, adapter lifecycle |
| Automation | `src/automation/` | Time/event triggers, action chains, retries |
| Services | `src/services/` | Data access, state management |
| Database | `src/db/` | Schema, Drizzle ORM, SQLite |

---

## Request Flows

### Inbound Guest Message

```
WhatsApp webhook
  → Gateway (verify signature, parse payload)
    → Core: MessageProcessor
      → Identify guest (by phone/email)
      → Find or create conversation
      → Build guest context (profile, reservation, room number)
      → Save inbound message
      → AI Engine: generate response (with guest context)
        → Classify intent
        → Retrieve knowledge (RAG)
        → Generate personalized response
      → TaskRouter: create task if service request detected
      → EscalationEngine: escalate if needed
      → Check autonomy level
        → L2: send response directly via channel adapter
        → L1: queue for staff approval
        → L0: escalate to staff
      → Save outbound message
      → WebSocket: notify dashboard
```

### Staff Response

```
Dashboard (REST API)
  → Gateway: POST /api/v1/conversations/:id/messages
    → Services: store outbound message
    → App System: resolve channel adapter
      → Channel adapter: send to guest (WhatsApp/SMS/Email)
    → WebSocket: notify dashboard (delivery status)
```

### Task Creation (AI-initiated)

```
AI detects service request in guest message
  → Core: TaskRouter
    → Services: create task, assign department
    → WebSocket: notify dashboard
    → Automation: trigger event_based rules (if any)
```

### Automation Trigger

```
Scheduler tick (every minute)
  → Automation Engine: evaluate time_based rules
    → Match reservations (e.g. arrival in 3 days)
    → Execute action chain (send message, create task, etc.)
    → Log execution result
```

---

## Communication Patterns

### Synchronous (Request-Response)

```
Client → Gateway → Service → Gateway → Client
```

Used for REST API calls: CRUD operations, configuration changes, queries.

### Asynchronous (Event-Driven)

```
Service → EventEmitter → Subscribed Handlers
```

Used for decoupled communication: message routing, task notifications, automation triggers. In-process EventEmitter (no Redis needed for single-tenant deployment).

### Bidirectional (WebSocket)

```
Dashboard ◄──► Gateway ◄──► Services
```

Used for real-time updates: conversation queue, task status, live notifications. The WebSocket bridge subscribes to internal events and pushes updates to connected dashboard clients.

---

## Deployment

### Docker (Recommended)

Single container, no external services:

```bash
docker run -d \
  --name jack \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e JWT_SECRET=your-secret \
  jackthebutler/jack:latest
```

### Direct Node.js

```bash
pnpm install
pnpm build
node --env-file=.env dist/index.js
```

### What's in the container

| Component | Details |
|-----------|---------|
| Process | Single Node.js process |
| Port | 3000 (HTTP + WebSocket) |
| Data | `/app/data/jack.db` (mount as volume) |
| Config | Environment variables for core settings, app provider keys configured via dashboard |
| Logs | Structured JSON to stdout (Pino) |

---

## Related

- [Tech Stack](tech-stack.md) — Technology choices
- [Project Structure](project-structure.md) — Code organization
- [Data Model](data-model.md) — Database schema
- [Architecture Overview](index.md) — Principles and high-level view
