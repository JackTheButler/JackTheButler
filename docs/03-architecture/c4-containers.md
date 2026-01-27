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
│  │  │ Node.js    │     │ Node.js    │     │ Node.js        │               │   │
│  │  └────────────┘     └────────────┘     └────────────────┘               │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                            DATA LAYER                                    │   │
│  │                                                                          │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐      │   │
│  │  │                    SQLite + sqlite-vec                      │      │   │
│  │  │                                                             │      │   │
│  │  │   • Guests & Preferences   • Conversations & Messages       │      │   │
│  │  │   • Tasks & Assignments    • Knowledge Base Embeddings      │      │   │
│  │  │   • Configuration          • Semantic Search                │      │   │
│  │  │                                                             │      │   │
│  │  └─────────────────────────────────────────────────────────────┘      │   │
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
- In-process EventEmitter for service communication

[Component details →](c4-components/gateway.md)

---

### Channel Service

Handles communication with external messaging platforms.

| Attribute | Value |
|-----------|-------|
| Technology | Node.js / TypeScript |
| Responsibilities | Platform adapters, message normalization, delivery tracking |
| Scaling | Per-channel horizontal scaling |
| Dependencies | Gateway |

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
| Technology | Node.js / TypeScript |
| Responsibilities | Intent classification, response generation, skill execution |
| Scaling | Horizontal, stateless |
| Dependencies | Gateway, sqlite-vec, AI providers |

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
| Dependencies | Gateway, SQLite |

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

### SQLite Database

Single-file database for all persistent data.

| Attribute | Value |
|-----------|-------|
| Technology | SQLite + better-sqlite3 |
| ORM | Drizzle |
| Purpose | All application data |
| Backup | Simple file copy |

**Key tables:**
- `guests` - Guest profiles and preferences
- `conversations` - Message history
- `tasks` - Service requests and work orders
- `config` - System settings

[Data model →](data-model.md)

---

### Vector Search (sqlite-vec)

Embedded vector search for knowledge retrieval.

| Attribute | Value |
|-----------|-------|
| Technology | sqlite-vec extension |
| Purpose | RAG, semantic search, similarity matching |
| Scaling | Single-node (suitable for hotel scale) |

**Content:**
- Hotel FAQs and policies
- Menu items and descriptions
- Local recommendations
- Historical successful responses

---

### In-Memory Cache

Simple LRU cache for frequently accessed data.

| Attribute | Value |
|-----------|-------|
| Technology | In-memory LRU cache |
| Purpose | Guest lookups, session data, rate limiting |
| Persistence | None (rebuilt on restart) |

**Uses:**
- Guest profile caching
- Session storage
- Rate limiting counters
- Response caching

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
Service → EventEmitter → Subscribed Handlers
```

Used for:
- Message routing
- Task notifications
- Real-time updates

Note: For single-tenant self-hosted deployment, in-process event emitters replace Redis pub/sub.

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

### Docker (Recommended)

Single container deployment - no external services needed:

```bash
docker run -d \
  --name jack \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e JWT_SECRET=your-secret \
  jackthebutler/jack:latest
```

### Docker Compose (With Ollama)

For deployments with local LLM:

```yaml
services:
  jack:
    image: jackthebutler/jack:latest
    ports: ["3000:3000"]
    volumes:
      - jack-data:/app/data
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-data:/root/.ollama

volumes:
  jack-data:
  ollama-data:
```

### Direct Node.js

For non-Docker environments:

```bash
git clone https://github.com/jackthebutler/jack.git
cd jack
pnpm install
pnpm build
node dist/index.js
```

---

## Related

- [C4 Context](c4-context.md) - System context
- [C4 Components](c4-components/) - Component details
- [Data Model](data-model.md) - Database schema
- [Deployment Guide](../05-operations/deployment.md)
