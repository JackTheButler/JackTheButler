# PMS Sync Freshness

> Phase: Implemented
> Status: Complete (Phases 1-3)
> Priority: High

## Overview

The local `reservations` table acts as a cache of PMS data, synced via polling (default 24h window) and webhooks. Critical code paths (AI guest context, webchat verification, automations) read this table without checking data freshness, leading to stale decisions when sync lags behind the PMS. This feature adds staleness guards to critical paths so guest-facing and automated decisions always verify freshness before acting.

## Goals

1. **Fresh data for guest-facing decisions** — Webchat verification, AI responses, and automations never act on reservation data older than a configurable threshold
2. **Graceful degradation** — If the PMS API is unavailable, fall back to local data rather than failing
3. **No architecture rewrite** — Minimal changes to existing code; the local table remains the primary read path for non-critical reads (dashboard, staff views)
4. **Observable staleness** — Log warnings when stale data is detected so sync issues are visible to operators

## Key Features

### Staff-Facing (Dashboard)

1. **No change to dashboard reads** — Dashboard and staff views continue reading from the local table without freshness checks; a few minutes of lag is acceptable for display
2. **Sync health visibility** — Staleness warnings appear in logs, helping operators diagnose sync issues
3. **Per-PMS configuration** — Staleness threshold and sync interval are configurable per PMS app in the dashboard app settings

---

## Architecture

### Where It Lives

| Piece | Location | Purpose |
|-------|----------|---------|
| Freshness helper | `src/services/pms-sync.ts` | `refreshIfStale()` method on `PMSSyncService` |
| Guest context integration | `src/core/guest-context.ts` | Freshness check before building AI context |
| Webchat integration | `src/services/webchat-action.ts` | No changes needed — already queries PMS adapter directly |
| Automation integration | `src/automation/index.ts` | Freshness check before firing triggers |
| PMS app config | `src/apps/pms/providers/*.ts` | `configSchema` fields for threshold and interval |
| Scheduler config | `src/services/scheduler.ts` | Read sync interval from active PMS app config |

### How It Connects

```
Critical path needs reservation data
    |
    v
Check reservation.syncedAt age
    |
    +-- Fresh (< threshold) --> Use local data as-is
    |
    +-- Stale (>= threshold) --> Fetch from PMS adapter
                                    |
                                    +-- PMS available --> Upsert locally, return fresh data
                                    |
                                    +-- PMS unavailable --> Log warning, fall back to local data
```

### Technical Details

The `syncedAt` column already exists on the `reservations` table and is set during `upsertReservation()`. No schema changes required.

---

## Core Concepts

### Configuration Hierarchy

Staleness threshold and sync interval follow a three-level hierarchy:

```
Code defaults (5 min threshold / 15 min sync interval)
    ↓ overridden by
PMS manifest defaults (per provider, e.g. Mews: 3 min / 5 min)
    ↓ overridden by
Operator config in PMS app settings (dashboard)
```

- **Code defaults** — Hardcoded in `pms-sync.ts` as the ultimate fallback. Used when no PMS is configured or the PMS manifest doesn't specify defaults.
- **PMS manifest defaults** — Each PMS provider sets sensible defaults in its `configSchema`. Different providers have different API rate limits and webhook reliability, so defaults vary. For example, Mews has reliable webhooks so the threshold can be longer; a provider without webhooks needs a shorter threshold.
- **Operator override** — The hotel operator can tune both values in the PMS app settings in the dashboard. Most operators won't need to change these, but a busy city hotel might want 2 minutes while a quiet resort is fine with 15.

No global settings table entry is needed — the active PMS app's config is the single source of truth, with code defaults as fallback.

### Staleness Threshold

A duration (default: 5 minutes) that defines how old `syncedAt` can be before a critical path triggers a fresh PMS lookup. This balances freshness against PMS API load.

- Critical paths check `syncedAt` before acting
- Non-critical paths (dashboard) skip the check entirely
- Read from active PMS app config, falling back to code default

### Sync Interval

A duration (default: 15 minutes) that defines how often the scheduler polls the PMS for modified reservations. The current 24-hour window is too wide — it means non-critical paths (dashboard) can be up to 24 hours stale when webhooks fail.

- Read from active PMS app config, falling back to code default
- The scheduler reads this value from the active PMS adapter's config at startup

### The `refreshIfStale()` Helper

A single method on `PMSSyncService` that encapsulates the freshness logic for single-reservation reads:

```typescript
async refreshIfStale(reservationId: string, maxAgeMs?: number): Promise<Reservation | null>
```

1. Load reservation from local DB
2. Check if a PMS adapter is active — if not, return local data immediately (local table is the source of truth when no PMS is configured)
3. Read staleness threshold from active PMS app config (fall back to code default)
4. If `syncedAt` is within threshold, return as-is
5. If stale, attempt to fetch from PMS via `getReservation()` or `getReservationByConfirmation()`
6. If PMS returns data, upsert locally and return the fresh record
7. If PMS is unavailable, log a warning and return the stale local record
8. If reservation doesn't exist locally or in PMS, return null

**No PMS configured:** Many installations run without a PMS (manual reservations entered through the dashboard). When `getActivePMSAdapter()` returns null, `refreshIfStale()` returns local data immediately without staleness warnings — because the local table IS the source of truth, not a cache.

**Request deduplication:** If multiple concurrent requests trigger `refreshIfStale()` for the same reservation (e.g. 50 guests chatting simultaneously), only one PMS API call is made. In-flight refresh requests are tracked by reservation ID — subsequent callers await the same Promise instead of making duplicate calls.

```typescript
private pendingRefreshes = new Map<string, Promise<Reservation | null>>();
```

If the same reservation is being refreshed, return the existing Promise. Once resolved, remove it from the map. This prevents PMS API rate limit issues under concurrent load without adding complexity to the callers.

This method handles single-reservation freshness for guest context. Webchat verification already queries the PMS adapter directly and doesn't need it. Automations use a different mechanism (see below).

### PMS App Config Schema

Each PMS provider adds two fields to its `configSchema`:

```typescript
{
  key: 'stalenessThreshold',
  label: 'Data freshness threshold (seconds)',
  type: 'number',
  default: 300,  // 5 minutes, varies per provider
  description: 'How old cached reservation data can be before the system fetches fresh data from the PMS for critical operations',
},
{
  key: 'syncInterval',
  label: 'Sync polling interval (seconds)',
  type: 'number',
  default: 900,  // 15 minutes, varies per provider
  description: 'How often to poll the PMS for reservation changes (safety net for missed webhooks)',
}
```

These appear alongside the existing PMS connection settings (API key, property ID, etc.) in the dashboard app configuration page. No new UI components needed — the existing `configSchema` form renderer handles number fields.

### Automation Pre-Trigger Sync

Automations query reservations in bulk (e.g. "all checked-in guests departing today") and loop through results. Calling `refreshIfStale()` per reservation would be N API calls — slow and likely to hit rate limits.

Instead, automations use a different freshness mechanism: run `syncReservations()` once at the **start of each automation scheduler tick**, before evaluating any triggers. The sync service already fetches all modified reservations in one bulk call via `getModifiedReservations(since)`.

```
Automation scheduler tick
    ↓
syncReservations(since = lastSyncTime)  ← one bulk PMS call
    ↓
All local reservations now fresh
    ↓
Run automation triggers (read local table directly, no per-row checks)
```

This keeps automations fast (local reads only after the initial sync) and PMS-friendly (one bulk call instead of N individual calls). When no PMS is configured, `syncReservations()` already returns early (existing behavior at line 27-29 of `pms-sync.ts`).

### Critical vs Non-Critical Paths

Not all reads need freshness checks. The distinction:

**Critical — single reservation (use `refreshIfStale()`):**
- **Guest context** (`guest-context.ts`) — AI decisions depend on current status (checked-in vs checked-out), room number, days remaining

**Critical — already fresh (no changes needed):**
- **Webchat verification** (`webchat-action.ts`) — All verification paths (`lookupByConfirmation`, `searchReservations`) call the PMS adapter directly, so data is always live. No `refreshIfStale()` needed.

**Critical — batch (use pre-trigger `syncReservations()`):**
- **Automation triggers** (`automation/index.ts`) — Checkout reminders, welcome messages, and departure automations fire based on status and dates. Bulk sync before evaluating triggers.

**Non-critical (read local table directly):**
- **Dashboard reservations list** — Staff can tolerate a few minutes of display lag
- **Approval queue room number** — Staff can verify in person; a stale room number is inconvenient but not harmful
- **Guest profile reservation history** — Historical data, rarely time-sensitive
- **Escalation engine priority** — Minor priority adjustment; wrong for a few minutes is acceptable

---

## What's NOT in Scope (Future)

- **Read-through cache for all reads** — Only critical paths get freshness checks; adding it everywhere would increase PMS API load and complexity without proportional benefit
- **Real-time PMS subscriptions** — Some PMSes support WebSocket or SSE streams; this is a future optimization beyond polling + webhooks
- **Guest table freshness** — Guest data changes less frequently than reservation data; staleness checks for the `guests` table can be added later if needed
- **PMS sync health dashboard** — A UI showing sync lag, last sync time, and error rates; useful but separate from the core freshness improvement

---

## Implementation Phases

### Phase 1: `refreshIfStale()` Helper + PMS Config

**Goal:** A single, tested method exists on `PMSSyncService` that checks reservation freshness and fetches from PMS when stale, with thresholds configurable per PMS app.

Add `refreshIfStale()` to `PMSSyncService`. It reads local `syncedAt`, reads the staleness threshold from the active PMS app config (with code default fallback), and optionally fetches from PMS. Includes fallback to local data when PMS is unavailable. Add `stalenessThreshold` and `syncInterval` to each PMS provider's `configSchema`. Unit tests cover fresh, stale, PMS-unavailable, and missing-config scenarios.

### Phase 2: Critical Path Integration

**Goal:** Guest context uses `refreshIfStale()`, and automations run a bulk sync before evaluating triggers.

Wire `refreshIfStale()` into guest context. Webchat verification already queries the PMS adapter directly (not the local table), so no changes needed there. Add a `syncReservations()` call at the start of each automation scheduler tick before trigger evaluation. No changes to the data flow — just freshness checks before the existing logic runs.

### Phase 3: Dynamic Polling Frequency

**Goal:** Scheduled PMS sync reads the interval from the active PMS app config instead of using a hardcoded 24-hour window.

Update the scheduler to read `syncInterval` from the active PMS app config at startup. Falls back to the code default (15 minutes) when not configured. A future improvement could re-read on each tick to pick up dashboard changes without restart.

---

## Related Documents

- [PMS Integration Spec](../04-specs/pms/index.md) — Adapter interface, config schema requirements, and sync freshness notes for new providers
- [Architecture](../03-architecture/index.md) — Kernel/adapter architecture and PMS adapter interface
