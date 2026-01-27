# Data Model

Entity relationships and database schema for Jack The Butler.

**Database:** SQLite with better-sqlite3 and sqlite-vec extension

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│      Guest      │       │   Reservation   │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ first_name      │       │ guest_id        │──┐
│ last_name       │       │ confirmation_no │  │
│ email           │       │ room_number     │  │
│ phone           │       │ arrival_date    │  │
│ language        │       │ departure_date  │  │
│ loyalty_tier    │       │ status          │  │
│ preferences     │       └─────────────────┘  │
│ external_ids    │                │           │
└────────┬────────┘                │           │
         │                         │           │
         │    ┌────────────────────┘           │
         │    │                                │
         ▼    ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Conversation                                │
├─────────────────────────────────────────────────────────────────────┤
│ id                                                                   │
│ guest_id ────────────────────────────────────────────────────────────┘
│ reservation_id ──────────────────────────────────────────────────────┘
│ channel_type
│ channel_id
│ state (active, escalated, resolved)
│ assigned_to
│ created_at
│ updated_at
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
          ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
          │   Message   │  │    Task     │  │   Event     │
          ├─────────────┤  ├─────────────┤  ├─────────────┤
          │ id          │  │ id          │  │ id          │
          │ convo_id    │  │ convo_id    │  │ convo_id    │
          │ direction   │  │ type        │  │ type        │
          │ content     │  │ status      │  │ payload     │
          │ sender_type │  │ department  │  │ created_at  │
          │ intent      │  │ assigned_to │  └─────────────┘
          │ confidence  │  │ created_at  │
          │ created_at  │  │ completed_at│
          └─────────────┘  └─────────────┘
```

---

## SQLite Configuration

Jack uses SQLite with WAL mode for concurrent access:

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database('data/jack.db');

// Enable WAL mode for concurrent reads during writes
db.pragma('journal_mode = WAL');

// Wait up to 5 seconds for locks
db.pragma('busy_timeout = 5000');

// Balance between safety and performance
db.pragma('synchronous = NORMAL');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Load sqlite-vec for vector search
sqliteVec.load(db);
```

---

## Core Entities

### Settings

Global configuration for the hotel.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Example settings:
-- key: 'hotel.name', value: 'The Grand Hotel'
-- key: 'hotel.timezone', value: 'America/New_York'
-- key: 'channels.whatsapp.enabled', value: 'true'
-- key: 'escalation.threshold', value: '0.7'
```

### Guest

Guest profiles with preferences and history.

```sql
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,  -- UUID generated in application

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Profile
  language TEXT DEFAULT 'en',
  loyalty_tier TEXT,
  vip_status TEXT,

  -- External references (JSON object)
  -- { "pms": "12345", "loyalty": "G98765" }
  external_ids TEXT NOT NULL DEFAULT '{}',

  -- Preferences (JSON array)
  -- [{ "category": "room", "key": "floor", "value": "high", "source": "stated", "confidence": 1.0 }]
  preferences TEXT NOT NULL DEFAULT '[]',

  -- Stats
  stay_count INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0,
  last_stay_date TEXT,

  -- Metadata
  notes TEXT,
  -- Tags stored as JSON array: ["vip", "business"]
  tags TEXT DEFAULT '[]',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_email ON guests(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_phone ON guests(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(last_name, first_name);
```

### Reservation

Booking records synced from PMS.

```sql
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL REFERENCES guests(id),

  -- Identity
  confirmation_number TEXT NOT NULL UNIQUE,
  external_id TEXT,

  -- Stay details
  room_number TEXT,
  room_type TEXT NOT NULL,
  arrival_date TEXT NOT NULL,  -- YYYY-MM-DD
  departure_date TEXT NOT NULL,  -- YYYY-MM-DD

  -- Status: confirmed, checked_in, checked_out, cancelled, no_show
  status TEXT NOT NULL DEFAULT 'confirmed',

  -- Timing (ISO 8601 datetime strings)
  estimated_arrival TEXT,
  actual_arrival TEXT,
  estimated_departure TEXT,
  actual_departure TEXT,

  -- Financial
  rate_code TEXT,
  total_rate REAL,
  balance REAL DEFAULT 0,

  -- Additional (JSON arrays)
  special_requests TEXT DEFAULT '[]',
  notes TEXT DEFAULT '[]',

  -- Sync tracking
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_number) WHERE room_number IS NOT NULL;
```

### Conversation

Guest communication threads.

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  guest_id TEXT REFERENCES guests(id),
  reservation_id TEXT REFERENCES reservations(id),

  -- Channel: whatsapp, sms, email, webchat
  channel_type TEXT NOT NULL,
  -- Phone number, email address, or session ID
  channel_id TEXT NOT NULL,

  -- State: new, active, escalated, resolved, abandoned
  state TEXT NOT NULL DEFAULT 'active',
  assigned_to TEXT REFERENCES staff(id),

  -- Context
  current_intent TEXT,
  -- Metadata as JSON object
  metadata TEXT NOT NULL DEFAULT '{}',

  -- Timing
  last_message_at TEXT,
  resolved_at TEXT,

  -- Timeout tracking
  idle_warned_at TEXT,  -- When we sent "are you still there?" message

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_guest ON conversations(guest_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_state ON conversations(state);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to) WHERE assigned_to IS NOT NULL;
```

### Message

Individual messages within conversations.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),

  -- Direction: inbound, outbound
  direction TEXT NOT NULL,
  -- Sender: guest, ai, staff, system
  sender_type TEXT NOT NULL,
  sender_id TEXT,  -- staff ID if sender_type = 'staff'

  -- Content
  content TEXT NOT NULL,
  -- Content type: text, image, audio, video, document, location, interactive
  content_type TEXT NOT NULL DEFAULT 'text',
  -- Media as JSON array: [{ "type": "image", "url": "...", "mime_type": "image/jpeg" }]
  media TEXT,

  -- AI metadata
  intent TEXT,
  confidence REAL,
  -- Entities as JSON: [{ "type": "quantity", "value": 2 }]
  entities TEXT,

  -- Channel metadata
  channel_message_id TEXT,
  -- Delivery status: pending, sent, delivered, read, failed
  delivery_status TEXT DEFAULT 'sent',
  delivery_error TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_message_id) WHERE channel_message_id IS NOT NULL;
```

### Task

Service requests and work orders.

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),

  -- Type: housekeeping, maintenance, concierge, room_service, other
  type TEXT NOT NULL,
  department TEXT NOT NULL,

  -- Details
  room_number TEXT,
  description TEXT NOT NULL,
  -- Items as JSON: [{ "item": "towels", "quantity": 2 }]
  items TEXT,
  -- Priority: urgent, high, standard, low
  priority TEXT NOT NULL DEFAULT 'standard',

  -- Status: pending, assigned, in_progress, completed, cancelled
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT REFERENCES staff(id),

  -- External reference (if synced to housekeeping system)
  external_id TEXT,
  external_system TEXT,

  -- Timing
  due_at TEXT,
  started_at TEXT,
  completed_at TEXT,

  -- Notes
  notes TEXT,
  -- Completion notes from staff
  completion_notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_room ON tasks(room_number) WHERE room_number IS NOT NULL;
```

### Staff

Hotel staff users.

```sql
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,

  -- Identity
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,

  -- Role: admin, manager, front_desk, concierge, housekeeping, maintenance
  role TEXT NOT NULL,
  department TEXT,

  -- Permissions as JSON array (see Permission Model section below)
  permissions TEXT NOT NULL DEFAULT '[]',

  -- Status: active, inactive
  status TEXT NOT NULL DEFAULT 'active',
  last_active_at TEXT,

  -- Auth (bcrypt hash)
  password_hash TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department) WHERE department IS NOT NULL;
```

---

## Permission Model

Staff permissions are stored as a JSON array of permission strings. Permissions follow a resource.action pattern.

### Available Permissions

```typescript
type Permission =
  // Guest permissions
  | 'guest.view'           // View guest profiles
  | 'guest.view_contact'   // View email/phone (PII)
  | 'guest.view_financial' // View revenue, balance
  | 'guest.edit'           // Edit guest notes/tags
  | 'guest.delete'         // Delete guest (GDPR)

  // Conversation permissions
  | 'conversation.view'    // View conversation queue
  | 'conversation.respond' // Send messages to guests
  | 'conversation.assign'  // Assign conversations to others
  | 'conversation.escalate'// Escalate to manager

  // Task permissions
  | 'task.view'            // View task queue
  | 'task.create'          // Create tasks manually
  | 'task.assign'          // Assign tasks to others
  | 'task.complete'        // Mark tasks complete

  // Staff permissions
  | 'staff.view'           // View staff list
  | 'staff.manage'         // Create/edit staff

  // Settings permissions
  | 'settings.view'        // View configuration
  | 'settings.edit'        // Edit configuration

  // Analytics permissions
  | 'analytics.view'       // View dashboards
  | 'analytics.export';    // Export data
```

### Default Role Permissions

```typescript
const rolePermissions: Record<string, Permission[]> = {
  admin: ['*'],  // All permissions

  manager: [
    'guest.view', 'guest.view_contact', 'guest.view_financial', 'guest.edit',
    'conversation.view', 'conversation.respond', 'conversation.assign', 'conversation.escalate',
    'task.view', 'task.create', 'task.assign', 'task.complete',
    'staff.view',
    'analytics.view', 'analytics.export'
  ],

  front_desk: [
    'guest.view', 'guest.view_contact', 'guest.edit',
    'conversation.view', 'conversation.respond', 'conversation.escalate',
    'task.view', 'task.create',
    'analytics.view'
  ],

  concierge: [
    'guest.view', 'guest.view_contact',
    'conversation.view', 'conversation.respond',
    'task.view', 'task.create', 'task.complete'
  ],

  housekeeping: [
    'task.view', 'task.complete'
  ],

  maintenance: [
    'task.view', 'task.complete'
  ]
};
```

### Permission Check Example

```typescript
function hasPermission(staff: Staff, permission: Permission): boolean {
  const permissions = JSON.parse(staff.permissions) as Permission[];

  // Admin wildcard
  if (permissions.includes('*')) return true;

  // Direct permission
  if (permissions.includes(permission)) return true;

  // Role-based fallback
  const rolePerms = rolePermissions[staff.role] || [];
  return rolePerms.includes(permission);
}
```

---

## Supporting Entities

### Knowledge Base

Property-specific information for RAG.

```sql
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,

  -- Category: faq, policy, amenity, menu, local, service
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  -- Keywords as JSON array for fallback search
  keywords TEXT DEFAULT '[]',

  -- Status: active, draft, archived
  status TEXT NOT NULL DEFAULT 'active',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_base(status);

-- Full-text search for keyword fallback
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title,
  content,
  content='knowledge_base',
  content_rowid='rowid'
);
```

### Knowledge Embeddings (sqlite-vec)

Vector embeddings for semantic search, stored in a virtual table.

```sql
-- Create sqlite-vec virtual table for embeddings
-- Dimension is configurable based on embedding model
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[1536]  -- OpenAI text-embedding-3-small
);

-- For other embedding models, dimensions vary:
-- - OpenAI text-embedding-3-small: 1536
-- - OpenAI text-embedding-3-large: 3072
-- - Ollama nomic-embed-text: 768
-- - Ollama mxbai-embed-large: 1024
```

**Embedding Dimension Strategy:**

When switching embedding providers, embeddings must be regenerated. The system stores the current embedding model in settings:

```sql
-- Track current embedding configuration
INSERT INTO settings (key, value) VALUES
  ('embeddings.model', 'text-embedding-3-small'),
  ('embeddings.dimensions', '1536');
```

### Automation Rules

Configured automation triggers.

```sql
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,

  -- Identity
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger type: time_based, event_based, condition_based
  trigger_type TEXT NOT NULL,
  -- Trigger config as JSON
  -- { "type": "pre_arrival", "offset_days": -3, "time": "10:00" }
  trigger_config TEXT NOT NULL,

  -- Action type: send_message, create_task, notify_staff
  action_type TEXT NOT NULL,
  -- Action config as JSON
  -- { "template": "welcome", "channel": "whatsapp" }
  action_config TEXT NOT NULL,

  -- Status
  enabled INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_enabled ON automation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_automation_trigger ON automation_rules(trigger_type);
```

### Audit Log

Track significant actions for compliance.

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,

  -- Actor type: staff, system, guest
  actor_type TEXT NOT NULL,
  actor_id TEXT,

  -- Action (see Audit Actions below)
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,

  -- Details as JSON
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
```

### Audit Actions

The following actions are logged:

| Action | Resource | When Logged |
|--------|----------|-------------|
| `guest.view` | guest | Staff views guest profile (once per session, not per field) |
| `guest.edit` | guest | Staff edits guest info |
| `guest.delete` | guest | Guest data deleted (GDPR) |
| `conversation.escalate` | conversation | AI or staff escalates |
| `conversation.assign` | conversation | Conversation assigned to staff |
| `conversation.resolve` | conversation | Conversation marked resolved |
| `task.create` | task | Task created (AI or manual) |
| `task.complete` | task | Task marked complete |
| `staff.login` | staff | Staff logs in |
| `staff.create` | staff | New staff created |
| `settings.change` | settings | Configuration changed |
| `data.export` | - | Data exported |

**Note:** LLM API calls are NOT individually logged to audit_log (too high volume). Instead, aggregate token usage is tracked in a separate metrics table or external monitoring.

### Retention Policy

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Messages | 2 years | Service history |
| Conversations | 2 years | Matches messages |
| Tasks | 1 year | Operational records |
| Guest profiles | Indefinite | CRM value (unless GDPR deletion) |
| Audit logs | 7 years | Compliance |
| Knowledge embeddings | Indefinite | Regenerated on model change |

---

## Migrations

Migrations are managed with Drizzle Kit. Example migration file:

```typescript
// drizzle/0001_initial.sql
-- Generated by Drizzle Kit

CREATE TABLE IF NOT EXISTS guests (
  -- ... schema as above
);

-- ... other tables
```

Run migrations:

```bash
pnpm db:migrate      # Apply pending migrations
pnpm db:generate     # Generate migration from schema changes
pnpm db:studio       # Open Drizzle Studio for debugging
```

---

## Type Definitions (Drizzle ORM)

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  language: text('language').default('en'),
  loyaltyTier: text('loyalty_tier'),
  vipStatus: text('vip_status'),
  externalIds: text('external_ids').notNull().default('{}'),
  preferences: text('preferences').notNull().default('[]'),
  stayCount: integer('stay_count').notNull().default(0),
  totalRevenue: real('total_revenue').notNull().default(0),
  lastStayDate: text('last_stay_date'),
  notes: text('notes'),
  tags: text('tags').default('[]'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
});

// ... similar for other tables
```

---

## Related

- [Architecture Overview](index.md)
- [Tech Stack](tech-stack.md) - SQLite and sqlite-vec details
- [Guest Memory Spec](../04-specs/features/guest-memory.md)
- [Privacy Policy](../01-vision/goals-and-non-goals.md#ng3-surveillance-or-tracking)
