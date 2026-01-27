# Architecture Overview

Technical architecture of Jack The Butler.

---

## Introduction

Jack The Butler follows a **gateway-centric architecture** inspired by [Clawdbot](https://github.com/clawdbot/clawdbot). The Gateway serves as the central coordination hub, connecting communication channels, AI capabilities, hotel systems, and user interfaces.

---

## Architecture Principles

1. **Channel Agnostic** - Core logic independent of communication channels
2. **Hotel System Abstraction** - Integration layer abstracts PMS/POS specifics
3. **AI Model Flexibility** - Support multiple AI providers without architecture changes
4. **Event-Driven** - Asynchronous message processing for scalability
5. **Self-Hosted First** - Designed to run on hotel infrastructure
6. **Privacy by Design** - Guest data stays within hotel control

---

## C4 Model Navigation

This architecture documentation follows the [C4 Model](https://c4model.com/):

| Level | Document | Description |
|-------|----------|-------------|
| 1 | [Context](c4-context.md) | System context and external actors |
| 2 | [Containers](c4-containers.md) | Major deployable components |
| 3 | [Components](c4-components/) | Internal component structure |
| 4 | Code | (In source code documentation) |

---

## High-Level Architecture

```
                              ┌─────────────────────────────────────┐
                              │           EXTERNAL WORLD            │
                              ├─────────────────────────────────────┤
                              │  Guests    Staff    Hotel Systems   │
                              │    │         │            │         │
                              │    ▼         ▼            ▼         │
                              │ ┌─────┐  ┌─────┐    ┌──────────┐   │
                              │ │WhApp│  │ App │    │   PMS    │   │
                              │ │ SMS │  │ Web │    │   POS    │   │
                              │ │Email│  │     │    │ H'keeping│   │
                              │ └──┬──┘  └──┬──┘    └────┬─────┘   │
                              └────┼────────┼───────────┼──────────┘
                                   │        │           │
                                   ▼        ▼           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           JACK THE BUTLER                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │   Channel    │    │              │    │     Integration      │   │
│  │   Adapters   │◄──►│   GATEWAY    │◄──►│        Layer         │   │
│  │              │    │              │    │                      │   │
│  └──────────────┘    └──────┬───────┘    └──────────────────────┘   │
│                             │                                        │
│                             ▼                                        │
│                      ┌──────────────┐                                │
│                      │  AI Engine   │                                │
│                      │              │                                │
│                      │ ┌──────────┐ │                                │
│                      │ │ Claude/  │ │                                │
│                      │ │ GPT/etc  │ │                                │
│                      │ └──────────┘ │                                │
│                      └──────────────┘                                │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                        DATA LAYER                              │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │          SQLite + sqlite-vec (single file)              │  │  │
│  │  │   Guests • Conversations • Tasks • Embeddings           │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Gateway
The central nervous system. Manages:
- WebSocket connections from all components
- Message routing and orchestration
- Session and conversation state
- Authentication and authorization

[Detailed documentation →](c4-components/gateway.md)

### Channel Adapters
Translate between external messaging platforms and Jack's internal format:
- WhatsApp Business API
- Twilio (SMS)
- Web Chat widget
- Email (SMTP/IMAP)

[Detailed documentation →](c4-components/channel-adapters.md)

### AI Engine
Processes messages and generates responses:
- Intent classification
- Response generation
- Skill execution
- Memory and context management

[Detailed documentation →](c4-components/ai-engine.md)

### Integration Layer
Connects to hotel operational systems:
- Property Management Systems (PMS)
- Point of Sale (POS)
- Housekeeping systems
- Maintenance systems

[Detailed documentation →](c4-components/integration-layer.md)

---

## Data Architecture

- [Data Model](data-model.md) - Entity relationships and schemas

---

## Key Flows

### Guest Message Flow

```
Guest sends WhatsApp message
         │
         ▼
┌─────────────────┐
│ WhatsApp Adapter│ ── Receives via webhook
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Gateway      │ ── Identifies guest, loads context
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   AI Engine     │ ── Classifies intent, generates response
└────────┬────────┘
         │
         ├──── Simple query ──► Direct response
         │
         └──── Action needed ──► Integration Layer
                                       │
                                       ▼
                               ┌───────────────┐
                               │ Hotel System  │ ── Execute action
                               └───────┬───────┘
                                       │
                                       ▼
                               Response to guest
```

### Escalation Flow

```
AI confidence below threshold
         │
         ▼
┌─────────────────┐
│    Gateway      │ ── Flags conversation for escalation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task Assignment │ ── Routes to appropriate staff
└────────┬────────┘
         │
         ├──► Push notification to staff app
         │
         └──► Dashboard queue update
                    │
                    ▼
            Staff takes over conversation
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Gateway | Node.js / TypeScript / Hono | Fast, event-driven, WebSocket support |
| API | REST + WebSocket | REST for CRUD, WS for real-time |
| Database | SQLite + Drizzle | Zero-config, single file, self-contained |
| Vector Search | sqlite-vec | Embeddings without separate service |
| Cache | In-memory LRU | Simple, no external service needed |
| AI | Claude API (primary) | Quality, safety, tool use |
| Deployment | Docker (single container) | Self-hosted friendly |

---

## Deployment Options

### Self-Hosted (Primary)

Jack is designed for **self-hosted deployment** on hotel infrastructure:

- **Docker** - Single container, one-command deploy
- **Direct Node.js** - For custom environments
- **Docker Compose** - With local LLM (Ollama)

Each hotel runs their own instance, keeping guest data on their own servers. No external database services required - everything runs in a single container with SQLite.

---

## Architecture Decision Records

Significant decisions are documented as ADRs:

| ADR | Title | Status |
|-----|-------|--------|
| [001](decisions/001-gateway-architecture.md) | Gateway-centric architecture | Accepted |
| [002](decisions/002-ai-provider-abstraction.md) | AI provider abstraction | Accepted |
| [003](decisions/003-message-queue.md) | In-memory queue with optional Redis | Accepted |
| [004](decisions/004-pms-integration-pattern.md) | PMS integration pattern | Proposed |

---

## Related

- [Vision: Overview](../01-vision/overview.md) - Why we're building this
- [Use Cases](../02-use-cases/) - What the architecture supports
- [Specifications](../04-specs/) - Detailed technical specs
