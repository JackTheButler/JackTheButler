# System Health Dashboard

> Phase: Planned
> Status: Not Started
> Priority: High

## Overview

Hotel staff have no visibility into whether Jack's integrations are working correctly without SSH access to the server. This feature adds a **System Health** page to the dashboard that shows the live status of all connected apps (WhatsApp, PMS, AI provider), surfaces recent errors in plain language, and provides a filtered log viewer for admins. It turns silent failures into visible, actionable alerts.

## Goals

1. **Zero-SSH diagnostics** — A hotel admin can identify and describe any integration failure without touching the server
2. **Plain-language errors** — Log entries are presented in human-readable form, not raw stack traces
3. **App health at a glance** — Every connected app shows a green/amber/red status with the time of its last successful event
4. **Errors-only by default** — The log view surfaces failures without overwhelming staff with routine success entries
5. **Role-gated access** — Raw log data is only visible to admins; other staff see the health summary only

## Key Features

### Staff-Facing (Dashboard)

1. **App status cards** — Each connected app (WhatsApp, PMS, AI provider) shows a green/amber/red indicator, the time of its last successful event, and a plain-English description of the most recent error if unhealthy.
2. **Recent errors summary** — A compact table on the health page showing the last 5–10 failures across all apps, with app name, time, event type, and human-readable description.
3. **Log viewer** — Admins can browse the full `app_logs` table filtered by app, status, and date range. Defaults to errors only. Raw details visible on row expansion.
4. **Latency indicator** — Each app card shows average response time from the last 20 successful events, flagging slow integrations even when they're not failing.
5. **Per-app status dot on Apps page** — The existing Apps listing gains a small status indicator on each card linking to its filtered log view.

---

## Architecture

### Where It Lives

```
src/gateway/routes/system.ts                       # New: /api/v1/system/health and /api/v1/system/logs
apps/dashboard/src/pages/settings/
├── Roles.tsx                                      # Existing
├── Security.tsx                                   # Existing
├── Users.tsx                                      # Existing
└── SystemHealth.tsx                               # New: rendered at /settings/health
```

The page lives at `/settings/health`, consistent with the existing settings section structure.

The `app_logs` table already exists and is already being written to by `src/services/app-config.ts`. No new data collection is needed — this is purely a read + presentation layer.

### How It Connects

```
app_logs table (already populated)
    ↓
GET /api/v1/system/health
    ↓ aggregates per-app status + recent errors
Dashboard SystemHealth page
    ↓
├── Health cards (one per connected app)
└── Log table (errors/warnings, filterable by app)
```

### App Status Derivation

Per-app status is derived from `app_logs` at query time — no separate status field is needed:

- **Healthy** (green) — last event for this app was `status: success` within the last 24h
- **Warning** (amber) — last event was success but >24h ago, or last event was failure but >1h ago
- **Error** (red) — most recent event for this app has `status: failed`
- **Unknown** (grey) — no log entries exist yet for this app

---

## Core Concepts

### Health Summary vs. Log Viewer

Two distinct views serve two distinct audiences:

**Health Summary** — visible to all staff with dashboard access. Shows one card per connected app with status indicator, app name, last event time, and a single plain-English description of the most recent error if status is not healthy. No raw data.

**Log Viewer** — visible to admins only (`PERMISSIONS.SETTINGS_MANAGE`). A paginated table of `app_logs` entries filterable by app, status (`success` / `failed`), and date range. Defaults to errors only. Raw `errorMessage` and `details` fields are shown here.

### Plain-Language Error Mapping

Raw error messages from integrations (e.g. `401 Unauthorized`, `ECONNREFUSED`, `invalid_grant`) are mapped to human-readable descriptions before being sent to the client:

```
eventType: connection_test, status: failed, errorMessage: "401 Unauthorized"
→ "API key rejected — check your credentials in App Settings"

eventType: webhook, status: failed, errorMessage: "ECONNREFUSED"
→ "Could not reach the PMS — check that your server URL is correct"

eventType: send, status: failed, errorMessage: "rate_limit_exceeded"
→ "Message sending paused — WhatsApp rate limit reached, will retry automatically"
```

Unmapped errors fall back to a generic: `"Unexpected error — see log details for more information"`.

The mapping lives in a small lookup table in the API route, not in the frontend, so it can be extended without a dashboard deploy.

### Latency Tracking

The existing `latency_ms` column in `app_logs` is used to show response time for each app. The health endpoint returns a rolling average of the last 20 successful events per app. This gives a quick signal if an integration is slow even when not failing (e.g. PMS taking 8s per sync).

---

## Security

- **Health summary** — accessible to any authenticated staff member. Contains no raw log data, only status labels and plain-English descriptions.
- **Log viewer** — gated behind `PERMISSIONS.SETTINGS_MANAGE` (admin only). Raw `errorMessage` and `details` JSON may contain internal URLs, provider responses, or partial message content.
- **Details field** — the `details` JSON column can contain guest-identifiable data (phone numbers, reservation IDs). The log viewer must not display it inline in the table — only on explicit row expansion, and only for admins.
- **No new data collection** — this feature reads existing logs only. No additional data is stored as a result of viewing the health page.

---

## Admin Experience

### Health Page Layout

```
System Health                              Last checked: just now  [Refresh]

┌─────────────────────────────────────────────────────────────────────┐
│  ● WhatsApp (Meta)          Healthy    Last event: 2 minutes ago   │
│  ● Mews PMS                 Healthy    Last event: 14 minutes ago  │
│  ● Anthropic Claude         Healthy    Last event: 1 minute ago    │
│  ● WebChat                  Warning    Last event: 3 hours ago     │
│    API key rejected — check your credentials in App Settings        │
└─────────────────────────────────────────────────────────────────────┘

Recent Errors                                        [Show all logs ↓]

  App          Time          Event         Error
  ─────────────────────────────────────────────────────────
  WebChat      2h ago        send          API key rejected
  Mews PMS     Yesterday     sync          Timeout after 30s
```

### Navigation

The health page is accessible from:
- **Settings → System Health** (`/settings/health`) — new tab in the Settings section, visible to all authenticated staff
- **Apps page** — each app card gets a small status dot linking to its filtered log view at `/settings/health?app={appId}`

---

## What's NOT in Scope (Future)

- **Push notifications / alerts** — email or WhatsApp alerts when an integration goes red. Deferred; requires notification channel setup separate from this feature.
- **Log retention policy UI** — auto-purge old log entries after N days. Logs can grow large; a settings control for retention is useful but not blocking.
- **Pino server log streaming** — exposing the Node.js process logs (not just `app_logs`) via the dashboard. Higher security risk, lower priority.
- **Uptime percentage metrics** — rolling uptime calculation per app over 7/30 days. Useful but adds query complexity; deferred to a later analytics phase.
- **Webhook replay** — retrying failed webhook events from the UI. Requires per-event retry logic in the channel adapters.

---

## Data Model

No schema changes required. The feature reads from two existing tables:

**`app_logs`** (existing):
```typescript
{
  id: string
  appId: string           // e.g. 'whatsapp', 'mews', 'anthropic'
  providerId: string      // specific provider variant
  eventType: string       // connection_test | sync | webhook | send | receive | error | config_changed
  status: string          // success | failed
  details: string | null  // JSON, event-specific
  errorMessage: string | null
  latencyMs: number | null
  createdAt: string
}
```

**`app_configs`** (existing) — joined to get the display name and enabled status of each app.

---

## Instrumentation Layers

Before any UI can be useful, the system must emit structured events from all data sources. The four layers below must be implemented first — they are the data foundation the health page reads from.

| Layer | What it covers | Approach | New code |
|-------|---------------|----------|----------|
| **1. Event subscriber** | Messages received/sent/failed, conversations created/escalated/resolved, WebSocket connect/disconnect/error | Subscribe to existing event emitter + 3–4 `events.emit()` calls in WebChat handler → write to new `activity_log` table | 1 new subscriber file + minor WebChat additions |
| **2. Base HTTP client** | All outbound API calls to PMS, Mailgun, SmartLock, WhatsApp API — latency, status codes, failures | Base class all adapters extend → auto-logs to `app_logs` on every request | 1 new base class + update existing adapters to extend it |
| **3. Webhook middleware** | All inbound webhooks from external services — received, signature valid/invalid, processed/rejected | Single gateway-level middleware before routing → logs to `app_logs` | 1 middleware file |
| **4. Message processor outcome** | Intent classified, action taken, why no response sent (escalated, autonomy blocked, error) | Single structured log call at end of `message-processor.ts` → `activity_log` | ~20 lines in 1 existing file |

**Coverage after all 4 layers:**

| Scenario | Covered by |
|----------|-----------|
| WhatsApp message received | Layer 1 (message.received event) |
| WhatsApp message failed to send | Layer 1 (message.failed event) |
| WhatsApp API rejected outbound call | Layer 2 (HTTP wrapper) |
| Inbound WhatsApp webhook rejected | Layer 3 (webhook middleware) |
| No response sent (escalated/blocked) | Layer 4 (processor outcome) |
| WebChat guest connected/disconnected | Layer 1 (WebSocket events) |
| WebChat connection error | Layer 1 (WebSocket events) |
| PMS sync failed | Layer 2 (HTTP wrapper) |
| Mews webhook received/rejected | Layer 3 (webhook middleware) |
| Mailgun delivery failed | Layer 2 (HTTP wrapper) |
| AI provider timeout or error | Layer 2 (HTTP wrapper) |
| Intent classification result | Layer 4 (processor outcome) |

---

## Implementation Phases

### Phase 1: Instrumentation (data foundation)

**Goal:** All four layers are emitting structured events — the system is fully observable before any UI is built.

**Layer 1 — Event subscriber + activity_log table:**
Add `activity_log` table to schema (source, event_type, status, conversation_id, error_message, latency_ms, created_at). Create `src/services/activity-log.ts` that subscribes to all relevant `EventTypes` and writes rows. Add `WEBCHAT_CONNECTED`, `WEBCHAT_DISCONNECTED`, `WEBCHAT_ERROR` to `EventTypes` and emit them from the WebSocket handler in `src/apps/channels/webchat/index.ts`.

**Layer 2 — Base HTTP client:**
Create `src/apps/base-client.ts` with a `makeRequest()` method that wraps fetch/axios, measures latency, and writes to `app_logs` on every call. Update Mews, Mailgun, Twilio, and WhatsApp adapters to extend this base class.

**Layer 3 — Webhook middleware:**
Add `src/gateway/middleware/webhook-logger.ts` that intercepts all requests to `/webhook/*` routes, logs the inbound event (source, path, status) to `app_logs` before passing to the handler.

**Layer 4 — Message processor outcome:**
Add a single structured log call at the end of the main processing flow in `src/core/message-processor.ts` recording: channel, conversation_id, intent, action_taken (responded/escalated/blocked/error), latency_ms, error if any.

### Phase 2: Health API + Summary Cards

**Goal:** The health page shows live status cards for all connected apps with no raw log data exposed.

Add `GET /api/v1/system/health` that queries both `app_logs` and `activity_log`, derives per-app status (healthy/warning/error/unknown) from the most recent events, computes rolling average latency, and maps error messages to plain-English descriptions. Build `SystemHealth.tsx` in `apps/dashboard/src/pages/settings/` with status cards. Add the page to the Settings navigation.

### Phase 3: Log Viewer

**Goal:** Admins can browse, filter, and search structured logs from the dashboard.

Add `GET /api/v1/system/logs` with query params for `source`, `status`, `from`, `to`, `limit`, `offset` — querying both `activity_log` and `app_logs`. Implement the paginated log table in the dashboard defaulting to errors only. Gate behind `PERMISSIONS.SETTINGS_MANAGE`. Add row expansion for raw details. Add per-app status dot to the Apps listing page.

### Phase 4: Hardening and Error Mapping

**Goal:** Error messages are consistently human-readable and edge cases are handled gracefully.

Expand plain-language error mapping to cover all known patterns from WhatsApp, Mews, Anthropic, OpenAI, Twilio, and email providers. Add PMS staleness check (warn if last successful sync > N hours ago). Add "no data yet" empty states. Add log retention policy (auto-purge entries older than 30 days). Write tests for the health aggregation logic and status derivation.

---

## Related Documents

- [Apps Configuration](./009-pms-providers.md) — App configs that feed into health status
- [App Config Service](../../src/services/app-config.ts) — Existing log write path
- [App Logs Schema](../../src/db/schema.ts) — `appLogs` table definition
