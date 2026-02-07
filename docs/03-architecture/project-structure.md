# Project Structure

Source code organization for Jack The Butler.

---

## Overview

Jack is structured as a monorepo with:

- **`src/`** — Backend server (Node.js/TypeScript)
- **`apps/`** — Frontend applications (React)
- **`migrations/`** — Drizzle database migrations (SQL)
- **`tests/`** — Test files mirroring `src/`
- **`docs/`** — Documentation

---

## Directory Structure

```
jack/
├── src/
│   ├── index.ts                # Application entry point
│   ├── core/                   # Kernel — business logic
│   ├── apps/                   # App system — providers & adapters
│   ├── gateway/                # HTTP/WebSocket server
│   ├── ai/                     # AI engine — responder, intent, knowledge
│   ├── services/               # State management services
│   ├── automation/             # Automation engine
│   ├── db/                     # Database schema & seeds
│   ├── events/                 # Event system
│   ├── monitoring/             # Health & metrics
│   ├── config/                 # Configuration loading
│   ├── errors/                 # Custom error classes
│   ├── utils/                  # Shared utilities
│   └── types/                  # TypeScript type definitions
│
├── apps/
│   └── dashboard/              # Staff web dashboard (React)
│
├── migrations/                 # Drizzle SQL migrations
├── tests/                      # Test files mirroring src/
├── docs/                       # Documentation
├── data/                       # SQLite database & uploads (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── drizzle.config.ts
└── CLAUDE.md                   # Developer quick reference
```

---

## `src/core/` — Kernel

Business logic, independent of transport and external services.

| File | Purpose |
|------|---------|
| `message-processor.ts` | Orchestrates inbound message handling |
| `task-router.ts` | Routes tasks to departments and staff |
| `escalation-engine.ts` | Escalation rules and triggers |
| `conversation-fsm.ts` | Conversation state machine (new → active → resolved) |
| `autonomy.ts` | AI autonomy levels (L0–L2) |
| `approval-queue.ts` | Staff approval workflow for AI actions |
| `guest-context.ts` | Builds guest context for AI from profile, reservation, history |
| `interfaces/` | Abstract interfaces for AI, channel, and PMS adapters |

---

## `src/apps/` — App System

Pluggable providers and adapters, managed through a central registry. Each app has a manifest declaring its ID, category, config schema, and factory function.

| Directory | Category | Providers |
|-----------|----------|-----------|
| `ai/providers/` | AI | Anthropic, OpenAI, Ollama, Local (Transformers.js) |
| `channels/whatsapp/` | Channel | Meta Cloud API |
| `channels/sms/` | Channel | Twilio |
| `channels/email/` | Channel | SMTP, Gmail SMTP, Mailgun, SendGrid |
| `pms/providers/` | PMS | Mock (Mews/Cloudbeds planned) |
| `tools/site-scraper/` | Tool | Website scraper for knowledge base import |

Core files:

| File | Purpose |
|------|---------|
| `types.ts` | Manifest types (`AppManifest`, `AIAppManifest`, etc.) |
| `registry.ts` | Singleton `AppRegistry` — registers, activates, and looks up providers |
| `loader.ts` | `AppLoader` — discovers manifests and loads config from database |
| `index.ts` | Barrel exports |

---

## `src/gateway/` — HTTP/WebSocket Server

Central entry point for all external requests.

| File / Directory | Purpose |
|------------------|---------|
| `server.ts` | Hono app setup, middleware registration |
| `websocket.ts` | WebSocket server setup |
| `websocket-bridge.ts` | Bridges internal events to WebSocket clients |
| `middleware/` | Auth (JWT), error handling, request logging, security, validation |
| `routes/` | REST API route handlers |
| `routes/webhooks/` | Inbound webhooks (WhatsApp, SMS, PMS) |

### API Route Groups

| Route file | Prefix | Purpose |
|------------|--------|---------|
| `auth.ts` | `/api/v1/auth` | Login, token refresh |
| `conversations.ts` | `/api/v1/conversations` | Conversation CRUD & messaging |
| `guests.ts` | `/api/v1/guests` | Guest profiles |
| `tasks.ts` | `/api/v1/tasks` | Task management |
| `reservations.ts` | `/api/v1/reservations` | Reservation lookup |
| `knowledge.ts` | `/api/v1/knowledge` | Knowledge base CRUD |
| `apps.ts` | `/api/v1/apps` | App configuration |
| `automation.ts` | `/api/v1/automation` | Automation rules |
| `autonomy.ts` | `/api/v1/autonomy` | Autonomy level & approval queue |
| `system.ts` | `/api/v1/system` | System info & settings |
| `setup.ts` | `/api/v1/setup` | Setup wizard (no auth, protected after completion) |
| `health.ts` | `/health` | Health check |

---

## `src/ai/` — AI Engine

Message understanding and response generation.

| File / Directory | Purpose |
|------------------|---------|
| `responder.ts` | Main AI responder — builds prompts, calls provider, returns response |
| `echo-responder.ts` | Simple echo fallback when no AI provider is available |
| `types.ts` | AI-related type definitions |
| `cache.ts` | Response caching for repeated queries |
| `intent/` | Intent classification and taxonomy |
| `knowledge/` | Knowledge base retrieval (RAG) for grounding AI responses |

---

## `src/services/` — State Management

Business services for data access and operations.

| Service | Purpose |
|---------|---------|
| `conversation.ts` | Conversation lifecycle, message storage |
| `guest.ts` | Guest profiles, preferences, lookup |
| `guest-context.ts` | Guest context building for AI |
| `task.ts` | Task creation, assignment, status tracking |
| `auth.ts` | Staff authentication, JWT tokens |
| `app-config.ts` | App provider configuration (encrypted storage) |
| `setup.ts` | Setup wizard state machine, admin creation |
| `pms-sync.ts` | PMS data synchronization |
| `scheduler.ts` | Scheduled job execution |
| `audit.ts` | Audit log recording |

---

## `src/automation/` — Automation Engine

Event-driven and time-based automation for guest communication.

| File | Purpose |
|------|---------|
| `index.ts` | Automation engine setup and rule evaluation |
| `triggers.ts` | Trigger type definitions and matching |
| `actions.ts` | Action execution (send message, create task, notify staff, webhook) |
| `chain-executor.ts` | Executes multi-step action chains |
| `retry-handler.ts` | Retry logic for failed actions |
| `event-subscriber.ts` | Listens for system events to trigger rules |
| `types.ts` | Automation type definitions |
| `rules/` | Built-in rule templates (pre-arrival, checkout reminder) |

---

## `src/db/` — Database

Schema definitions and seed data.

| File / Directory | Purpose |
|------------------|---------|
| `index.ts` | Database client setup (better-sqlite3 + Drizzle) |
| `schema.ts` | All table definitions (Drizzle ORM) |
| `seed.ts` | Seed runner entry point |
| `seeds/` | Seed data generators (guests, reservations, conversations, tasks, knowledge base) |

Migrations live in the top-level `migrations/` directory, managed by Drizzle Kit.

---

## Supporting Modules

| Directory | Purpose |
|-----------|---------|
| `src/events/` | Internal event system for decoupled communication between services |
| `src/monitoring/` | Health checks and metrics collection |
| `src/config/` | Configuration loading and validation |
| `src/errors/` | Custom error classes (`AppError`, `NotFoundError`, `ValidationError`, etc.) |
| `src/utils/` | Shared utilities (logger, crypto, phone number parsing) |
| `src/types/` | Shared TypeScript type definitions |

---

## `apps/dashboard/` — Staff Dashboard

React SPA for hotel staff to manage conversations, tasks, and settings.

- **Framework:** React 18 + Vite
- **Styling:** Tailwind CSS + Radix UI
- **State:** TanStack Query + WebSocket for real-time updates
- **Auth:** JWT-based, connects to gateway `/api/v1/auth`

### Dashboard Structure

```
apps/dashboard/src/
├── components/         # Reusable UI components
├── features/           # Feature modules with co-located logic
│   ├── setup/          # Setup wizard (types, API, utils, schemas)
│   └── ...
├── shared/             # Shared infrastructure
│   ├── assistant/      # Assistant system (registry, context, render modes)
│   └── forms/          # Form schema and validation system
├── pages/              # Route page components
├── hooks/              # Global React hooks
├── lib/                # Utilities (API client, formatters)
└── locales/            # i18n translations (6 languages)
```

---

## Import Aliases

Configured in `tsconfig.json`:

```typescript
// @/* maps to src/*
import { logger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/index.js';
import { guests } from '@/db/schema.js';
```

---

## Related

- [Tech Stack](tech-stack.md) — Technology choices
- [Data Model](data-model.md) — Database schema
- [Architecture Overview](index.md) — Principles and high-level view
