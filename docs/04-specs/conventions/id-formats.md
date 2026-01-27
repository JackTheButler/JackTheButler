# ID Format Specification

This document defines the standard format for all identifiers used in Jack The Butler.

---

## Overview

Jack uses prefixed identifiers to make IDs self-documenting and prevent cross-entity confusion. All internal IDs follow a consistent format while external IDs from third-party systems are stored separately.

---

## ID Format

### Standard Format

```
{prefix}_{unique_id}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `prefix` | 2-5 lowercase letters identifying entity type | `msg`, `conv`, `guest` |
| `_` | Underscore separator (always underscore, never hyphen) | `_` |
| `unique_id` | NanoID or ULID, 21 characters | `V1StGXR8_Z5jdHi6B-myT` |

### Examples

```
msg_V1StGXR8_Z5jdHi6B-myT     # Message
conv_01ARZ3NDEKTSV4RRFFQ69G5F  # Conversation
guest_xYz123AbC456dEf789gHi   # Guest
task_9KpXwQrS2mNvLjHgFdCb3    # Task
```

### ID Generation

```typescript
import { nanoid } from 'nanoid';

/**
 * Generate a prefixed ID for any entity type.
 */
export function generateId(prefix: EntityPrefix): string {
  return `${prefix}_${nanoid(21)}`;
}

// Usage
const messageId = generateId('msg');     // msg_V1StGXR8_Z5jdHi6B-myT
const guestId = generateId('guest');     // guest_xYz123AbC456dEf789gHi
```

### ID Validation

```typescript
/**
 * Validate that an ID matches the expected format for its entity type.
 */
export function isValidId(id: string, prefix?: EntityPrefix): boolean {
  // General format: prefix_uniqueid (prefix is 2-5 chars, uniqueid is 21 chars)
  const regex = /^[a-z]{2,5}_[A-Za-z0-9_-]{21}$/;

  if (!regex.test(id)) {
    return false;
  }

  if (prefix) {
    return id.startsWith(`${prefix}_`);
  }

  return true;
}

/**
 * Extract the prefix from an ID.
 */
export function getIdPrefix(id: string): string | null {
  const match = id.match(/^([a-z]{2,5})_/);
  return match ? match[1] : null;
}

/**
 * Extract the entity type from an ID prefix.
 */
export function getEntityType(id: string): EntityType | null {
  const prefix = getIdPrefix(id);
  return prefix ? PREFIX_TO_ENTITY[prefix] ?? null : null;
}
```

---

## Entity Prefixes

### Complete Prefix Registry

| Entity | Prefix | Example | Notes |
|--------|--------|---------|-------|
| **Core Entities** |
| Guest | `guest` | `guest_V1StGXR8_Z5jdHi6B` | Hotel guest/customer |
| Conversation | `conv` | `conv_01ARZ3NDEKTSV4RRFFQ` | Chat thread |
| Message | `msg` | `msg_xYz123AbC456dEf789g` | Single message |
| Staff | `staff` | `staff_9KpXwQrS2mNvLjHgFd` | Hotel employee |
| Task | `task` | `task_AbC123dEf456gHi789j` | Work item |
| **Reservations** |
| Reservation | `res` | `res_mNvLjHgFdCb3xYz123A` | Booking/stay |
| **Knowledge** |
| Knowledge Entry | `kb` | `kb_dEf789gHiJkL012mNo3` | Knowledge base item |
| Knowledge Version | `kv` | `kv_pQrStUvWxYz012345Ab` | Version history |
| Learned Knowledge | `lk` | `lk_CdEfGhIjKlMnOpQrStU` | AI-learned entry |
| **Jobs & Events** |
| Scheduled Job | `job` | `job_vWxYz0123456AbCdEfG` | Background job |
| Event | `evt` | `evt_hIjKlMnOpQrStUvWxYz` | System event |
| Notification | `notif` | `notif_01234AbCdEfGhIjKlM` | Scheduled notification |
| **Sessions & Auth** |
| Session | `sess` | `sess_nOpQrStUvWxYz01234A` | User session |
| API Key | `ak` | `ak_bCdEfGhIjKlMnOpQrStU` | API authentication |
| **Audit & Logs** |
| Audit Log | `audit` | `audit_vWxYz0123456AbCdEf` | Audit trail entry |
| Dead Letter | `dlq` | `dlq_GhIjKlMnOpQrStUvWxY` | Failed job/event |
| **Integrations** |
| Webhook | `wh` | `wh_z0123456AbCdEfGhIjK` | Webhook endpoint |
| Sync | `sync` | `sync_lMnOpQrStUvWxYz012` | PMS sync operation |
| **Embeddings** |
| Embedding Job | `emb` | `emb_34AbCdEfGhIjKlMnOpQ` | Embedding generation |
| Rebuild Job | `rbld` | `rbld_rStUvWxYz0123456AbC` | Index rebuild |
| **Other** |
| Attachment | `att` | `att_dEfGhIjKlMnOpQrStUv` | File attachment |
| Template | `tmpl` | `tmpl_WxYz0123456AbCdEfGh` | Message template |

### TypeScript Definitions

```typescript
/**
 * All valid entity prefixes.
 */
export type EntityPrefix =
  // Core
  | 'guest'
  | 'conv'
  | 'msg'
  | 'staff'
  | 'task'
  // Reservations
  | 'res'
  // Knowledge
  | 'kb'
  | 'kv'
  | 'lk'
  // Jobs & Events
  | 'job'
  | 'evt'
  | 'notif'
  // Sessions & Auth
  | 'sess'
  | 'ak'
  // Audit & Logs
  | 'audit'
  | 'dlq'
  // Integrations
  | 'wh'
  | 'sync'
  // Embeddings
  | 'emb'
  | 'rbld'
  // Other
  | 'att'
  | 'tmpl';

/**
 * Entity types corresponding to prefixes.
 */
export type EntityType =
  | 'guest'
  | 'conversation'
  | 'message'
  | 'staff'
  | 'task'
  | 'reservation'
  | 'knowledge'
  | 'knowledgeVersion'
  | 'learnedKnowledge'
  | 'job'
  | 'event'
  | 'notification'
  | 'session'
  | 'apiKey'
  | 'auditLog'
  | 'deadLetter'
  | 'webhook'
  | 'sync'
  | 'embedding'
  | 'rebuild'
  | 'attachment'
  | 'template';

/**
 * Mapping from prefix to entity type.
 */
export const PREFIX_TO_ENTITY: Record<EntityPrefix, EntityType> = {
  guest: 'guest',
  conv: 'conversation',
  msg: 'message',
  staff: 'staff',
  task: 'task',
  res: 'reservation',
  kb: 'knowledge',
  kv: 'knowledgeVersion',
  lk: 'learnedKnowledge',
  job: 'job',
  evt: 'event',
  notif: 'notification',
  sess: 'session',
  ak: 'apiKey',
  audit: 'auditLog',
  dlq: 'deadLetter',
  wh: 'webhook',
  sync: 'sync',
  emb: 'embedding',
  rbld: 'rebuild',
  att: 'attachment',
  tmpl: 'template',
};

/**
 * Mapping from entity type to prefix.
 */
export const ENTITY_TO_PREFIX: Record<EntityType, EntityPrefix> = {
  guest: 'guest',
  conversation: 'conv',
  message: 'msg',
  staff: 'staff',
  task: 'task',
  reservation: 'res',
  knowledge: 'kb',
  knowledgeVersion: 'kv',
  learnedKnowledge: 'lk',
  job: 'job',
  event: 'evt',
  notification: 'notif',
  session: 'sess',
  apiKey: 'ak',
  auditLog: 'audit',
  deadLetter: 'dlq',
  webhook: 'wh',
  sync: 'sync',
  embedding: 'emb',
  rebuild: 'rbld',
  attachment: 'att',
  template: 'tmpl',
};
```

---

## External IDs

External IDs from third-party systems are **not modified**. They are stored in separate fields.

### External ID Storage Pattern

```typescript
interface EntityWithExternalId {
  id: string;                          // Internal ID: guest_xxx
  externalIds: Record<string, string>; // External IDs by source
}

// Example: Guest with IDs from multiple systems
const guest = {
  id: 'guest_V1StGXR8_Z5jdHi6B-myT',
  externalIds: {
    pms: 'G-12345',                     // Property Management System
    loyalty: 'MEM-987654',              // Loyalty program
    whatsapp: '+14155551234',           // WhatsApp identifier
  }
};
```

### External ID Sources

| Source | Format | Example | Notes |
|--------|--------|---------|-------|
| **Messaging Channels** |
| WhatsApp | `wamid.{id}` | `wamid.HBgLMTU1NTU1MTIzNDU` | WhatsApp message ID |
| WhatsApp (phone) | E.164 | `+14155551234` | Guest phone number |
| Twilio SMS | `SM{32chars}` | `SM1234567890abcdef1234567890abcd` | Twilio message SID |
| Twilio (phone) | E.164 | `+14155551234` | Guest phone number |
| Email | Email address | `guest@example.com` | Guest email |
| **PMS Systems** |
| Opera | Varies | `12345`, `RES-2024-001` | Property-specific |
| Mews | UUID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | GUID format |
| Cloudbeds | Numeric | `987654` | Integer IDs |
| **Other** |
| Stripe | `{type}_{id}` | `cus_NffrFeUfNV2Hib` | Stripe customer |
| Property Code | Custom | `HOTEL01`, `NYC-GRAND` | Hotel identifier |

### Handling External IDs

```typescript
/**
 * Store an external ID for an entity.
 */
async function setExternalId(
  entityType: EntityType,
  internalId: string,
  source: string,
  externalId: string
): Promise<void> {
  // Validate internal ID format
  const prefix = ENTITY_TO_PREFIX[entityType];
  if (!isValidId(internalId, prefix)) {
    throw new Error(`Invalid ${entityType} ID: ${internalId}`);
  }

  // Store in externalIds JSON field
  await db.prepare(`
    UPDATE ${getTableName(entityType)}
    SET external_ids = json_set(
      COALESCE(external_ids, '{}'),
      '$.' || ?,
      ?
    )
    WHERE id = ?
  `).run(source, externalId, internalId);
}

/**
 * Look up entity by external ID.
 */
async function findByExternalId(
  entityType: EntityType,
  source: string,
  externalId: string
): Promise<string | null> {
  const table = getTableName(entityType);
  const result = await db.prepare(`
    SELECT id FROM ${table}
    WHERE json_extract(external_ids, '$.' || ?) = ?
  `).get(source, externalId);

  return result?.id ?? null;
}
```

---

## ID Usage by Context

### API Responses

Always return internal IDs in API responses:

```json
{
  "id": "guest_V1StGXR8_Z5jdHi6B-myT",
  "name": "John Smith",
  "email": "john@example.com",
  "externalIds": {
    "pms": "G-12345",
    "loyalty": "MEM-987654"
  }
}
```

### API Requests

Accept both internal and external IDs where appropriate:

```typescript
// Lookup by internal ID (preferred)
GET /api/v1/guests/guest_V1StGXR8_Z5jdHi6B-myT

// Lookup by external ID (when needed)
GET /api/v1/guests?externalId=pms:G-12345
```

### Database Storage

```sql
-- All primary keys use internal IDs
CREATE TABLE guests (
  id TEXT PRIMARY KEY,              -- guest_xxx
  external_ids JSON DEFAULT '{}',   -- {"pms": "G-12345", "loyalty": "MEM-987654"}
  ...
);

-- Foreign keys reference internal IDs
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,              -- conv_xxx
  guest_id TEXT REFERENCES guests(id),  -- guest_xxx
  ...
);
```

### Logging

Always log internal IDs for traceability:

```typescript
logger.info('Message received', {
  messageId: 'msg_V1StGXR8_Z5jdHi6B-myT',    // Internal
  conversationId: 'conv_01ARZ3NDEKTSV4RRFFQ', // Internal
  externalMessageId: 'wamid.HBgLMTU1NTU1',   // External (for debugging)
});
```

---

## Migration Guide

### Updating Existing IDs

If migrating from inconsistent ID formats:

```typescript
/**
 * Migrate old-format IDs to new format.
 * Old: task-001, staff-042 (hyphen)
 * New: task_xxx, staff_xxx (underscore + nanoid)
 */
async function migrateIds(table: string, prefix: EntityPrefix): Promise<void> {
  // Get all rows with old format IDs
  const rows = await db.prepare(`
    SELECT id FROM ${table}
    WHERE id NOT LIKE '${prefix}_%'
    OR length(id) < 20
  `).all();

  for (const row of rows) {
    const newId = generateId(prefix);

    // Update the record
    await db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).run(newId, row.id);

    // Update foreign key references
    await updateForeignKeys(table, row.id, newId);

    // Log the migration
    logger.info('Migrated ID', { table, oldId: row.id, newId });
  }
}
```

### ID Mapping Table (Temporary)

During migration, maintain a mapping:

```sql
CREATE TABLE id_migration_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  migrated_at TEXT DEFAULT (datetime('now'))
);

-- Lookup old ID
SELECT new_id FROM id_migration_map WHERE old_id = 'task-001';
```

---

## Validation Utilities

### Complete Validation Module

```typescript
// src/utils/ids.ts

import { nanoid } from 'nanoid';

export type EntityPrefix = /* ... as defined above ... */;
export type EntityType = /* ... as defined above ... */;

const ID_REGEX = /^([a-z]{2,5})_([A-Za-z0-9_-]{21})$/;

/**
 * Generate a new ID for the given entity type.
 */
export function generateId(prefix: EntityPrefix): string {
  return `${prefix}_${nanoid(21)}`;
}

/**
 * Validate ID format.
 */
export function isValidId(id: string, expectedPrefix?: EntityPrefix): boolean {
  const match = id.match(ID_REGEX);
  if (!match) return false;

  if (expectedPrefix && match[1] !== expectedPrefix) {
    return false;
  }

  return true;
}

/**
 * Parse an ID into its components.
 */
export function parseId(id: string): { prefix: EntityPrefix; uniqueId: string } | null {
  const match = id.match(ID_REGEX);
  if (!match) return null;

  const prefix = match[1] as EntityPrefix;
  if (!PREFIX_TO_ENTITY[prefix]) return null;

  return {
    prefix,
    uniqueId: match[2],
  };
}

/**
 * Assert that an ID is valid, throw if not.
 */
export function assertValidId(id: string, expectedPrefix?: EntityPrefix): void {
  if (!isValidId(id, expectedPrefix)) {
    const expected = expectedPrefix ? `${expectedPrefix}_xxx` : 'prefix_xxx';
    throw new Error(`Invalid ID format: ${id}. Expected format: ${expected}`);
  }
}

/**
 * Type guard for checking if a string is a valid ID of a specific type.
 */
export function isGuestId(id: string): id is `guest_${string}` {
  return isValidId(id, 'guest');
}

export function isConversationId(id: string): id is `conv_${string}` {
  return isValidId(id, 'conv');
}

export function isMessageId(id: string): id is `msg_${string}` {
  return isValidId(id, 'msg');
}

export function isTaskId(id: string): id is `task_${string}` {
  return isValidId(id, 'task');
}

export function isStaffId(id: string): id is `staff_${string}` {
  return isValidId(id, 'staff');
}

// ... additional type guards as needed
```

---

## Summary

| Rule | Description |
|------|-------------|
| Format | `{prefix}_{nanoid21}` |
| Separator | Always underscore `_`, never hyphen `-` |
| Prefix | 2-5 lowercase letters |
| Unique Part | 21 character NanoID |
| External IDs | Stored in `external_ids` JSON field, never modified |
| Validation | Use `isValidId()` before database operations |

---

## Related

- [Database Schema](../database/schema.ts) - Table definitions with ID fields
- [Gateway API](../api/gateway-api.md) - API endpoints using IDs
- [Event Bus](../api/events.md) - Event payloads with IDs
