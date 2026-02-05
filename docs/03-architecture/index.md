# Architecture

Technical architecture documentation for Jack The Butler.

---

## Architecture Principles

1. **Self-hosted** — Runs on the hotel's own infrastructure
2. **Single container** — No external database services required
3. **Local-first** — Data stays on the hotel's server
4. **Channel-agnostic** — Core logic independent of messaging platform
5. **AI provider abstraction** — Support Claude, OpenAI, Ollama, or local Transformers.js
6. **Simple operations** — SQLite database, easy backup (copy the file)
7. **Kernel/App separation** — Business logic in `src/core/`, adapters in `src/apps/`
8. **Apps** — AI providers, communication channels, and hotel systems are collectively called "apps" across API, database, and UI

---

## High-Level View

```
                    ┌───────────────────────────────────┐
                    │           GUESTS                  │
                    │  (WhatsApp, SMS, Email, Web Chat) │
                    └────────────────┬──────────────────┘
                                     │
                              Channel Webhooks
                                     │
                                     ▼
┌──────────────┐          ┌─────────────────────┐          ┌──────────────┐
│   Hotel PMS  │◄────────►│   JACK THE BUTLER   │◄────────►│  AI Providers│
│ (Mews, Opera │  PMS     │                     │  API     │ (Claude,     │
│  Cloudbeds)  │  Sync    │  Gateway (Hono)     │  Calls   │  OpenAI,     │
└──────────────┘          │  Core Engine        │          │  Ollama,     │
                          │  SQLite Database    │          │  Local AI)   │
                          │  Automation Engine  │          └──────────────┘
                          │                     │
                          └──────────┬──────────┘
                                     │
                                  WebSocket
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   STAFF DASHBOARD   │
                          │   (React SPA)       │
                          └─────────────────────┘
```

---

## Documents

| Document | Description |
|----------|-------------|
| [Tech Stack](tech-stack.md) | Runtime, frameworks, database, and tooling |
| [Project Structure](project-structure.md) | Directory layout and module responsibilities |
| [Data Model](data-model.md) | Database schema, tables, and relationships |
| [System Overview](system-overview.md) | Containers, components, and request flows |
| [Decisions](decisions/) | Architecture Decision Records (ADRs) |

---

## Related

- [Vision & Goals](../01-vision/overview.md)
- [Use Cases](../02-use-cases/)
- [CLAUDE.md](../../CLAUDE.md) — Developer quick reference
