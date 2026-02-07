# CLAUDE.md - Jack The Butler

> Project context for Claude Code

## Project Overview

**Jack The Butler** (Joint AI Control Kernel) is a self-hosted AI-powered hospitality assistant for hotels. It handles guest communication across multiple channels (WhatsApp, SMS, email, web chat), integrates with hotel systems (PMS, POS), and routes complex requests to staff.

**Deployment Model:** Self-hosted on hotel infrastructure (like Clawdbot)
**Domain:** JackTheButler.com

## Tech Stack

- **Runtime:** Node.js ≥22
- **Language:** TypeScript (strict mode)
- **Execution:** tsx for development, compiled for production
- **Package Manager:** pnpm
- **Web Framework:** Hono
- **Database:** SQLite (single file, zero config)
- **Vector Search:** sqlite-vec (embeddings)
- **Cache:** In-memory LRU
- **AI:** Anthropic Claude (primary), OpenAI, Ollama, Local (Transformers.js)
- **Testing:** Vitest (70% coverage target)
- **Linting:** oxlint + Prettier

## Project Structure

```
jack/
├── src/
│   ├── core/             # Kernel - business logic (v1.1.0+)
│   │   ├── message-processor.ts
│   │   ├── task-router.ts
│   │   ├── escalation-engine.ts
│   │   └── interfaces/   # Abstract interfaces for apps
│   ├── apps/             # Adapters - external integrations (v1.1.0+)
│   │   ├── ai/           # AI providers (anthropic, openai, ollama)
│   │   ├── channels/     # Communication (whatsapp, sms, email)
│   │   └── pms/          # Property management systems
│   ├── gateway/          # Central WebSocket/HTTP server
│   ├── services/         # State management services
│   ├── db/               # Database schema, migrations, repositories
│   ├── config/           # Configuration loading
│   ├── utils/            # Shared utilities
│   └── types/            # TypeScript type definitions
├── apps/
│   ├── dashboard/        # Staff web dashboard (React)
│   │   └── src/
│   │       ├── features/ # Feature modules (setup/, etc.)
│   │       └── shared/   # Shared infrastructure (assistant/, forms/)
│   └── widget/           # Guest web chat widget
├── data/                 # SQLite database & uploads (gitignored)
│   └── jack.db           # Main database file
├── docs/                 # Documentation
├── tests/                # Test files mirroring src/
└── config/               # Environment configs
```

> **Note:** `src/core/` and `src/apps/` follow a kernel/adapter architecture. Business logic lives in core, external integrations in apps.

## Key Commands

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start development server (with hot reload)
pnpm dev:gateway          # Start only API server
pnpm dev:dashboard        # Start only dashboard

# Database
pnpm db:generate          # Generate migrations from schema changes
pnpm db:migrate           # Run migrations
pnpm db:push              # Push schema directly (dev only)
pnpm db:seed              # Seed development data
pnpm db:studio            # Open Drizzle Studio

# Testing
pnpm test                 # Run all tests
pnpm test:watch           # Run in watch mode
pnpm test:coverage        # Run with coverage report
pnpm test:e2e             # Run end-to-end tests

# Build & Deploy
pnpm build                # Build for production
pnpm start                # Start production server
pnpm docker:build         # Build Docker image
pnpm docker:run           # Run Docker container

# Linting
pnpm lint                 # Run oxlint
pnpm lint:fix             # Fix auto-fixable issues
pnpm format               # Run Prettier
pnpm typecheck            # TypeScript type checking
pnpm check                # Run all checks (lint + types + tests)
```

## Architecture Principles

1. **Self-hosted** - Runs on hotel's own infrastructure
2. **Single container** - No external database services required
3. **Local-first** - Data stays on hotel's server
4. **Channel-agnostic** - Core logic independent of messaging platform
5. **AI provider abstraction** - Support Claude, OpenAI, or local Ollama
6. **Simple operations** - SQLite database, easy backup (copy file)
7. **Kernel/App separation** - Business logic in `src/core/`, adapters in `src/apps/`
8. **Apps** - AI providers, communication channels, and hotel systems are collectively called "apps" across API (`/api/v1/apps`), database (`app_configs`, `app_logs`), and UI

## Code Conventions

### File Naming
- `kebab-case` for files: `guest-memory.ts`, `whatsapp-adapter.ts`
- `PascalCase` for classes: `GatewayService`, `WhatsAppAdapter`
- `camelCase` for functions/variables: `processMessage`, `guestProfile`

### Imports
```typescript
// External packages first
import { Hono } from 'hono';
import Database from 'better-sqlite3';

// Internal absolute imports (must use .js extension for ESM)
import { GuestService } from '@/services/guest.js';
import { logger } from '@/utils/logger.js';

// Relative imports last (also need .js)
import { handleMessage } from './handlers.js';
```

### Error Handling
```typescript
// Use custom error classes
import { AppError, NotFoundError, ValidationError } from '@/errors';

// Always include context
throw new NotFoundError('Guest not found', { guestId });
```

### Logging
```typescript
import { logger } from '@/utils/logger';

logger.info('Processing message', { conversationId, channel });
logger.error('Failed to send message', { error, messageId });
```

## Environment Variables

Required in `.env`:
```bash
# Core
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/jack.db

# Security
JWT_SECRET=your-jwt-secret-min-32-chars           # For API auth tokens
ENCRYPTION_KEY=your-encryption-key-min-32-chars   # For DB credential storage

# AI and channels are configured via dashboard, not env vars
```

## Key Documentation

- [Vision & Goals](docs/01-vision/overview.md)
- [Use Cases](docs/02-use-cases/index.md)
- [Architecture](docs/03-architecture/index.md)
- [API Specs](docs/04-specs/api/)
- [Local Development](docs/05-operations/local-development.md)
- [Deployment](docs/05-operations/deployment.md)

## Where to Find Things

| Looking for... | Location |
|----------------|----------|
| Database schema | `src/db/schema.ts` |
| API routes | `src/gateway/routes/` |
| Business logic | `src/core/` |
| App adapters (AI, channels, PMS) | `src/apps/` |
| Services (state management) | `src/services/` |
| Type definitions | `src/types/` |
| React dashboard | `apps/dashboard/src/` |
| Tests | `tests/` (mirrors src/ structure) |

### Key Entry Points
- **Message flow**: `src/core/message-processor.ts` → processes incoming guest messages
- **Task creation**: `src/core/task-router.ts` → creates tasks from intents
- **AI responses**: `src/ai/index.ts` → generates responses using configured provider
- **API server**: `src/gateway/index.ts` → Hono app with all routes
- **App registry**: `src/apps/registry.ts` → manages loaded app adapters

### Adding New Features
- **New API endpoint**: Add route file in `src/gateway/routes/`, register in `src/gateway/routes/api.ts`
- **New app/adapter**: Create manifest in `src/apps/{category}/`, follows `AppManifest` pattern
- **New service**: Add to `src/services/`, use singleton pattern with `getXxxService()`
- **New database table**: Add to `src/db/schema.ts`, run `pnpm db:generate && pnpm db:migrate`

## Before Writing Code

**IMPORTANT: Always check existing code before writing new code.**

1. **Find a similar example first** - Before creating a new service, route, adapter, or component, find an existing one in the codebase and use it as your template
2. **Don't invent patterns** - If something similar exists, follow that pattern exactly. Copy the structure, naming, and style
3. **Update the checklist** - If you find a good reference file not in the Pattern Reference Checklist below, add it
4. **Ask if no pattern exists** - If you can't find a similar example and need to create a new pattern, ask before implementing

### Pattern Reference Checklist

| Creating... | Look at this example first |
|-------------|---------------------------|
| New API route | `src/gateway/routes/tasks.ts` |
| New service | `src/services/task.ts` |
| New AI app | `src/apps/ai/providers/anthropic.ts` |
| New channel app | `src/apps/channels/sms/twilio.ts` |
| New PMS app | `src/apps/pms/mock.ts` |
| New tool app | `src/apps/tools/site-scraper/index.ts` |
| App manifest types | `src/apps/types.ts` |
| Core interface | `src/core/interfaces/channel.ts` |
| Core module | `src/core/task-router.ts` |
| Database table | `src/db/schema.ts` (all tables in one file) |
| Database setup | `src/db/index.ts` |
| WebSocket events | `src/gateway/websocket-bridge.ts` |
| Test file | `tests/services/guest.test.ts` |
| React hook | `apps/dashboard/src/hooks/useWebSocket.ts` |
| React component | `apps/dashboard/src/components/conversations/` |
| Dashboard feature module | `apps/dashboard/src/features/setup/` |
| Form schema | `apps/dashboard/src/features/setup/schemas.ts` |
| Protected public route | `src/gateway/routes/setup.ts` (no auth, blocked after completion) |

## When Implementing

1. **Read relevant use case first** - Understand the user story
2. **Match existing patterns exactly** - Don't improve or refactor while implementing
3. **Write tests** - Aim for 70%+ coverage
4. **Keep it simple** - SQLite is enough, no microservices
5. **Small commits** - One logical change per commit
6. **Use .js extensions** - All local imports must use `.js` (ESM requirement)
7. **Update docs if patterns changed** - If you change a pattern, update CLAUDE.md to match
