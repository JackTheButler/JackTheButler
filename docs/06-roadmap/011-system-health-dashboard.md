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
3. **Log viewer** — Admins can browse both `app_logs` (integration events) and `activity_log` (business events) filtered by source, status, and date range. Defaults to errors only. Raw details visible on row expansion.
4. **Latency indicator** — Each app card shows average response time from the last 20 successful events, flagging slow integrations even when they're not failing.
5. **Per-app status dot on Apps page** — The existing Apps listing gains a small status indicator on each card linking to its filtered log view.

---

## Architecture

### Where It Lives

```
src/gateway/routes/system.ts                       # New: /api/v1/system/health and /api/v1/system/logs
src/apps/instrumentation.ts                        # New: createAppLogger(), writeAppLog()
src/gateway/middleware/webhook-logger.ts           # New: webhook instrumentation
src/services/activity-log.ts                       # New: event subscriber → activity_log
apps/dashboard/src/pages/settings/
├── Roles.tsx                                      # Existing
├── Security.tsx                                   # Existing
├── Users.tsx                                      # Existing
└── SystemHealth.tsx                               # Existing (built with mock data — Phase 2 wires real API)
```

The page lives at `/settings/system-health` as a tab within the existing Settings section.

### How It Connects

```
activity_log (new)          app_logs (existing, extended)
      │                              │
      └──────────┬───────────────────┘
                 ↓
     GET /api/v1/system/health
         ↓ per-app status + latency + recent errors
     GET /api/v1/system/logs
         ↓ paginated, filterable
     Dashboard SystemHealth.tsx
         ↓
     ├── Health cards (one per connected app)
     └── Log viewer (errors/warnings, admin only)
```

### App Status Derivation

Per-app status is derived at query time from the appropriate table — no separate status field is needed. Each app maps to a primary data source (see Data Model → Health API data sources):

- **Healthy** (green) — most recent event for this app was `status: success` within the last 24h
- **Warning** (amber) — most recent event was success but >24h ago, or most recent event was failure but >1h ago
- **Error** (red) — most recent event for this app has `status: failed`
- **Unknown** (grey) — no log entries exist yet for this app

---

## Core Concepts

### Health Summary vs. Log Viewer

Two distinct views serve two distinct audiences:

**Health Summary** — visible to all staff with dashboard access. Shows one card per connected app with status indicator, app name, last event time, and a single plain-English description of the most recent error if status is not healthy. No raw data.

**Log Viewer** — visible to admins only (`PERMISSIONS.SETTINGS_MANAGE`). A paginated table querying both `app_logs` and `activity_log`, filterable by source, status (`success` / `failed`), and date range. Defaults to errors only. Raw `errorMessage` and `details` fields are shown here.

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
- **New data collected** — Phases 1–4 add instrumentation that writes to `activity_log` and extends `app_logs`. This data is strictly operational (latency, status, error messages) and is automatically purged after 30 days. No guest message content is stored in these tables.

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
- **Log retention policy UI** — a dashboard control to configure the retention window. Auto-purge after 30 days is implemented in Phase 4; the UI to change that window is deferred.
- **Pino server log streaming** — exposing the Node.js process logs (not just `app_logs`) via the dashboard. Higher security risk, lower priority.
- **Uptime percentage metrics** — rolling uptime calculation per app over 7/30 days. Useful but adds query complexity; deferred to a later analytics phase.
- **Webhook replay** — retrying failed webhook events from the UI. Requires per-event retry logic in the channel adapters.

---

## Data Model

Two tables are used — one existing, one new:

**`app_logs`** (existing, extended by Layers 2 & 3):
```typescript
{
  id: string
  appId: string           // e.g. 'whatsapp', 'mews', 'anthropic'
  providerId: string      // specific provider variant
  eventType: string       // connection_test | http_request | webhook_received | send | config_changed
  status: string          // success | failed
  details: string | null  // JSON — see details schema below
  errorMessage: string | null
  latencyMs: number | null
  createdAt: string       // indexed for retention queries
}
```

**`activity_log`** (new, written by Layers 1 & 4):
```typescript
{
  id: string
  source: string          // channel type: 'whatsapp' | 'webchat' | 'sms' | 'system'
  eventType: string       // message.received | message.sent | message.failed | conversation.escalated
                          // processor.outcome | webchat.connected | webchat.disconnected | scheduler.outcome
  status: string          // success | failed | warning
  conversationId: string | null
  errorMessage: string | null
  latencyMs: number | null
  details: string | null  // JSON — see details schema below
  createdAt: string       // indexed for efficient purging and time-range queries
}
```

**`app_configs`** (existing) — joined to get the display name and enabled status of each app.

### Details field schema

The `details` JSON field has no TypeScript enforcement, but each event type should follow a consistent minimum shape to keep the log viewer useful across adapters:

| eventType | Minimum details fields |
|---|---|
| `http_request` | `{ method?, endpoint?, statusCode? }` |
| `webhook_received` | `{ path, appId }` — appId derived from path segment |
| `send` | `{ to?, messageId? }` |
| `sync` | `{ recordsFetched?, created?, updated?, errors? }` |
| `connection_test` | `{ model? }` (AI) or `{ accountSid? }` (Twilio) |
| `processor.outcome` | `{ intent?, actionTaken, reason? }` — reason required when actionTaken is `approval_queued` |
| `scheduler.outcome` | `{ job, created?, updated?, errors? }` |

### Health API data sources per app

Each app card on the health page draws from a specific table and source field. The health API must know this mapping:

| App card | Primary table | Filter |
|---|---|---|
| WhatsApp | `app_logs` | `appId = 'whatsapp'` |
| Mews PMS | `app_logs` | `appId = 'pms'` + `activity_log` scheduler outcome |
| AI (Claude/OpenAI) | `app_logs` | `appId = 'ai'` |
| WebChat | `activity_log` | `source = 'webchat'` |

WhatsApp has data in both tables (`app_logs` for outbound HTTP calls, `activity_log` for message events) — the health status uses the most recent entry across both.

---

## Instrumentation Layers

Before any UI can be useful, the system must emit structured events from all data sources. The five layers below must be implemented first — they are the data foundation the health page reads from.

| Layer | What it covers | Approach | New code |
|-------|---------------|----------|----------|
| **1. Event subscriber** | Messages received/sent/failed, conversations created/escalated/resolved, WebSocket connect/disconnect/error | Add `onAny()` to `TypedEventEmitter` → single subscriber registration catches all events including future ones. Add `WEBCHAT_CONNECTED/DISCONNECTED/ERROR` to EventTypes, emit `MESSAGE_FAILED` on processor error → write to new `activity_log` table | 1 new subscriber file + `onAny()` on emitter + additions to WebChat handler |
| **2. Per-provider instrumentation** | All outbound API calls to PMS, AI providers, messaging APIs — latency, failures | `withAppLog()` helper + `createAppLogger()` factory in `src/apps/instrumentation.ts`. Each adapter calls `createAppLogger(appId, providerId)` once in its constructor — binds identity so per-call boilerplate is minimal. All writes are fire-and-forget (never awaited in critical path). | 1 instrumentation file + ~5 lines per adapter call site |
| **3. Webhook middleware** | All inbound webhooks from external services — received, signature valid/invalid, processed/rejected | Single Hono middleware registered before `/webhooks/*` routes in `server.ts` → logs after `next()` using response status code to capture accepted vs rejected outcomes. Errors are swallowed so a log failure never breaks webhook delivery. | 1 middleware file |
| **4. Message processor outcome** | Intent classified, action taken, why no response sent (escalated, autonomy blocked, error) | Single `try/finally` wraps the entire `process()` body — `finally` always runs regardless of which path exits or throws. Log write inside `finally` is wrapped in its own try/catch so a DB failure cannot replace the original error. | ~25 lines in 1 existing file |
| **5. Scheduler outcome** | Whether the PMS sync job ran, succeeded, and what it produced | Write to `activity_log` at the end of each scheduler job run in `src/services/scheduler.ts`. The scheduler's in-memory `lastRun`/`lastResult` is lost on restart — the DB record is the durable source of truth. | ~10 lines in 1 existing file |

**Coverage after all 5 layers:**

| Scenario | Covered by |
|----------|-----------|
| WhatsApp message received | Layer 1 (message.received event) |
| WhatsApp message failed to send | Layer 1 (message.failed event) |
| WhatsApp API rejected outbound call | Layer 2 (HTTP wrapper) |
| Inbound WhatsApp webhook rejected | Layer 3 (webhook middleware, logs after handler) |
| No response sent (escalated/blocked) | Layer 4 (processor outcome) |
| Approval queued — autonomy level vs low confidence | Layer 4 (reason field in details) |
| WebChat guest connected/disconnected | Layer 1 (WebSocket events) |
| WebChat connection error | Layer 1 (WebSocket events) |
| PMS sync HTTP call failed | Layer 2 (HTTP wrapper) |
| PMS sync job never ran (scheduler stopped) | Layer 5 (scheduler outcome — no recent row) |
| Mews webhook received/rejected | Layer 3 (webhook middleware) |
| Mailgun delivery failed | Layer 2 (HTTP wrapper) |
| AI provider timeout or error | Layer 2 (HTTP wrapper) |
| Intent classification result | Layer 4 (processor outcome) |

**Known gap:** `MESSAGE_DELIVERED` exists in `EventTypes` but is never emitted — WhatsApp delivery receipts arrive via webhook and are processed inside the webhook handler without emitting an event. Delivery confirmation tracking requires a future addition to the WhatsApp webhook handler.

---

## Implementation Phases

### Phase 1a: Schema + Instrumentation Module

**Goal:** The data foundation is in place with no behaviour change — nothing writes to the new table yet.

**Files changed:** `src/db/schema.ts`, migration, `src/apps/instrumentation.ts` (new)

Add `activity_log` table to schema with a `created_at` index — this index must be here, not deferred, because adding an index via migration on a large table later is slow:

```typescript
// src/db/schema.ts
export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(),
  conversationId: text('conversation_id'),
  errorMessage: text('error_message'),
  latencyMs: integer('latency_ms'),
  details: text('details'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_activity_log_created').on(table.createdAt),   // required for purge queries
  index('idx_activity_log_source').on(table.source),
  index('idx_activity_log_status').on(table.status),
]);
```

Create `src/apps/instrumentation.ts` with two exports:

- `writeAppLog(appId, providerId, eventType, status, details, errorMessage, latencyMs)` — low-level helper: writes one row to `app_logs` directly via `db.insert`. Used by the webhook middleware (Phase 1d) and internally by `createAppLogger`.
- `createAppLogger(appId, providerId)` — factory that binds adapter identity once so per-call boilerplate is minimal. Used by all adapter call sites.

```typescript
// src/apps/instrumentation.ts

// Exported — used by webhook middleware (Phase 1d) and internally by createAppLogger
export function writeAppLog(
  appId: string, providerId: string, eventType: string,
  status: 'success' | 'failed', details: Record<string, unknown>,
  errorMessage: string | undefined, latencyMs: number
): Promise<void> {
  return db.insert(appLogs).values({
    id: crypto.randomUUID(),
    appId, providerId, eventType, status,
    details: JSON.stringify(details),
    errorMessage: errorMessage ?? null,
    latencyMs,
    createdAt: new Date().toISOString(),
  }).run();
}

export function createAppLogger(appId: string, providerId: string) {
  return function appLog<T>(
    eventType: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const t0 = Date.now();
    return fn().then(
      (result) => {
        // Fire-and-forget — log write never blocks the caller
        writeAppLog(appId, providerId, eventType, 'success', details, undefined, Date.now() - t0)
          .catch((err) => log.warn({ err }, 'App log write failed'));
        return result;
      },
      (err) => {
        const message = err instanceof Error ? err.message : String(err);
        writeAppLog(appId, providerId, eventType, 'failed', details, message, Date.now() - t0)
          .catch((e) => log.warn({ e }, 'App log write failed'));
        throw err; // always re-throw the original error
      }
    );
  };
}
```

**Implementation note:** `writeAppLog` writes directly to `app_logs` via `db.insert(appLogs)` — it does **not** call `appConfigService.logEvent()`, which is a `private` method inaccessible from outside the service. Direct DB access keeps the instrumentation module self-contained with no service coupling.

---

### Phase 1b: Event Subscriber (Layer 1)

**Goal:** Business events (messages, conversations, WebSocket lifecycle) are written to `activity_log` automatically.

**Files changed:** `src/events/index.ts`, `src/services/activity-log.ts` (new), `src/apps/channels/webchat/index.ts`, `src/core/message-processor.ts`, `src/index.ts`

Add `onAny()` to `TypedEventEmitter` in `src/events/index.ts` by emitting to a `'*'` wildcard inside `emit()`. The subscriber registers **once** and catches all current and future event types automatically — no subscriber changes needed when new EventTypes are added:

```typescript
// One registration covers everything, current and future:
events.onAny((event) => {
  activityLogService.write(event).catch((err) =>
    log.warn({ err }, 'Activity log write failed') // silent — never crash the app
  );
});
```

Note: the handler body still needs to map each event shape to `activity_log` columns (different events carry different fields). The simplification is at the subscription level, not the mapping level.

Add `WEBCHAT_CONNECTED`, `WEBCHAT_DISCONNECTED`, `WEBCHAT_ERROR` to `EventTypes` and emit them from `src/apps/channels/webchat/index.ts` — the `ws.on('close')` and `ws.on('error')` handlers already exist (lines ~414–427) and just need `events.emit()` calls added.

Add `MESSAGE_FAILED` emission in `message-processor.ts` — the event type exists in `EventTypes` but is never emitted anywhere in the codebase.

---

### Phase 1c: Adapter Instrumentation (Layer 2)

**Goal:** All outbound API calls across all adapters are timed and logged to `app_logs`.

**Files changed:** 8 adapter files — Mews, Anthropic, OpenAI, Ollama, Twilio, WhatsApp (Meta), Mailgun, SendGrid

Each adapter adds one bound logger instance in its constructor and wraps every outbound SDK call with it. The change per adapter is mechanical (~5 lines each):

```typescript
// In constructor — identity bound once:
private log = createAppLogger('ai', 'anthropic');

// At each outbound call — 2 lines, identity never repeated:
const response = await this.log('http_request', { model: this.model }, () =>
  this.client.messages.create({ ... })
);
```

Key safety properties:
- **Fire-and-forget**: log writes are never awaited — a slow or failing DB write never adds latency or breaks the API call
- **Always re-throws**: the original error is always propagated to the caller unchanged
- **Silent log failures**: DB errors from the log write are caught and warned, never surfaced to the caller

**Rule: never call an external SDK or `fetch` directly in `src/apps/` — always use the bound logger from `createAppLogger()`.** Documented in CLAUDE.md and enforced via code review.

---

### Phase 1d: Webhook, Processor, Scheduler (Layers 3–5)

**Goal:** Inbound webhooks, message processor outcomes, and scheduler runs are all logged.

**Files changed:** `src/gateway/middleware/webhook-logger.ts` (new), `src/gateway/server.ts`, `src/core/message-processor.ts`, `src/services/scheduler.ts`

**Layer 3 — Webhook middleware:**

Add `src/gateway/middleware/webhook-logger.ts` registered at `/webhooks/*` in `server.ts` **before** `app.route('/webhooks', webhookRoutes)` — order matters in Hono. Note: the route is `/webhooks` (not `/webhook`).

- **Log after `next()`, not before** — logging before the handler always records `success` even for rejected webhooks (invalid signatures return 401/403). Log after `await next()` and use `c.res.status` to determine the outcome:

```typescript
app.use('/webhooks/*', async (c, next) => {
  await next(); // let the handler run first
  const status = c.res.status;
  // Derive appId from path: /webhooks/whatsapp → 'whatsapp'
  const appId = c.req.path.split('/')[2] ?? 'unknown';
  writeAppLog(appId, appId, 'webhook_received', status < 400 ? 'success' : 'failed', {
    path: c.req.path, method: c.req.method,
  }).catch((err) => log.warn({ err }, 'Webhook log failed')); // fire-and-forget
});
```

- **Do not read the request body** — reading `req.json()` or `req.text()` in middleware consumes the body stream; the downstream route handler would receive an empty body. Log only metadata: path, method, response status.

**Layer 4 — Message processor outcome:**

Use a single `try/finally` wrapping the entire `process()` body. The `finally` block runs on all exit paths — normal return, approval-queued return, and any throw — so no path is ever missed.

Three safety rules for the `finally` block:

1. **Wrap the log write in its own try/catch** — if the `await` inside `finally` throws, it replaces the original error:

```typescript
} finally {
  try {
    await activityLog.write({
      source: inbound.channel,
      conversationId: conversation?.id,    // optional chaining — may not be set if early failure
      details: { intent, actionTaken, reason },
    });
  } catch (logErr) {
    log.warn({ logErr }, 'Processor outcome log failed'); // silent — never replace original error
  }
}
```

2. **Use optional chaining on mid-function variables** — `conversation` and `intent` are assigned mid-function. If an error occurs before they are set, they are `undefined` in `finally`. Use `conversation?.id` and `intent ?? undefined` to handle this safely.

3. **Include `reason` when `actionTaken` is `approval_queued`** — the processor already calculates whether approval was triggered by autonomy level or low confidence (`reason: !canAutoExecute ? 'autonomy_level' : 'low_confidence'`). This must be captured in `details` — without it, the log viewer cannot distinguish "hotel disabled auto-responses" from "AI was uncertain."

**Layer 5 — Scheduler outcome:**

Write a `scheduler.outcome` row to `activity_log` at the end of each job in `src/services/scheduler.ts`. The scheduler's in-memory `lastRun`/`lastResult` is lost on restart — the DB record is the durable source of truth:

```typescript
// After pmsSyncService.syncReservations() completes:
activityLog.write({
  source: 'system',
  eventType: 'scheduler.outcome',
  status: result.errors > 0 ? 'warning' : 'success',
  details: { job: 'pms-sync', ...result },
}).catch((err) => log.warn({ err }, 'Scheduler log failed')); // fire-and-forget — never await
```

### Cross-cutting rule: observability must never affect the main flow

All log writes across all five layers follow the same rule: **fire-and-forget, silently catch failures**. The system must remain fully functional even if the entire observability layer is broken (DB locked, disk full, etc.). No log write is ever awaited in the critical path. No log failure is ever surfaced to a guest or external service.

---

### Phase 2: Health API + Summary Cards

**Goal:** The health page shows live status cards for all connected apps with no raw log data exposed.

`apps/dashboard/src/pages/settings/SystemHealthV2.tsx` and its Settings tab entry already exist with mock data. This phase replaces the mock with a real API.

Add `GET /api/v1/system/health` in `src/gateway/routes/system.ts`. The endpoint returns one object per connected app. Each field maps to a specific query — the API cannot use a single generic query because each app type needs different logic:

| Card field | Query |
|---|---|
| `status` | Most recent event in `app_logs` (appId match) or `activity_log` (source match) — `failed` → error, `success` but >24h → warning |
| `detail` — "last activity 2 min ago" | `MAX(created_at)` for that app's source, formatted as relative time |
| `summary` — activity count | Per-app: WhatsApp = `COUNT(message.sent)` today; Claude = `COUNT(processor.outcome)` today; WebChat = `COUNT(webchat.connected)` today; Mews PMS = derived from last `scheduler.outcome` timestamp |
| `avgLatencyMs` | `AVG(latency_ms)` of last 20 successful rows in `app_logs` for that appId |
| `latencyTrend` | Compare `AVG(latency_ms)` of last 20 vs previous 20 rows — >10% change = up/down, otherwise stable |
| `lastErrorRaw` | Most recent `error_message` where `status = failed` for that app |
| `errorDescription` | Server-side plain-language mapping from `lastErrorRaw` |
| `partialFailure` | Most recent `scheduler.outcome` row where `details.errors > 0` — requires JSON parsing of `details` column |

Update the dashboard to fetch from this endpoint instead of using the hardcoded mock arrays.

### Phase 3: Log Viewer

**Goal:** Admins can browse, filter, and search structured logs from the dashboard.

Add `GET /api/v1/system/logs` with query params for `source`, `status`, `from`, `to`, `limit`, `offset` — querying both `activity_log` and `app_logs`. Implement the paginated log table in the dashboard defaulting to errors only. Gate behind `PERMISSIONS.SETTINGS_MANAGE`. Add row expansion for raw details. Add per-app status dot to the Apps listing page.

### Phase 4: Hardening and Error Mapping

**Goal:** Error messages are consistently human-readable and edge cases are handled gracefully.

Expand plain-language error mapping to cover all known patterns from WhatsApp, Mews, Anthropic, OpenAI, Twilio, and email providers. Add PMS staleness check (warn if last successful sync > N hours ago based on `scheduler.outcome` rows). Add "no data yet" empty states for apps with no log entries. Add log retention auto-purge as a third job in `src/services/scheduler.ts`, following the same pattern as `webchat-session-cleanup` — registered via `scheduleJob('activity-log-purge', 24 * 60 * 60 * 1000, ...)`, with a matching `else if` branch in `triggerJob()` for manual triggering. The handler deletes rows older than 30 days from both `activity_log` and `app_logs`. The `created_at` index added in Phase 1 makes these deletes efficient. Write tests for the health aggregation logic and status derivation.

---

## Related Documents

- [Apps Configuration](./009-pms-providers.md) — App configs that feed into health status
- [App Config Service](../../src/services/app-config.ts) — Existing log write path
- [App Logs Schema](../../src/db/schema.ts) — `appLogs` table definition
