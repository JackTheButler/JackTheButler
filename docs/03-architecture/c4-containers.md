# C4 Level 2: Container Diagram

The container diagram shows the major deployable/runnable components that make up Jack The Butler.

---

## Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              JACK THE BUTLER                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         PRESENTATION LAYER                               │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │  Staff Web   │  │ Staff Mobile │  │  Admin Web   │                   │   │
│  │  │  Dashboard   │  │     App      │  │   Console    │                   │   │
│  │  │              │  │              │  │              │                   │   │
│  │  │ React SPA    │  │ React Native │  │ React SPA    │                   │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │   │
│  │         │                 │                 │                            │   │
│  └─────────┼─────────────────┼─────────────────┼────────────────────────────┘   │
│            │                 │                 │                                 │
│            └─────────────────┼─────────────────┘                                 │
│                              │ HTTPS/WSS                                         │
│                              ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          APPLICATION LAYER                               │   │
│  │                                                                          │   │
│  │  ┌────────────────────────────────────────────────────────────────────┐ │   │
│  │  │                           GATEWAY                                   │ │   │
│  │  │                                                                     │ │   │
│  │  │  • WebSocket server (real-time communication)                       │ │   │
│  │  │  • REST API (CRUD operations)                                       │ │   │
│  │  │  • Message routing & orchestration                                  │ │   │
│  │  │  • Session management                                               │ │   │
│  │  │  • Authentication & authorization                                   │ │   │
│  │  │                                                                     │ │   │
│  │  │  Node.js / TypeScript                                               │ │   │
│  │  └──────────────────────────┬─────────────────────────────────────────┘ │   │
│  │                             │                                            │   │
│  │         ┌───────────────────┼───────────────────┐                       │   │
│  │         │                   │                   │                        │   │
│  │         ▼                   ▼                   ▼                        │   │
│  │  ┌────────────┐     ┌────────────┐     ┌────────────────┐               │   │
│  │  │  Channel   │     │    AI      │     │  Integration   │               │   │
│  │  │  Service   │     │  Engine    │     │    Service     │               │   │
│  │  │            │     │            │     │                │               │   │
│  │  │ • WhatsApp │     │ • Intent   │     │ • PMS adapter  │               │   │
│  │  │ • SMS      │     │ • Response │     │ • POS adapter  │               │   │
│  │  │ • Email    │     │ • Memory   │     │ • Housekeeping │               │   │
│  │  │ • WebChat  │     │ • Skills   │     │ • Maintenance  │               │   │
│  │  │            │     │            │     │                │               │   │
│  │  │ Node.js    │     │ Python     │     │ Node.js        │               │   │
│  │  └────────────┘     └────────────┘     └────────────────┘               │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                            DATA LAYER                                    │   │
│  │                                                                          │   │
│  │  ┌────────────┐     ┌────────────┐     ┌────────────┐                   │   │
│  │  │ PostgreSQL │     │   Redis    │     │  Vector DB │                   │   │
│  │  │            │     │            │     │            │                   │   │
│  │  │ • Guests   │     │ • Pub/Sub  │     │ • Knowledge│                   │   │
│  │  │ • Convos   │     │ • Cache    │     │ • Embeddings│                  │   │
│  │  │ • Tasks    │     │ • Sessions │     │ • Semantic │                   │   │
│  │  │ • Config   │     │ • Queues   │     │   search   │                   │   │
│  │  └────────────┘     └────────────┘     └────────────┘                   │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Containers

### Gateway

The central orchestration service that coordinates all communication.

| Attribute | Value |
|-----------|-------|
| Technology | Node.js / TypeScript |
| Responsibilities | Message routing, session management, API, WebSocket |
| Scaling | Horizontal with sticky sessions |
| Port | 3000 (HTTP/WS), 3001 (internal) |

**Key interfaces:**
- REST API for CRUD operations
- WebSocket for real-time updates
- Internal gRPC for service communication

[Component details →](c4-components/gateway.md)

---

### Channel Service

Handles communication with external messaging platforms.

| Attribute | Value |
|-----------|-------|
| Technology | Node.js / TypeScript |
| Responsibilities | Platform adapters, message normalization, delivery tracking |
| Scaling | Per-channel horizontal scaling |
| Dependencies | Gateway, Redis |

**Supported channels:**
- WhatsApp Business API
- Twilio (SMS)
- SMTP/IMAP (Email)
- WebSocket (Web Chat)

[Component details →](c4-components/channel-adapters.md)

---

### AI Engine

Processes messages and generates intelligent responses.

| Attribute | Value |
|-----------|-------|
| Technology | Python |
| Responsibilities | Intent classification, response generation, skill execution |
| Scaling | Horizontal, stateless |
| Dependencies | Gateway, Vector DB, AI providers |

**Capabilities:**
- Multi-provider AI support (Claude, GPT, local)
- RAG for hotel knowledge
- Conversation memory
- Skill/tool execution

[Component details →](c4-components/ai-engine.md)

---

### Integration Service

Connects Jack to hotel operational systems.

| Attribute | Value |
|-----------|-------|
| Technology | Node.js / TypeScript |
| Responsibilities | PMS sync, task creation, system abstraction |
| Scaling | Vertical (connection limits) |
| Dependencies | Gateway, PostgreSQL |

**Integrations:**
- Property Management Systems (Opera, Mews, Cloudbeds)
- Point of Sale (Micros, Toast)
- Housekeeping (Optii, Flexkeeping)
- Maintenance systems

[Component details →](c4-components/integration-layer.md)

---

### Staff Dashboard (Web)

Web application for staff to manage conversations and tasks.

| Attribute | Value |
|-----------|-------|
| Technology | React / TypeScript |
| Responsibilities | Conversation UI, task management, analytics |
| Deployment | Static hosting (CDN) |
| Dependencies | Gateway API/WebSocket |

**Features:**
- Real-time conversation queue
- Guest profile view
- Task assignment and tracking
- Reporting dashboards

---

### Staff Mobile App

Mobile application for on-the-go staff access.

| Attribute | Value |
|-----------|-------|
| Technology | React Native |
| Responsibilities | Notifications, quick actions, task completion |
| Platforms | iOS, Android |
| Dependencies | Gateway API, Push notifications |

**Features:**
- Push notifications for escalations
- Task claim and complete
- Guest quick lookup
- Offline task viewing

---

### Admin Console

Configuration and administration interface.

| Attribute | Value |
|-----------|-------|
| Technology | React / TypeScript |
| Responsibilities | System configuration, user management, integrations |
| Deployment | Static hosting |
| Access | Restricted to administrators |

**Features:**
- Property configuration
- Channel setup
- Integration management
- User and role management
- Knowledge base editing

---

### PostgreSQL

Primary relational database for persistent data.

| Attribute | Value |
|-----------|-------|
| Technology | PostgreSQL 15+ |
| Purpose | Guests, conversations, tasks, configuration |
| Scaling | Primary-replica, connection pooling |
| Backup | Continuous WAL archiving |

**Key schemas:**
- `guests` - Guest profiles and preferences
- `conversations` - Message history
- `tasks` - Service requests and work orders
- `config` - Property and system settings

[Data model →](data-model.md)

---

### Redis

In-memory data store for caching and messaging.

| Attribute | Value |
|-----------|-------|
| Technology | Redis 7+ |
| Purpose | Pub/sub, caching, sessions, queues |
| Scaling | Redis Cluster for HA |
| Persistence | RDB + AOF |

**Uses:**
- Real-time message pub/sub
- Session storage
- Rate limiting
- Task queues
- Response caching

---

### Vector Database

Semantic search for knowledge retrieval.

| Attribute | Value |
|-----------|-------|
| Technology | pgvector (PostgreSQL) or Pinecone |
| Purpose | RAG, semantic search, similarity matching |
| Scaling | Depends on implementation |

**Content:**
- Hotel FAQs and policies
- Menu items and descriptions
- Local recommendations
- Historical successful responses

---

## Communication Patterns

### Synchronous (Request-Response)

```
Client → Gateway → Service → Gateway → Client
```

Used for:
- API calls
- Configuration changes
- Immediate queries

### Asynchronous (Event-Driven)

```
Service → Redis Pub/Sub → Subscribed Services
```

Used for:
- Message routing
- Task notifications
- Real-time updates

### WebSocket (Bidirectional)

```
Client ←→ Gateway ←→ Services
```

Used for:
- Staff dashboard updates
- Conversation streaming
- Live notifications

---

## Deployment View

### Docker Compose (Single Property)

```yaml
services:
  gateway:
    image: jack/gateway
    ports: ["3000:3000"]

  channel-service:
    image: jack/channel-service

  ai-engine:
    image: jack/ai-engine

  integration-service:
    image: jack/integration-service

  postgres:
    image: postgres:15

  redis:
    image: redis:7
```

### Kubernetes (Multi-Property)

```
┌─────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Property A │  │  Property B │  │  Property C │ │
│  │  Namespace  │  │  Namespace  │  │  Namespace  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │            Shared Services                   │   │
│  │  (AI Engine, Vector DB, Monitoring)         │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Related

- [C4 Context](c4-context.md) - System context
- [C4 Components](c4-components/) - Component details
- [Data Model](data-model.md) - Database schema
- [Deployment Guide](../05-operations/deployment.md)
