# Project Structure Specification

This document defines the project structure, dependencies, and configuration for Jack The Butler.

---

## Directory Structure

```
jack/
├── apps/
│   ├── dashboard/               # Staff web dashboard (React)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── widget/                  # Guest web chat widget
│       ├── src/
│       │   ├── components/
│       │   ├── lib/
│       │   └── styles/
│       ├── package.json
│       ├── tsconfig.json
│       └── rollup.config.js
│
├── src/
│   ├── gateway/                 # Central HTTP/WebSocket server
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── websocket/
│   │   └── index.ts
│   │
│   ├── channels/                # Channel adapters
│   │   ├── whatsapp/
│   │   ├── sms/
│   │   ├── email/
│   │   ├── webchat/
│   │   └── base-adapter.ts
│   │
│   ├── ai/                      # AI engine
│   │   ├── providers/
│   │   ├── intent/
│   │   ├── skills/
│   │   ├── rag/
│   │   └── index.ts
│   │
│   ├── integrations/            # External integrations
│   │   ├── pms/
│   │   ├── pos/
│   │   └── index.ts
│   │
│   ├── services/                # Business logic
│   │   ├── conversation.ts
│   │   ├── guest.ts
│   │   ├── task.ts
│   │   ├── staff.ts
│   │   ├── notification.ts
│   │   └── knowledge.ts
│   │
│   ├── db/                      # Database layer
│   │   ├── schema.ts            # Drizzle schema
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── index.ts
│   │
│   ├── jobs/                    # Background jobs
│   │   ├── scheduler.ts
│   │   ├── handlers/
│   │   └── index.ts
│   │
│   ├── events/                  # Event bus
│   │   ├── types.ts
│   │   ├── emitter.ts
│   │   └── index.ts
│   │
│   ├── config/                  # Configuration
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   └── validation.ts
│   │
│   ├── utils/                   # Shared utilities
│   │   ├── ids.ts
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── dates.ts
│   │   └── crypto.ts
│   │
│   ├── types/                   # TypeScript types
│   │   ├── index.ts
│   │   ├── api.ts
│   │   ├── models.ts
│   │   └── events.ts
│   │
│   └── index.ts                 # Application entry
│
├── tests/
│   ├── unit/                    # Unit tests (mirrors src/)
│   ├── integration/             # Integration tests
│   ├── e2e/                     # End-to-end tests
│   ├── fixtures/                # Test data
│   └── setup.ts                 # Test configuration
│
├── config/
│   ├── default.yaml             # Default configuration
│   ├── development.yaml         # Development overrides
│   ├── production.yaml          # Production overrides
│   └── test.yaml                # Test configuration
│
├── knowledge/                   # Knowledge base content
│   ├── faqs/
│   ├── policies/
│   ├── menus/
│   ├── local/
│   └── templates/
│
├── data/                        # Runtime data (gitignored)
│   ├── jack.db                  # SQLite database
│   ├── uploads/                 # File uploads
│   └── logs/                    # Log files
│
├── scripts/                     # Utility scripts
│   ├── setup.ts
│   ├── seed.ts
│   └── migrate.ts
│
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── .prettierrc
├── oxlint.json
└── README.md
```

---

## Root package.json

```json
{
  "name": "jack-the-butler",
  "version": "0.1.0",
  "description": "AI-powered hospitality assistant",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:gateway": "tsx watch src/gateway/index.ts",
    "dev:dashboard": "pnpm --filter dashboard dev",
    "build": "tsc -p tsconfig.build.json",
    "build:all": "pnpm -r build",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "check": "pnpm lint && pnpm typecheck && pnpm test",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:migrate:create": "tsx scripts/migrate.ts create",
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "tsx scripts/migrate.ts reset",
    "db:studio": "drizzle-kit studio",
    "docker:build": "docker build -t jack-the-butler -f docker/Dockerfile .",
    "docker:run": "docker-compose -f docker/docker-compose.yml up",
    "docker:dev": "docker-compose -f docker/docker-compose.dev.yml up",
    "prepare": "husky"
  },
  "dependencies": {
    "@hono/node-server": "^1.12.0",
    "hono": "^4.5.0",
    "better-sqlite3": "^11.1.0",
    "drizzle-orm": "^0.32.0",
    "sqlite-vec": "^0.1.0",
    "@anthropic-ai/sdk": "^0.25.0",
    "openai": "^4.52.0",
    "nanoid": "^5.0.7",
    "zod": "^3.23.8",
    "pino": "^9.2.0",
    "pino-pretty": "^11.2.0",
    "lru-cache": "^10.4.0",
    "date-fns": "^3.6.0",
    "date-fns-tz": "^3.1.0",
    "handlebars": "^4.7.8",
    "mjml": "^4.15.0",
    "argon2": "^0.40.0",
    "jose": "^5.6.0",
    "yaml": "^2.4.0",
    "dotenv": "^16.4.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.10",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.10",
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "drizzle-kit": "^0.23.0",
    "oxlint": "^0.5.0",
    "prettier": "^3.3.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "oxlint --fix",
      "prettier --write"
    ],
    "*.{json,yaml,yml,md}": [
      "prettier --write"
    ]
  }
}
```

---

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
```

---

## TypeScript Configuration

### tsconfig.json (Base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/types/*": ["./src/types/*"]
    },
    "types": ["node"],
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false
  },
  "exclude": ["node_modules", "dist", "tests", "**/*.test.ts", "**/*.spec.ts"]
}
```

---

## Vitest Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## oxlint.json

```json
{
  "rules": {
    "no-unused-vars": "error",
    "no-console": "warn",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "error",
    "no-implicit-coercion": "error"
  },
  "ignorePatterns": [
    "node_modules",
    "dist",
    "coverage",
    "*.config.js",
    "*.config.ts"
  ]
}
```

---

## .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

## Environment Variables

### .env.example

```bash
# =============================================================================
# Jack The Butler - Environment Configuration
# =============================================================================

# Core
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_PATH=./data/jack.db

# Security
JWT_SECRET=change-this-to-a-secure-secret-at-least-64-characters-long
ENCRYPTION_KEY=change-this-to-32-bytes-key-here

# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OLLAMA_BASE_URL=http://localhost:11434

# WhatsApp (Meta Cloud API)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# Twilio (SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@hotel.com

# PMS Integration
PMS_API_URL=
PMS_API_KEY=
PMS_SYNC_INTERVAL=300

# Feature Flags
FEATURE_WEBCHAT=true
FEATURE_VOICE=false
```

---

## .gitignore

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/
.next/

# Data (runtime)
data/
*.db
*.db-journal
*.db-wal

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/
.nyc_output/

# IDE
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Misc
*.tgz
*.tar.gz
.cache/
tmp/
temp/
```

---

## Docker Configuration

### docker/Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/widget/package.json ./apps/widget/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build:all

# Production stage
FROM node:22-alpine AS production

RUN corepack enable pnpm

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/dashboard/dist ./apps/dashboard/dist
COPY --from=builder /app/apps/widget/dist ./apps/widget/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy runtime files
COPY config ./config
COPY knowledge ./knowledge

# Create data directory
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "dist/index.js"]
```

### docker/docker-compose.yml

```yaml
version: '3.8'

services:
  jack:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - jack-data:/app/data
      - ./knowledge:/app/knowledge:ro
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/jack.db
    env_file:
      - ../.env
    restart: unless-stopped

volumes:
  jack-data:
```

---

## GitHub Actions

### .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:all
```

---

## Related

- [Tech Stack](../03-architecture/tech-stack.md) - Technology choices
- [Local Development](../05-operations/local-development.md) - Development setup
- [Deployment](../05-operations/deployment.md) - Production deployment
