# Data Model

Entity relationships and database schema for Jack The Butler.

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    Property     │       │      Guest      │       │   Reservation   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │       │ id              │
│ name            │       │ property_id     │───┐   │ property_id     │
│ code            │       │ first_name      │   │   │ guest_id        │──┐
│ timezone        │       │ last_name       │   │   │ confirmation_no │  │
│ settings        │       │ email           │   │   │ room_number     │  │
└────────┬────────┘       │ phone           │   │   │ arrival_date    │  │
         │                │ language        │   │   │ departure_date  │  │
         │                │ loyalty_tier    │   │   │ status          │  │
         │                │ preferences     │   │   └─────────────────┘  │
         │                │ external_ids    │   │            │           │
         │                └────────┬────────┘   │            │           │
         │                         │            │            │           │
         │    ┌────────────────────┘            │            │           │
         │    │                                 │            │           │
         │    │    ┌────────────────────────────┘            │           │
         │    │    │                                         │           │
         ▼    ▼    ▼                                         ▼           │
┌─────────────────────────────────────────────────────────────────────┐ │
│                          Conversation                                │ │
├─────────────────────────────────────────────────────────────────────┤ │
│ id                                                                   │ │
│ property_id ─────────────────────────────────────────────────────────┘ │
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

## Core Entities

### Property

Represents a hotel property.

```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings JSONB structure:
-- {
--   "channels": { "whatsapp": true, "sms": true },
--   "features": { "proactiveMessaging": true },
--   "escalation": { "threshold": 0.7 },
--   "branding": { "name": "The Grand Hotel" }
-- }
```

### Guest

Guest profiles with preferences and history.

```sql
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),

  -- Identity
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),

  -- Profile
  language VARCHAR(10) DEFAULT 'en',
  loyalty_tier VARCHAR(50),
  vip_status VARCHAR(50),

  -- External references
  external_ids JSONB NOT NULL DEFAULT '{}',
  -- { "pms": "12345", "loyalty": "G98765" }

  -- Preferences (learned + stated)
  preferences JSONB NOT NULL DEFAULT '[]',
  -- [{ "category": "room", "key": "floor", "value": "high", "source": "stated" }]

  -- Stats
  stay_count INTEGER NOT NULL DEFAULT 0,
  total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  last_stay_date DATE,

  -- Metadata
  notes TEXT,
  tags VARCHAR(50)[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(property_id, email),
  UNIQUE(property_id, phone)
);

CREATE INDEX idx_guests_property ON guests(property_id);
CREATE INDEX idx_guests_email ON guests(property_id, email);
CREATE INDEX idx_guests_phone ON guests(property_id, phone);
CREATE INDEX idx_guests_external_ids ON guests USING GIN(external_ids);
```

### Reservation

Booking records synced from PMS.

```sql
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  guest_id UUID NOT NULL REFERENCES guests(id),

  -- Identity
  confirmation_number VARCHAR(50) NOT NULL,
  external_id VARCHAR(100),

  -- Stay details
  room_number VARCHAR(20),
  room_type VARCHAR(50) NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  -- confirmed, checked_in, checked_out, cancelled, no_show

  -- Timing
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  estimated_departure TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,

  -- Financial
  rate_code VARCHAR(50),
  total_rate DECIMAL(10, 2),
  balance DECIMAL(10, 2) DEFAULT 0,

  -- Additional
  special_requests TEXT[],
  notes JSONB NOT NULL DEFAULT '[]',

  -- Sync tracking
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(property_id, confirmation_number)
);

CREATE INDEX idx_reservations_property ON reservations(property_id);
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_reservations_dates ON reservations(property_id, arrival_date, departure_date);
CREATE INDEX idx_reservations_status ON reservations(property_id, status);
```

### Conversation

Guest communication threads.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  guest_id UUID REFERENCES guests(id),
  reservation_id UUID REFERENCES reservations(id),

  -- Channel
  channel_type VARCHAR(20) NOT NULL,
  -- whatsapp, sms, email, webchat
  channel_id VARCHAR(255) NOT NULL,
  -- Phone number, email address, or session ID

  -- State
  state VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active, escalated, resolved
  assigned_to UUID REFERENCES staff(id),

  -- Context
  current_intent VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Timing
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_property ON conversations(property_id);
CREATE INDEX idx_conversations_guest ON conversations(guest_id);
CREATE INDEX idx_conversations_channel ON conversations(property_id, channel_type, channel_id);
CREATE INDEX idx_conversations_state ON conversations(property_id, state);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to) WHERE assigned_to IS NOT NULL;
```

### Message

Individual messages within conversations.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),

  -- Direction
  direction VARCHAR(10) NOT NULL,
  -- inbound, outbound
  sender_type VARCHAR(20) NOT NULL,
  -- guest, ai, staff
  sender_id UUID,
  -- staff ID if sender_type = 'staff'

  -- Content
  content TEXT NOT NULL,
  content_type VARCHAR(20) NOT NULL DEFAULT 'text',
  -- text, media, location, interactive
  media JSONB,
  -- [{ "type": "image", "url": "...", "mimeType": "image/jpeg" }]

  -- AI metadata
  intent VARCHAR(100),
  confidence DECIMAL(3, 2),
  entities JSONB,

  -- Channel metadata
  channel_message_id VARCHAR(255),
  delivery_status VARCHAR(20) DEFAULT 'sent',
  -- sent, delivered, read, failed

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(conversation_id, created_at);
```

### Task

Service requests and work orders.

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  conversation_id UUID REFERENCES conversations(id),

  -- Type
  type VARCHAR(50) NOT NULL,
  -- housekeeping, maintenance, concierge, room_service
  department VARCHAR(50) NOT NULL,

  -- Details
  room_number VARCHAR(20),
  description TEXT NOT NULL,
  items JSONB,
  -- [{ "item": "towels", "quantity": 2 }]
  priority VARCHAR(20) NOT NULL DEFAULT 'standard',
  -- urgent, high, standard, low

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, assigned, in_progress, completed, cancelled
  assigned_to UUID REFERENCES staff(id),

  -- External reference
  external_id VARCHAR(100),
  external_system VARCHAR(50),

  -- Timing
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_property ON tasks(property_id);
CREATE INDEX idx_tasks_conversation ON tasks(conversation_id);
CREATE INDEX idx_tasks_status ON tasks(property_id, status);
CREATE INDEX idx_tasks_department ON tasks(property_id, department, status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
```

### Staff

Hotel staff users.

```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),

  -- Identity
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),

  -- Role
  role VARCHAR(50) NOT NULL,
  -- admin, manager, front_desk, concierge, housekeeping, maintenance
  department VARCHAR(50),
  permissions JSONB NOT NULL DEFAULT '[]',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active, inactive
  last_active_at TIMESTAMPTZ,

  -- Auth (if using local auth)
  password_hash VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(property_id, email)
);

CREATE INDEX idx_staff_property ON staff(property_id);
CREATE INDEX idx_staff_role ON staff(property_id, role);
```

---

## Supporting Entities

### Knowledge Base

Property-specific information for RAG.

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),

  -- Content
  category VARCHAR(50) NOT NULL,
  -- faq, policy, amenity, menu, local
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  keywords VARCHAR(100)[],

  -- Vector embedding (for semantic search)
  embedding vector(1536),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active, draft, archived

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_property ON knowledge_base(property_id);
CREATE INDEX idx_knowledge_category ON knowledge_base(property_id, category);
CREATE INDEX idx_knowledge_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Automation Rules

Configured automation triggers.

```sql
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),

  -- Identity
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Trigger
  trigger_type VARCHAR(50) NOT NULL,
  -- time_based, event_based, condition_based
  trigger_config JSONB NOT NULL,
  -- { "type": "pre_arrival", "offsetDays": -3 }

  -- Action
  action_type VARCHAR(50) NOT NULL,
  -- send_message, create_task, notify_staff
  action_config JSONB NOT NULL,
  -- { "template": "welcome", "channel": "whatsapp" }

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_property ON automation_rules(property_id);
CREATE INDEX idx_automation_enabled ON automation_rules(property_id, enabled);
```

### Audit Log

Track significant actions for compliance.

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),

  -- Actor
  actor_type VARCHAR(20) NOT NULL,
  -- staff, system, guest
  actor_id UUID,

  -- Action
  action VARCHAR(50) NOT NULL,
  -- guest.view, task.create, conversation.escalate
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,

  -- Details
  details JSONB,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_property ON audit_log(property_id);
CREATE INDEX idx_audit_created ON audit_log(property_id, created_at);
CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
```

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| guests | property_id, email | Guest lookup by email |
| guests | property_id, phone | Guest lookup by phone |
| guests | external_ids (GIN) | PMS ID lookup |
| reservations | property_id, arrival_date | Arrivals query |
| conversations | property_id, channel_type, channel_id | Message routing |
| conversations | property_id, state | Queue display |
| messages | conversation_id, created_at | History retrieval |
| tasks | property_id, department, status | Department queues |
| knowledge_base | embedding (ivfflat) | Semantic search |

---

## Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Messages | 2 years | Service history |
| Conversations | 2 years | Matches messages |
| Tasks | 1 year | Operational records |
| Guest profiles | Indefinite | CRM value |
| Audit logs | 7 years | Compliance |
| Analytics | 3 years | Trend analysis |

---

## Related

- [Architecture Overview](index.md)
- [Guest Memory Spec](../04-specs/features/guest-memory.md)
- [Privacy Policy](../01-vision/goals-and-non-goals.md#ng3-surveillance-or-tracking)
