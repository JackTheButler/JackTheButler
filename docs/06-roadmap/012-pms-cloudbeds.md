# PMS Adapter: Cloudbeds

> Phase: Planned
> Status: Not Started
> Priority: High
> Depends On: [PMS Provider Adapters](./009-pms-providers.md), [PMS Sync Freshness](./008-pms-sync-freshness.md)

## Overview

Detailed implementation spec for the Cloudbeds PMS adapter (`pms-cloudbeds`), Phase 2 of the PMS provider rollout. Cloudbeds is the leading all-in-one PMS for independent hotels, boutique properties, and hostels — Jack's primary target segment. The adapter gives hotels on Cloudbeds real-time reservation and guest sync via API key authentication and HTTP webhooks.

## Goals

1. **Market coverage** — Hotels running Cloudbeds can connect Jack without custom code or professional services
2. **Full interface coverage** — Passes the same 10-point integration test suite as the Mews adapter; staff and guests see identical functionality regardless of PMS
3. **Webhook-first** — Real-time event delivery via Cloudbeds webhooks, with polling as safety net
4. **Conservative by default** — Sensible `stalenessThreshold` and `syncInterval` defaults that respect Cloudbeds' 200 req/min rate limit out of the box

---

## Why Cloudbeds for Phase 2

| Consideration | Assessment |
|---------------|------------|
| Market fit | #1 PMS for independent hotels and boutique properties — Jack's core segment |
| Auth simplicity | API key auth (simpler than Mews's dual-token model; no token refresh required) |
| Webhook delivery | HTTP POST with thin ID payloads — simpler than Mews's WebSocket; adapter fetches full data after event |
| API design | Standard REST (GET), well-documented at `developers.cloudbeds.com` |
| Rate limit | 200 req/min — tighter than Mews (1000), but manageable with conservative polling defaults |
| Marketplace integration | Cloudbeds Marketplace provides a standardized connection flow for technology partners |

> **Note on OAuth:** The v1.3 spec defines two fully supported security schemes: `api_key` (`x-api-key` header) and `OAuth2` (authorization code flow). API keys are the recommended method for new Technology Partner integrations per the Cloudbeds developer portal — they require no token refresh and are simpler to operate. OAuth 2.0 remains available and is not deprecated; OPERA and Apaleo in later phases will build the OAuth refresh infrastructure when it is actually needed.

---

## Architecture

### Where It Lives

```
src/apps/pms/providers/
├── mock.ts           # Reference implementation
├── mews.ts           # Phase 1 — complete
└── cloudbeds.ts      # Phase 2 — this document
```

`src/apps/pms/providers/cloudbeds.ts` exports:
- `CloudbedsPMSAdapter` — implements `PMSAdapter`
- `cloudbedsManifest` — `PMSAppManifest` with `configSchema` and `createAdapter` factory
- `createCloudbedsAdapter()` — factory function registered in `src/apps/pms/index.ts`

### How It Connects

```
Dashboard: Apps → PMS → Cloudbeds
    ↓ operator enters API key + property ID
app_configs stores encrypted { clientId, apiKey, propertyId }
    ↓
AppRegistry.activate('pms-cloudbeds', config)
    ↓
manifest.createAdapter(config) → CloudbedsPMSAdapter
    ↓ x-api-key header on every call
CloudbedsClient.request() → Cloudbeds REST API (https://api.cloudbeds.com/api/v1.3/)
    ↓
PMSSyncService reads via getActivePMSAdapter()  →  reservations table (local cache)

Cloudbeds webhook POST → /api/v1/webhooks/pms
    → parseWebhook() → thin PMSEvent (only IDs)
    → adapter fetches full reservation/guest/room → PMSSyncService upsert
```

### Key Differences from Mews

| Aspect | Mews | Cloudbeds |
|--------|------|-----------|
| Auth | ClientToken + AccessToken in request body | Single API key in `x-api-key` header |
| Token lifetime | Tokens don't expire | API key doesn't expire |
| Token refresh | Not needed | Not needed |
| API style | RPC (all POST, typed payloads) | REST (GET with query params) |
| API base URL | `https://api.mews.com/api/connector/v1` | `https://api.cloudbeds.com/api/v1.3` |
| Webhooks | WebSocket (persistent, adapter-managed) | HTTP POST to Jack's webhook URL |
| Webhook registration | API call during `testConnection()` | API call via `postWebhook` endpoint |
| Webhook payload | Full event data | Thin (IDs only — must fetch full data) |
| Webhook signature | HMAC-SHA256 | Not documented — treat all payloads as untrusted until fetched |
| Rate limit | 1000 req/min | 200 req/min |
| Pagination | Cursor-based | Offset-based (`pageNumber` + `pageSize`, max 100) |
| Service discovery | Must discover ServiceId at connect | Not needed; `propertyId` set by operator |
| Reservation statuses | 5 statuses | 6 statuses (includes `not_confirmed`) |

---

## Core Concepts

### API Key Authentication

Cloudbeds uses a single API key delivered via their Marketplace authorization flow. Unlike Mews's dual-token model, there is no expiry and no refresh cycle.

**API key delivery (two options):**

**Option A — Marketplace redirect (for registered technology partners):**
1. Hotel admin navigates to Cloudbeds Marketplace and finds the Jack integration
2. Clicks "Connect App" and approves permissions
3. Cloudbeds redirects to Jack's pre-defined redirect URL with the API key as a query parameter
4. Jack stores the key encrypted in `app_configs`

**Option B — Manual entry (for self-hosted deployments):**
1. Hotel admin creates a developer app in their Cloudbeds account
2. Copies the generated API key
3. Pastes it into **Apps → PMS → Cloudbeds → API Key** in the Jack dashboard

For self-hosted deployments (Jack's primary model), Option B is the default. The `clientId` field in the config schema is optional — used only by hotels that want to register Jack as a Marketplace partner app.

**Authentication in requests:**

Every `CloudbedsClient` request includes:
```
x-api-key: {apiKey}
```

No token refresh logic is needed. If the API key is revoked, `testConnection()` returns `false` and the dashboard prompts re-entry.

> **`getGuest` lookup constraint:** The `/getGuest` endpoint only accepts `guestID` or `reservationID` — it cannot search by phone or email. `getGuestByPhone()` and `getGuestByEmail()` must use `/getGuestList` with the `guestPhone`/`guestEmail` query params to find the `guestID`, then call `/getGuest` for the full profile if needed. In practice, `getGuestList` returns enough fields for most use cases without a second call.

**Required scopes** (requested at Marketplace connect time):
- `read:reservation`
- `read:guest`
- `read:room`

No write scopes are requested or needed for Phase 2.

### Cloudbeds REST API Client

The `CloudbedsClient` helper inside `cloudbeds.ts` wraps all HTTP calls with:

- **Auth injection** — `x-api-key` header on every request
- **Rate limit handling** — tracks 200 req/min limit; backs off with exponential delay on 429; logs warnings; fails after `MAX_RETRIES = 3`
- **Retry logic** — retries on 5xx and network timeouts; no retry on 4xx except 429
- **Pagination** — `fetchPaginated()` iterates `pageNumber` from 1 until `count < pageSize` (all items returned)
- **Instrumentation** — all calls wrapped with `this.appLog = createAppLogger('pms', 'pms-cloudbeds')`

**Base URL:** `https://api.cloudbeds.com/api/v1.3`

**Endpoints used:**

| Method | Endpoint | Used for |
|--------|----------|---------|
| GET | `/getReservations` | `searchReservations()`, `getModifiedReservations()` |
| GET | `/getReservation` | `getReservation()`, `getReservationByConfirmation()` — see limitation below |
| GET | `/getGuestList` | `searchGuests()`, `getGuestByPhone()`, `getGuestByEmail()` |
| GET | `/getGuest` | `getGuest()` (by `guestID` or `reservationID` only) |
| GET | `/getRooms` | `getAllRooms()`, `getRoomStatus()` |
| POST | `/postWebhook` | subscribe to events during `testConnection()` |
| GET | `/getWebhooks` | verify subscriptions during `testConnection()` |

**Pagination pattern:**
```
GET /getReservations?pageNumber=1&pageSize=100&...
→ { success: true, count: 100, total: 347, data: [...] }
GET /getReservations?pageNumber=2&pageSize=100&...
→ { success: true, count: 100, total: 347, data: [...] }
GET /getReservations?pageNumber=3&pageSize=100&...
→ { success: true, count: 47, total: 347, data: [...] }  ← count < pageSize → done
```

> **Confirmation number strategy:** Cloudbeds has no API to look up a reservation by guest-facing booking number. However, Jack's local `reservations` table stores `confirmationNumber` with a unique index, so the service layer resolves confirmation number lookups from the local cache — no API call needed. The adapter's `getReservationByConfirmation()` is only a fallback for cache misses, where only the internal `reservationID` is available anyway, so it delegates to `getReservation()`.
>
> What matters is what gets stored as `confirmationNumber` during sync. The adapter stores `thirdPartyIdentifier` when present (the OTA reference guests receive from Booking.com, Expedia, etc.), falling back to `reservationID` for direct bookings. This means OTA booking references are fully searchable locally. The fallback path (`getReservationByConfirmation()` → `getReservation()`) is only reached for reservations not yet in the local cache.

> **`getRooms` page size:** The `getRooms` endpoint defaults to `pageSize=20` (vs 100 for reservations/guests). Always pass `pageSize=100` explicitly when paginating rooms to avoid unnecessary round trips.

### Reservation Normalization

Key field mappings from Cloudbeds response to `NormalizedReservation`:

| `NormalizedReservation` field | Cloudbeds source | Notes |
|-------------------------------|------------------|-------|
| `externalId` | `reservationID` | Cloudbeds internal ID |
| `confirmationNumber` | `thirdPartyIdentifier` ?? `reservationID` | OTA reference when present; internal ID for direct bookings |
| `guest` | `guestList[guestID]` via `includeGuestsDetails=true` | Main guest only |
| `roomNumber` | `assigned[0].roomName` | First assigned room |
| `roomType` | `assigned[0].roomTypeName` | |
| `arrivalDate` | `startDate` | ISO date |
| `departureDate` | `endDate` | ISO date |
| `status` | `status` | See mapping table below |
| `adults` | `assigned[0].adults` | |
| `children` | `assigned[0].children` | |
| `totalRate` | `total` | |
| `specialRequests` | guest `specialRequests` | From guest detail, plain text |

### Status Mapping

Cloudbeds uses 6 reservation statuses vs Jack's 5 canonical values:

| Jack `ReservationStatus` | Cloudbeds `status` | Notes |
|--------------------------|---------------------|-------|
| `confirmed` | `confirmed` | |
| `confirmed` | `not_confirmed` | Mapped to `confirmed` — tentative/pending booking; no separate status in Jack |
| `checked_in` | `checked_in` | |
| `checked_out` | `checked_out` | |
| `cancelled` | `canceled` | Note Cloudbeds uses American spelling |
| `no_show` | `no_show` | |

`not_confirmed` is a common state for OTA bookings awaiting confirmation. Mapping it to `confirmed` is conservative and safe — it shows in Jack's guest list without a separate "pending" state. If a distinct state is needed in future, it requires a schema change to the canonical `ReservationStatus` type, which is out of scope.

Cloudbeds room status is inferred from `roomBlocked`:

| Jack `RoomStatus` | Cloudbeds field | Condition |
|-------------------|-----------------|-----------|
| `occupied` | `roomBlocked: true` | Room has an active stay for the query date range |
| `vacant` | `roomBlocked: false` | Room is available for the query date range |

> **Limitation:** Cloudbeds' `getRooms` API expresses availability relative to a date range query, not a real-time housekeeping status. There is no direct equivalent to Mews's `dirty`/`clean`/`maintenance` room states. All rooms return as `occupied` or `vacant`. The `maintenance` status can only be inferred from a `roomBlocked` reason (not exposed in the API at v1.3). This is a known gap — staff must check Cloudbeds directly for housekeeping status.

### Webhook Integration

Cloudbeds delivers webhooks as HTTP POST to Jack's endpoint. Events use an `object/action` naming convention.

**Jack's webhook URL:** `/api/v1/webhooks/pms` (existing route, dispatches to `parseWebhook()`)

**Webhook registration:**

Subscriptions are created via the Cloudbeds API during `testConnection()`. Jack subscribes to each relevant event separately:

```
POST /postWebhook
Content-Type: application/x-www-form-urlencoded

object=reservation&action=created&endpointUrl=https://{host}/api/v1/webhooks/pms
```

The response includes a `subscriptionID` stored in `app_configs` so duplicates can be avoided on reconnect.

**Event types handled:**

| Cloudbeds event (`object/action`) | Jack `PMSEventType` |
|-----------------------------------|---------------------|
| `reservation/created` | `RESERVATION_CREATED` |
| `reservation/status_changed` | `RESERVATION_UPDATED` |
| `reservation/dates_changed` | `RESERVATION_UPDATED` |
| `reservation/accommodation_changed` | `RESERVATION_UPDATED` |
| `reservation/accommodation_type_changed` | `RESERVATION_UPDATED` |
| `reservation/deleted` | `RESERVATION_CANCELLED` |
| `guest/details_changed` | `GUEST_UPDATED` |
| `guest/created` | `GUEST_UPDATED` |

Events not in this list are logged and dropped.

**Thin payload model:**

Cloudbeds webhook payloads contain only identifiers, not full objects:

```json
{
  "version": "1.0",
  "event": "reservation/status_changed",
  "timestamp": 1611758157.431234,
  "propertyID": 12345,
  "propertyID_str": "12345",
  "reservationID": "31415926"
}
```

The adapter's `parseWebhook()` returns a `PMSEvent` with the IDs, and the caller (`PMSSyncService`) fetches the full `NormalizedReservation` via `getReservation(reservationID)`. This is the standard Cloudbeds webhook pattern and is expected.

**Signature verification:**

Cloudbeds does not document an HMAC signing mechanism for webhooks at v1.3. The adapter's `verifyWebhookSignature()` returns `true` unconditionally (with a warning log). As a mitigation:
- The fetched reservation is always validated against the operator's `propertyId` before upsert
- The webhook handler requires the correct Cloudbeds `propertyID` in the payload body to match config

If Cloudbeds adds signature verification in a future API version, the method can be updated without changing the interface.

**Delivery guarantees:**

Cloudbeds retries failed webhooks up to 5 times with 1-minute delays. Responses taking >2 seconds are treated as failures even with a 200 status code. Jack's webhook handler must respond within 1 second — acknowledge receipt immediately and process asynchronously.

---

## Security

- **API key storage** — The `apiKey` is stored encrypted in `app_configs` using `ENCRYPTION_KEY`. It is never logged or included in error messages (enforced via `AppLogError`).
- **Scope minimization** — Only `read:reservation`, `read:guest`, `read:room` scopes are requested. No write access.
- **Webhook property validation** — Despite no HMAC signature, the `propertyID` in every webhook payload must match the configured `propertyId`. Mismatched payloads are rejected 401.
- **Webhook fast-path** — Handler acknowledges within 1 second; full processing is async. This prevents Cloudbeds from treating slow handlers as failures and re-delivering.
- **No token logging** — `CloudbedsClient` error paths must be audited to confirm API keys are stripped from all logged error strings.

---

## Admin Experience

### Setup Flow

1. **Apps → PMS** in the dashboard — select **Cloudbeds**
2. Enter **Property ID** (found in Cloudbeds → Settings → Property Info)
3. Enter **API Key** (generated in Cloudbeds → Settings → Apps & Marketplace → Developer Tools)
4. Click **Test Connection** — adapter calls `testConnection()` to verify credentials and auto-subscribes webhooks
5. Dashboard shows **Connected** + initial sync starts
6. Copy the Jack webhook URL shown in the dashboard and configure it in Cloudbeds → Settings → Webhooks

### Configuration Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `apiKey` | password | yes | — | Cloudbeds API key from developer tools or Marketplace |
| `propertyId` | text | yes | — | Cloudbeds property ID |
| `clientId` | text | no | — | OAuth/Marketplace client ID (only needed for Marketplace partner apps) |
| `webhookSubscriptionIds` | text | no | — | Comma-separated subscription IDs stored after `testConnection()`; not user-editable |
| `stalenessThreshold` | number | no | 300 | Seconds before a cached reservation is considered stale |
| `syncInterval` | number | no | 600 | Seconds between background polling cycles (higher default respects 200 req/min limit) |

---

## Known Limitations

These are gaps between the Cloudbeds v1.3 API and the `PMSAdapter` interface. Each is a deliberate, documented no-op — not a silent bug.

### Normalized Type Fields That Cannot Be Populated

| Field | Type | Reason |
|-------|------|--------|
| `NormalizedGuest.language` | always `undefined` | No language field in Cloudbeds guest profile |
| `NormalizedGuest.loyaltyTier` | always `undefined` | Not in v1.3 API |
| `NormalizedGuest.vipStatus` | always `undefined` | Not in v1.3 API |
| `NormalizedGuest.preferences` | mapped from `specialRequests` as single entry | Cloudbeds stores a plain text string, not structured `{category, value}[]`; mapped as `{ category: 'request', value: specialRequests }` when non-empty |
| `NormalizedReservation.currency` | always `undefined` | Not included in the reservation response |
| `NormalizedReservation.rateCode` | always `undefined` | No direct equivalent in response schema |
| `NormalizedReservation.notes` | always `undefined` | No reservation-level notes field in v1.3 |
| `NormalizedRoom.floor` | always `undefined` | Not exposed in `getRooms` response |
| `NormalizedRoom.currentGuestId` | always `undefined` | `getRooms` has no occupancy data, only `roomBlocked` boolean |
| `NormalizedRoom.currentReservationId` | always `undefined` | Same reason |
| `NormalizedRoom.status` dirty/clean/inspected/out_of_order | never emitted | No housekeeping state in v1.3; only `occupied`/`vacant` |

### Multi-Room Reservations

Cloudbeds reservations can have multiple rooms in the `assigned[]` array. `NormalizedReservation` has a single `roomNumber`/`roomType`. The adapter maps only `assigned[0]` — the primary room. Additional rooms are silently dropped. For hotels with multi-room reservations this means secondary rooms won't appear in Jack's room assignment data. This is acceptable for Phase 2 (most independent hotels have single-room bookings).

### `searchReservations()` with Phone or Email

`getReservations` has no phone or email filter. When `ReservationQuery` includes `guestPhone` or `guestEmail`, the adapter makes two API calls: `getGuestList?guestPhone=X` to resolve `guestID`, then `getReservations?guestID=X`. Against the 200 req/min limit this counts as 2 calls per search.

### `searchGuests()` Free-Text Name Search

`getGuestList` has separate `guestFirstName` and `guestLastName` params, no combined free-text field. The adapter splits the input string on the last space (`"John Smith"` → `lastName=Smith`), falls back to `guestFirstName` for single-word queries. Multi-word names with unusual structures (e.g. `"Mary Jane Watson"`) may return no results or partial results.

### `getModifiedReservations()` May Miss Changes

The Cloudbeds v1.3 spec explicitly notes: *"Some reservation modifications may not be reflected in this timestamp."* Polling `getReservations?modifiedFrom=` is not a reliable full-coverage sync. Webhooks are the primary sync mechanism for Cloudbeds — polling is a safety net only. Hotels that cannot configure webhooks will have eventually-consistent data with potential gaps.

### `getRoomStatus()` Fetches All Rooms

No single-room lookup endpoint exists. `getRoomStatus(roomNumber)` fetches all rooms paginated and filters client-side. For a 200-room hotel this is 2 API calls. Acceptable for occasional lookups; avoid calling in tight loops.

### `room.status_changed` Event Never Emitted

The `PMSEventType.room.status_changed` event requires real-time housekeeping state, which Cloudbeds does not expose via the standard webhook subscription API. The adapter will never emit this event type. Consumers that depend on room status changes from a Cloudbeds property must poll `getAllRooms()` instead.

---

## What's NOT in Scope

- **Marketplace registration** — Registering Jack as a Cloudbeds Marketplace partner app requires manual steps with Cloudbeds. The adapter supports manual API key entry for self-hosted hotels without a Marketplace listing.
- **OAuth 2.0 flow** — Both auth methods are supported by the v1.3 API, but API keys are simpler for self-hosted deployments and are the recommended method for new integrations. OAuth is not implemented in this phase.
- **Room housekeeping status** — `dirty`/`clean`/`maintenance` states are not exposed in the Cloudbeds REST API at v1.3. Rooms return as `occupied`/`vacant` only.
- **Write operations** — Creating or modifying reservations, posting charges. All current adapter methods are read-only.
- **Multi-property** — One Jack instance, one Cloudbeds property. Multi-property is a separate future effort.
- **Cloudbeds POS/Accounting** — Cloudbeds includes POS and accounting modules. Not used in Phase 2.
- **Webhook HMAC verification** — Not documented by Cloudbeds at v1.3. If added in a future API version, update `verifyWebhookSignature()`.

---

## Data Model

No new database tables. The existing `app_configs` table stores all credentials encrypted. The `reservations`, `guests`, and `rooms` tables (populated by `PMSSyncService`) are shared across all adapters.

Confirm `'cloudbeds'` is already present in the `IntegrationSource` union type in `src/core/interfaces/pms.ts`:

```typescript
export type IntegrationSource =
  | 'mews'
  | 'cloudbeds'   // ← already present, no change needed
  | 'opera'
  | 'apaleo'
  | 'protel'
  | 'manual'
  | 'mock';
```

---

## Implementation Phases

### Phase 2a: Core Adapter

**Goal:** `CloudbedsPMSAdapter` passes `testConnection()` against a real Cloudbeds sandbox and all read methods return normalized data.

Build `src/apps/pms/providers/cloudbeds.ts` with:
- `CloudbedsClient` helper with `x-api-key` auth, rate limit handling (200 req/min), offset-based pagination, and retry (max 3)
- All 12 `PMSAdapter` interface methods implemented against `api.cloudbeds.com/api/v1.3`
- `readonly appLog = createAppLogger('pms', 'pms-cloudbeds')` with every outbound call wrapped
- Full status mapping for reservations (including `not_confirmed → confirmed`) and rooms
- Manifest with `configSchema` matching the table above
- Register in `src/apps/pms/index.ts` and `src/apps/pms/providers/index.ts`

### Phase 2b: Webhook Integration

**Goal:** Real-time reservation and guest events from Cloudbeds reach `PMSSyncService` within seconds.

Add to the adapter:
- `parseWebhook(payload, headers)` — parses thin ID payloads; maps 8 Cloudbeds event types to `PMSEvent`; validates `propertyID` matches config
- `verifyWebhookSignature()` — returns `true` with warning log (Cloudbeds provides no signing mechanism); validates `propertyID` as a mitigating control
- Webhook subscription calls inside `testConnection()` — subscribes to all 8 event types via `POST /postWebhook`; stores `subscriptionID`s in config
- Async processing: webhook handler responds 200 immediately, triggers `getReservation()` fetch for the full normalized record

### Phase 2c: Tests

**Goal:** All 10 integration test suite cases pass; unit tests cover status mapping, thin-payload fetch-on-event, pagination, and rate limit backoff.

Write:
- `tests/apps/pms/providers/cloudbeds.test.ts` — unit tests (mocked HTTP) covering:
  - All 12 adapter methods
  - All 6 status mappings (including `not_confirmed`)
  - Webhook parsing for all 8 event types
  - Thin payload → full fetch flow
  - `propertyID` mismatch rejection
  - Rate limit 429 backoff and retry
  - Pagination across multiple pages
  - `testConnection()` false on 401 API key
- Integration test notes pointing at Cloudbeds sandbox credentials (in `.env.test`, not committed)

---

## Related Documents

- [PMS Provider Adapters](./009-pms-providers.md) — overall PMS rollout strategy and integration test suite requirements
- [PMS Sync Freshness](./008-pms-sync-freshness.md) — staleness guards that consume the adapter's output
- [PMS Integration Spec](../04-specs/pms/index.md) — `PMSAdapter` interface, normalized types, config schema requirements
- [Architecture](../03-architecture/index.md) — kernel/adapter architecture and `createAppLogger` instrumentation contract
