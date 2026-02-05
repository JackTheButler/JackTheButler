# Tech Stack

Technology choices for Jack The Butler.

---

## Overview

Jack's tech stack is designed for **self-hosted deployment** on hotel infrastructure. The stack prioritizes:

- **Self-host friendly** — Single Docker container, minimal dependencies
- **Local-first** — Data stays on the hotel's own server
- **Simple operations** — SQLite database, no external services needed
- **Developer experience** — TypeScript, hot reload, good tooling

---

## Core Runtime

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| Runtime | Node.js | ≥22 | Modern features, ESM support, built-in env file loading |
| Language | TypeScript | 5.x | Type safety, strict mode enabled |
| Execution | tsx | 4.x | Fast TypeScript execution in development |
| Package Manager | pnpm | 10.x | Fast, disk efficient |

---

## Backend Framework

| Component | Technology | Rationale |
|-----------|------------|-----------|
| HTTP Server | **Hono** | Lightweight, fast, great TypeScript DX |
| Node Adapter | **@hono/node-server** | Runs Hono on Node.js |
| WebSocket | **ws** | Battle-tested, low-level control |
| Validation | **Zod** | TypeScript-first schema validation |
| Auth | **jose** | JWT handling, standards compliant |

### Why Hono?

- Much faster than Express
- Built-in TypeScript support
- Middleware ecosystem (CORS, JWT, etc.)
- Small footprint fits self-hosted model

---

## Database

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Primary DB | **SQLite** (better-sqlite3) | Zero-config, single file, self-contained |
| ORM | **Drizzle** | Type-safe, performant, good migrations |
| Vector Search | **sqlite-vec** | Embeddings without separate service |
| Cache | **In-memory LRU** | Simple, no external service needed |

### Why SQLite?

For self-hosted deployment, SQLite provides:

- **Zero configuration** — No database server to install or manage
- **Single file** — Easy backup (just copy `data/jack.db`)
- **Portable** — Move installation by copying the directory
- **Fast** — No network overhead, direct file access

WAL mode is enabled for concurrent read access during writes.

---

## AI & LLM

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Primary LLM | **Claude** (Anthropic) | Best for conversation, tool use, safety |
| Fallback LLM | **GPT-4** (OpenAI) | Reliable fallback |
| Local LLM | **Ollama** | Privacy-sensitive deployments |
| Local Embeddings | **Transformers.js** (Hugging Face) | Fully offline embeddings, no API needed |

AI providers are managed through the **app registry** (`src/apps/ai/`). Each provider implements a common interface for completion and embedding, and can be enabled/disabled via the dashboard.

Available providers: Anthropic, OpenAI, Ollama, Local (Transformers.js built-in).

---

## Messaging Channels

| Channel | Technology | Notes |
|---------|------------|-------|
| WhatsApp | **Meta Cloud API** | Official Business API, webhook-based |
| SMS | **Twilio** | Industry standard |
| Email | **Nodemailer** | SMTP sending, multiple provider backends |

### Email Providers

| Provider | Library | Notes |
|----------|---------|-------|
| Generic SMTP | Nodemailer | Any SMTP server |
| Gmail SMTP | Nodemailer | Gmail-specific SMTP config |
| Mailgun | mailgun.js | API-based sending |
| SendGrid | @sendgrid/mail | API-based sending |

Channel adapters live in `src/apps/channels/` and are registered through the app registry.

> **Note:** Web chat (widget) is planned but not yet implemented.

---

## Frontend (Dashboard)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | **React 18** | Industry standard, large ecosystem |
| Build | **Vite** | Fast builds, great DX |
| Styling | **Tailwind CSS** | Utility-first, consistent |
| State | **TanStack Query** | Server state management |
| UI Components | **Radix UI** | Accessible, unstyled primitives |
| Real-time | **WebSocket** | Live updates from gateway |

The staff dashboard is the only frontend application (`apps/dashboard/`). It connects to the gateway via REST API and WebSocket for real-time updates.

---

## Testing

| Type | Tool | Approach |
|------|------|----------|
| Unit & Integration | **Vitest** | In-memory SQLite for DB tests |
| Coverage target | **70%** | Enforced in CI |

Vitest is used for all testing — unit tests, integration tests with in-memory SQLite, and API route tests. Test files live in `tests/` mirroring the `src/` structure.

---

## DevOps

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Containerization | **Docker** | Single container deployment |
| Logging | **Pino** | Fast structured JSON logging |
| Monitoring | **Built-in `/health` endpoint** | Simple, no external deps |
| Image processing | **sharp** | Resize/optimize uploaded media |

---

## Code Quality

| Tool | Purpose |
|------|---------|
| **oxlint** | Fast linting (Rust-based) |
| **Prettier** | Code formatting |
| **TypeScript strict** | Type checking |

---

## Dependencies Summary

### Production

| Package | Purpose |
|---------|---------|
| hono, @hono/node-server | HTTP framework |
| better-sqlite3, drizzle-orm | Database & ORM |
| sqlite-vec | Vector search |
| ws | WebSocket |
| zod | Validation |
| jose | JWT auth |
| @anthropic-ai/sdk | Claude API |
| openai | OpenAI API |
| @huggingface/transformers | Local AI embeddings |
| twilio | SMS |
| nodemailer, mailgun.js, @sendgrid/mail | Email |
| cheerio | HTML parsing (site scraper) |
| sharp | Image processing |
| libphonenumber-js | Phone number parsing |
| pino | Logging |

### Development

| Package | Purpose |
|---------|---------|
| typescript | Type checking |
| tsx | Dev execution |
| vitest | Testing |
| drizzle-kit | DB migrations |
| oxlint | Linting |
| prettier | Formatting |
| tsc-alias | Path alias resolution for builds |
| pino-pretty | Readable dev logs |

---

## Related

- [Project Structure](project-structure.md) — Code organization
- [Data Model](data-model.md) — Database schema
- [Architecture Overview](index.md) — Principles and high-level view
