# Phase 1: Foundation

**Version:** 0.2.0
**Codename:** Foundation
**Goal:** Database, configuration, and logging working

---

## Overview

Phase 1 establishes the data layer and core utilities. After this phase:

1. SQLite database initializes on startup
2. Drizzle ORM is configured with schema
3. Configuration loads from environment
4. Structured logging works
5. First tests pass

---

## Prerequisites

- Phase 0 complete (project builds and runs)

---

## Deliverables

### 0.2.0-alpha.1: Configuration System

**Files to create:**

```
src/config/
├── index.ts                  # Config loader and types
├── schema.ts                 # Zod validation schema
└── defaults.ts               # Default values
```

**Key implementation:**

```typescript
// src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  database: z.object({
    path: z.string().default('./data/jack.db'),
  }),
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    database: {
      path: process.env.DATABASE_PATH,
    },
    log: {
      level: process.env.LOG_LEVEL,
    },
  });
}
```

**Acceptance criteria:**
- [ ] Config loads from environment variables
- [ ] Missing required vars throw clear errors
- [ ] Defaults work for optional vars
- [ ] Config is typed (TypeScript knows shape)

---

### 0.2.0-alpha.2: Logging System

**Files to create:**

```
src/utils/
├── logger.ts                 # Pino logger setup
└── index.ts                  # Re-export utilities
```

**Key implementation:**

```typescript
// src/utils/logger.ts
import pino from 'pino';
import { loadConfig } from '@/config';

const config = loadConfig();

export const logger = pino({
  level: config.log.level,
  transport: config.env === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

// Child loggers for components
export const createLogger = (component: string) =>
  logger.child({ component });
```

**Acceptance criteria:**
- [ ] `logger.info('message')` outputs JSON in production
- [ ] Pretty output in development
- [ ] Child loggers include component name
- [ ] Log level controlled by config

---

### 0.2.0-alpha.3: Database Setup

**Files to create:**

```
src/db/
├── index.ts                  # Database connection
├── schema.ts                 # Drizzle schema definitions
├── migrate.ts                # Migration runner
└── seed.ts                   # Development seed data
drizzle/
├── 0000_initial.sql          # First migration
└── meta/                     # Drizzle meta files
drizzle.config.ts             # Drizzle Kit config
```

**Database initialization:**

```typescript
// src/db/index.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { loadConfig } from '@/config';
import { createLogger } from '@/utils/logger';

const log = createLogger('db');
const config = loadConfig();

// Ensure data directory exists
import { mkdirSync } from 'fs';
import { dirname } from 'path';
mkdirSync(dirname(config.database.path), { recursive: true });

// Create SQLite connection
const sqlite = new Database(config.database.path);

// Configure for performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

log.info({ path: config.database.path }, 'Database connected');

export const db = drizzle(sqlite, { schema });
export { sqlite };
```

**Initial schema (settings table only):**

```typescript
// src/db/schema.ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
```

**Acceptance criteria:**
- [ ] Database file created in data/ folder
- [ ] WAL mode enabled (journal_mode = WAL)
- [ ] Settings table exists
- [ ] Can insert/query settings
- [ ] Migrations run on startup

---

### 0.2.0-alpha.4: Core Schema

**Add core tables to schema.ts (7 tables):**

```typescript
// Core tables for Phase 1:
export const settings = sqliteTable('settings', { /* ... */ });
export const guests = sqliteTable('guests', { /* ... */ });
export const reservations = sqliteTable('reservations', { /* ... */ });
export const conversations = sqliteTable('conversations', { /* ... */ });
export const messages = sqliteTable('messages', { /* ... */ });
export const tasks = sqliteTable('tasks', { /* ... */ });
export const staff = sqliteTable('staff', { /* ... */ });
```

Refer to [Data Model](../03-architecture/data-model.md) for complete schema.

**Note:** Supporting tables added in later phases:
- `knowledge_base`, `knowledge_embeddings` → Phase 4 (Intelligence)
- `automation_rules` → Phase 8 (Automation)
- `audit_log` → Phase 9 (Security)

**Acceptance criteria:**
- [ ] All core tables defined in schema.ts
- [ ] Migration generated with `pnpm db:generate`
- [ ] Migration applies with `pnpm db:migrate`
- [ ] Foreign keys work correctly

---

### 0.2.0-alpha.5: First Tests

**Files to create:**

```
tests/
├── setup.ts                  # Test setup (in-memory DB)
├── db/
│   └── schema.test.ts        # Schema tests
└── config/
    └── config.test.ts        # Config tests
```

**Test setup with in-memory database:**

```typescript
// tests/setup.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  // Run migrations
  migrate(db, { migrationsFolder: './drizzle' });

  return { db, sqlite };
}
```

**Example test:**

```typescript
// tests/db/schema.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('Database Schema', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
  });

  it('should insert and query settings', async () => {
    await db.insert(settings).values({
      key: 'hotel.name',
      value: 'Test Hotel',
    });

    const result = await db.select()
      .from(settings)
      .where(eq(settings.key, 'hotel.name'));

    expect(result[0].value).toBe('Test Hotel');
  });
});
```

**Acceptance criteria:**
- [ ] `pnpm test` runs without errors
- [ ] Tests use in-memory SQLite
- [ ] At least 3 tests pass
- [ ] Coverage report generates

---

## Testing Checkpoint

### Manual Tests

```bash
# Test 1: Config loading
NODE_ENV=production PORT=4000 pnpm dev
# Expected: Uses port 4000, production logging

# Test 2: Database creation
rm -rf data/
pnpm dev
# Expected: Creates data/jack.db

# Test 3: Migrations
pnpm db:migrate
# Expected: Tables created

# Test 4: Database inspection
pnpm db:studio
# Expected: Opens Drizzle Studio, shows tables
```

### Automated Tests

```bash
pnpm test
# Expected: All tests pass, coverage >= 50%
```

---

## Exit Criteria

Phase 1 is complete when:

1. **Configuration loads** from environment with validation
2. **Logging works** with structured JSON output
3. **Database initializes** on startup with WAL mode
4. **All core tables** are defined and migrated
5. **Tests pass** with in-memory database

---

## Dependencies

**Add to package.json:**

```json
{
  "dependencies": {
    "better-sqlite3": "^11.6.0",
    "drizzle-orm": "^0.38.0",
    "pino": "^9.5.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "@types/better-sqlite3": "^7.6.0",
    "pino-pretty": "^13.0.0"
  }
}
```

---

## Next Phase

After Phase 1, proceed to [Phase 2: Gateway](phase-2-gateway.md) to add HTTP and WebSocket server.

---

## Checklist for Claude Code

```markdown
## Phase 1 Implementation Checklist

### 0.2.0-alpha.1: Configuration
- [ ] Install zod
- [ ] Create src/config/index.ts with schema
- [ ] Create src/config/schema.ts
- [ ] Create src/config/defaults.ts
- [ ] Add DATABASE_PATH to .env.example
- [ ] Add LOG_LEVEL to .env.example
- [ ] Verify: Config loads and validates

### 0.2.0-alpha.2: Logging
- [ ] Install pino, pino-pretty
- [ ] Create src/utils/logger.ts
- [ ] Update src/utils/index.ts exports
- [ ] Use logger in src/index.ts
- [ ] Verify: Pretty logs in dev mode
- [ ] Verify: JSON logs in production

### 0.2.0-alpha.3: Database Setup
- [ ] Install better-sqlite3, drizzle-orm, drizzle-kit
- [ ] Create drizzle.config.ts
- [ ] Create src/db/index.ts (connection)
- [ ] Create src/db/schema.ts (settings table)
- [ ] Run: pnpm db:generate
- [ ] Run: pnpm db:migrate
- [ ] Verify: Database file created
- [ ] Verify: WAL mode enabled

### 0.2.0-alpha.4: Core Schema
- [ ] Add guests table to schema
- [ ] Add reservations table to schema
- [ ] Add conversations table to schema
- [ ] Add messages table to schema
- [ ] Add tasks table to schema
- [ ] Add staff table to schema
- [ ] Generate migration
- [ ] Apply migration
- [ ] Verify: All tables exist

### 0.2.0-alpha.5: Tests
- [ ] Create tests/setup.ts
- [ ] Create tests/db/schema.test.ts
- [ ] Create tests/config/config.test.ts
- [ ] Verify: pnpm test passes
- [ ] Verify: Coverage >= 50%

### Phase 1 Complete
- [ ] All checks above pass
- [ ] Commit: "Phase 1: Foundation complete"
- [ ] Tag: v0.2.0
```
