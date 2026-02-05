# Data Model

Database schema for Jack The Butler.

---

## Overview

- **Database:** SQLite (single file at `data/jack.db`)
- **ORM:** Drizzle with type-safe schema definitions in `src/db/schema.ts`
- **Migrations:** Drizzle Kit, SQL files in `migrations/`
- **Vector search:** sqlite-vec extension for knowledge base embeddings
- **WAL mode** enabled for concurrent read access during writes

---

## Entity Relationships

```
┌────────┐     ┌──────────────┐     ┌───────┐
│ guests │────►│ reservations │     │ staff │
└───┬────┘     └──────┬───────┘     └───┬───┘
    │                 │                 │
    └────────►┌───────┴──────┐◄─────────┘
              │conversations │
              └──┬───────┬───┘
                 │       │
          ┌──────┘       └──────┐
          ▼                     ▼
     ┌──────────┐          ┌───────┐
     │ messages │◄─────────│ tasks │───► staff
     └──────────┘          └───────┘

┌─────────────────┐
│ approval_queue  │───► guests, conversations, staff
└─────────────────┘

┌────────────────┐     ┌──────────────────────┐
│ knowledge_base │◄────│ knowledge_embeddings │
└────────────────┘     └──────────────────────┘

┌──────────────────┐     ┌─────────────────────┐
│ automation_rules │◄────│ automation_logs      │
│                  │◄────│ automation_executions│
└──────────────────┘     └─────────────────────┘

┌─────────────┐  ┌───────────┐  ┌───────────┐  ┌────────────────┐  ┌──────────┐
│ app_configs │  │ app_logs  │  │ audit_log │  │ response_cache │  │ settings │
└─────────────┘  └───────────┘  └───────────┘  └────────────────┘  └──────────┘
```

---

## Core Tables

### guests

Guest profiles with preferences and history.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| first_name, last_name | text | Required |
| email, phone | text | Optional, unique indexes |
| language | text | Default `en` |
| loyalty_tier, vip_status | text | Optional |
| external_ids | text (JSON) | PMS/loyalty IDs: `{"pms": "12345"}` |
| preferences | text (JSON) | Guest preferences array |
| stay_count | integer | Lifetime stays |
| total_revenue | real | Lifetime revenue |
| last_stay_date | text | ISO date |
| notes, tags | text | Free text / JSON array |
| created_at, updated_at | text | ISO datetime |

### reservations

Booking records synced from PMS.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| guest_id | text FK | → guests |
| confirmation_number | text | Unique |
| external_id | text | PMS reference |
| room_number, room_type | text | Room type required |
| arrival_date, departure_date | text | ISO date, required |
| status | text | `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show` |
| estimated_arrival, actual_arrival | text | ISO datetime |
| estimated_departure, actual_departure | text | ISO datetime |
| rate_code, total_rate, balance | text/real | Financial |
| special_requests, notes | text (JSON) | JSON arrays |
| synced_at | text | Last PMS sync time |
| created_at, updated_at | text | ISO datetime |

### staff

Hotel staff users.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| email | text | Unique, required |
| name, phone | text | Name required |
| role | text | `admin`, `manager`, `front_desk`, `concierge`, `housekeeping`, `maintenance` |
| department | text | Optional |
| permissions | text (JSON) | Permission strings array |
| status | text | `active`, `inactive` |
| last_active_at | text | ISO datetime |
| password_hash | text | Bcrypt hash |
| created_at, updated_at | text | ISO datetime |

### conversations

Guest communication threads.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| guest_id | text FK | → guests |
| reservation_id | text FK | → reservations |
| channel_type | text | `whatsapp`, `sms`, `email`, `webchat` |
| channel_id | text | Phone number, email, or session ID |
| state | text | `new`, `active`, `escalated`, `resolved`, `closed` |
| assigned_to | text FK | → staff |
| current_intent | text | Latest classified intent |
| metadata | text (JSON) | Arbitrary context |
| last_message_at | text | ISO datetime |
| resolved_at | text | ISO datetime |
| idle_warned_at | text | When idle warning was sent |
| created_at, updated_at | text | ISO datetime |

### messages

Individual messages within conversations.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| conversation_id | text FK | → conversations |
| direction | text | `inbound`, `outbound` |
| sender_type | text | `guest`, `ai`, `staff`, `system` |
| sender_id | text | Staff ID if sender_type is `staff` |
| content | text | Message body |
| content_type | text | `text`, `image`, `audio`, `video`, `document`, `location`, `interactive` |
| media | text (JSON) | Media attachments array |
| intent | text | Classified intent |
| confidence | real | Intent confidence score |
| entities | text (JSON) | Extracted entities |
| channel_message_id | text | Platform message ID |
| delivery_status | text | `pending`, `sent`, `delivered`, `read`, `failed` |
| delivery_error | text | Error details if failed |
| created_at | text | ISO datetime |

### tasks

Service requests and work orders.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| conversation_id | text FK | → conversations |
| message_id | text FK | → messages |
| source | text | `manual`, `auto`, `automation` |
| type | text | `housekeeping`, `maintenance`, `concierge`, `room_service`, `other` |
| department | text | Required |
| room_number | text | Optional |
| description | text | Required |
| items | text (JSON) | Items array: `[{"item": "towels", "quantity": 2}]` |
| priority | text | `urgent`, `high`, `standard`, `low` |
| status | text | `pending`, `assigned`, `in_progress`, `completed`, `cancelled` |
| assigned_to | text FK | → staff |
| external_id, external_system | text | External system reference |
| due_at, started_at, completed_at | text | ISO datetime |
| notes, completion_notes | text | Free text |
| created_at, updated_at | text | ISO datetime |

---

## Knowledge Base

### knowledge_base

Hotel information for RAG (FAQ, policies, amenities, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| category | text | `faq`, `policy`, `amenity`, `service`, `room_type`, `local_info` |
| title | text | Required |
| content | text | Required |
| keywords | text (JSON) | Search keywords array |
| status | text | `active`, `archived` |
| priority | integer | Sort/relevance weight |
| language | text | Default `en` |
| source_url | text | If imported via site scraper |
| source_entry_id | text | Original entry reference |
| created_at, updated_at | text | ISO datetime |

### knowledge_embeddings

Vector embeddings for semantic search.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK/FK | → knowledge_base (cascade delete) |
| embedding | text | JSON array of floats |
| model | text | Embedding model name |
| dimensions | integer | Vector dimensions |
| created_at | text | ISO datetime |

Embeddings must be regenerated when switching embedding providers (different models produce different dimensions).

---

## Automation

### automation_rules

Configured automation triggers and actions.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| name | text | Required |
| description | text | Optional |
| trigger_type | text | `time_based`, `event_based` |
| trigger_config | text (JSON) | Trigger-specific config |
| action_type | text | `send_message`, `create_task`, `notify_staff`, `webhook` |
| action_config | text (JSON) | Action-specific config |
| actions | text (JSON) | Multi-step action chain (overrides action_type/action_config when set) |
| retry_config | text (JSON) | Retry policy |
| enabled | boolean | Default `true` |
| last_run_at | text | ISO datetime |
| last_error | text | Most recent error |
| run_count | integer | Total executions |
| consecutive_failures | integer | Failure streak count |
| created_at, updated_at | text | ISO datetime |

### automation_logs

Log of individual rule executions.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| rule_id | text FK | → automation_rules (cascade delete) |
| status | text | `success`, `failed`, `skipped` |
| trigger_data | text (JSON) | Event that triggered the rule |
| action_result | text (JSON) | Outcome details |
| error_message | text | Error if failed |
| execution_time_ms | integer | Duration |
| created_at | text | ISO datetime |

### automation_executions

Tracks action chains and retries for multi-step automations.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| rule_id | text FK | → automation_rules (cascade delete) |
| triggered_at | text | ISO datetime |
| trigger_data | text (JSON) | Event data |
| status | text | `pending`, `running`, `completed`, `failed`, `partial` |
| action_results | text (JSON) | Per-action results array |
| attempt_number | integer | Retry attempt (starts at 1) |
| next_retry_at | text | Scheduled retry time |
| error_message | text | Error if failed |
| completed_at | text | ISO datetime |
| execution_time_ms | integer | Duration |
| created_at | text | ISO datetime |

---

## App System

### app_configs

Provider configuration storage (credentials encrypted).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| app_id | text | Category: `sms`, `email`, `ai`, etc. |
| provider_id | text | Provider: `twilio`, `mailgun`, `anthropic`, etc. |
| enabled | boolean | Default `false` |
| status | text | `not_configured`, `configured`, `connected`, `error`, `disabled` |
| config | text (JSON) | Encrypted configuration object |
| last_checked_at | text | Last connection test |
| last_error | text | Most recent error |
| created_at, updated_at | text | ISO datetime |

Unique constraint on (`app_id`, `provider_id`).

### app_logs

Event log for app provider activity.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| app_id | text | Category |
| provider_id | text | Provider |
| event_type | text | `connection_test`, `sync`, `webhook`, `send`, `receive`, `error`, `config_changed` |
| status | text | `success`, `failed` |
| details | text (JSON) | Event-specific data |
| error_message | text | Error if failed |
| latency_ms | integer | Response time |
| created_at | text | ISO datetime |

---

## Supporting Tables

### approval_queue

Staff approval workflow for AI actions (autonomy L1 mode).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| type | text | `response`, `task`, `offer` |
| action_type | text | `respondToGuest`, `createHousekeepingTask`, etc. |
| action_data | text (JSON) | Proposed action details |
| conversation_id | text FK | → conversations |
| guest_id | text FK | → guests |
| status | text | `pending`, `approved`, `rejected` |
| decided_at | text | ISO datetime |
| decided_by | text FK | → staff |
| rejection_reason | text | Optional |
| created_at | text | ISO datetime |

### response_cache

Cached AI responses for common queries.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| query_hash | text | Unique hash of normalized query |
| query | text | Original query text |
| response | text | Cached AI response |
| intent | text | Classified intent |
| hit_count | integer | Times served from cache |
| last_hit_at | text | ISO datetime |
| expires_at | text | ISO datetime |
| created_at | text | ISO datetime |

### audit_log

Security-relevant event tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| actor_type | text | `user`, `system`, `api`, `webhook` |
| actor_id | text | Who performed the action |
| action | text | What was done |
| resource_type | text | What was affected |
| resource_id | text | Specific resource |
| details | text (JSON) | Additional context |
| ip_address | text | Request origin |
| user_agent | text | Client info |
| created_at | text | ISO datetime |

### settings

Global key-value configuration.

| Column | Type | Notes |
|--------|------|-------|
| key | text PK | Setting name (e.g. `hotel.name`, `hotel.timezone`) |
| value | text | Setting value |
| updated_at | text | ISO datetime |

---

## Type Exports

Drizzle infers TypeScript types from the schema. Available in `src/db/schema.ts`:

| Type | Select | Insert |
|------|--------|--------|
| Guest | `Guest` | `NewGuest` |
| Reservation | `Reservation` | `NewReservation` |
| Staff | `Staff` | `NewStaff` |
| Conversation | `Conversation` | `NewConversation` |
| Message | `Message` | `NewMessage` |
| Task | `Task` | `NewTask` |
| KnowledgeItem | `KnowledgeItem` | `NewKnowledgeItem` |
| KnowledgeEmbedding | `KnowledgeEmbedding` | `NewKnowledgeEmbedding` |
| AutomationRule | `AutomationRule` | `NewAutomationRule` |
| AutomationLog | `AutomationLog` | `NewAutomationLog` |
| AutomationExecution | `AutomationExecution` | `NewAutomationExecution` |
| AppConfig | `AppConfig` | `NewAppConfig` |
| AppLog | `AppLog` | `NewAppLog` |
| AuditLogEntry | `AuditLogEntry` | `NewAuditLogEntry` |
| ResponseCacheEntry | `ResponseCacheEntry` | `NewResponseCacheEntry` |
| ApprovalQueueItem | `ApprovalQueueItem` | `NewApprovalQueueItem` |
| Settings | `Settings` | `NewSettings` |

---

## Related

- [Tech Stack](tech-stack.md) — SQLite and Drizzle details
- [Project Structure](project-structure.md) — Where schema lives
- [Architecture Overview](index.md) — Principles and high-level view
