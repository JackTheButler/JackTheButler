# PMS Provider Adapters

> Phase: Planned
> Status: Not Started
> Priority: High
> Depends On: [PMS Sync Freshness](./008-pms-sync-freshness.md)

## Overview

Jack ships with a mock PMS adapter for development. To serve real hotels, we need adapters for the top 5 cloud PMS platforms: Mews, Cloudbeds, Oracle OPERA Cloud, Apaleo, and Protel. Each adapter implements the existing `PMSAdapter` interface and maps the provider's API to Jack's normalized types.

## Goals

1. **Five production PMS adapters** — Hotels using any of the top 5 cloud PMSes can connect Jack without custom development
2. **Consistent behavior** — Every adapter passes the same integration test suite; guests and staff experience identical functionality regardless of PMS
3. **Webhook-first, polling-fallback** — Adapters that support webhooks use them as the primary sync channel, with polling as a safety net
4. **Dashboard-configurable** — Operators connect their PMS entirely through the app settings UI; no env vars or config files needed
5. **Credential security** — All PMS credentials are stored encrypted in `app_configs` using the existing `ENCRYPTION_KEY` mechanism

---

## Provider Summary

| Provider | App ID | Auth Model | Webhooks | Rate Limits | Notes |
|----------|--------|------------|----------|-------------|-------|
| Mews | `pms-mews` | Client Token + Access Token | Yes (Websockets) | 1000 req/min | API-first, excellent docs |
| Cloudbeds | `pms-cloudbeds` | OAuth 2.0 | Yes (HTTP POST) | 200 req/min | All-in-one platform, REST API |
| Oracle OPERA Cloud | `pms-opera` | OAuth 2.0 (OHIP) | Yes (HTTP POST) | Varies by contract | Enterprise, complex auth flow |
| Apaleo | `pms-apaleo` | OAuth 2.0 | Yes (HTTP POST) | 600 req/min | API-first/headless, open API |
| Protel | `pms-protel` | API Key | Limited | Varies | On-prem + cloud, Planet/Protel Air |

---

## Architecture

### Where It Lives

Each provider follows the existing app manifest pattern:

```
src/apps/pms/providers/
├── mock.ts           # Existing — reference implementation
├── mews.ts           # Phase 1
├── cloudbeds.ts      # Phase 2
├── opera.ts          # Phase 3
├── apaleo.ts         # Phase 4
└── protel.ts         # Phase 5
```

Each file exports a `manifest` (type `PMSAppManifest`) and a `createXxxAdapter()` factory function.

### How It Connects

```
Dashboard App Settings
    ↓ (operator enters credentials)
AppRegistry.activate('pms-mews', config)
    ↓
manifest.createAdapter(config)
    ↓
MewsAdapter implements PMSAdapter
    ↓
├── getReservation()              → Mews API → NormalizedReservation
├── getModifiedReservations()     → Mews API → NormalizedReservation[]
├── parseWebhook()                → Mews event → PMSEvent
└── testConnection()              → Mews API → boolean
    ↓
PMSSyncService reads via getActivePMSAdapter()
    ↓
Local reservations table (cache)
```

### Shared Infrastructure

All adapters share:

- **`PMSAdapter` interface** (`src/core/interfaces/pms.ts`) — no changes needed, already covers all required methods
- **`PMSSyncService`** (`src/services/pms-sync.ts`) — handles upsert, freshness checks, polling
- **Webhook route** (`src/gateway/routes/webhooks/pms.ts`) — dispatches to active adapter's `parseWebhook()`
- **Status mapping** — each adapter maps provider-specific statuses to `ReservationStatus`
- **`configSchema`** — each manifest declares its config fields (credentials + `stalenessThreshold` + `syncInterval`)

---

## Core Concepts

### Status Mapping

Each PMS uses different terminology for reservation states. Every adapter must map to the 5 canonical statuses:

| Jack Status | Mews | Cloudbeds | OPERA | Apaleo | Protel |
|-------------|------|-----------|-------|--------|--------|
| `confirmed` | `Confirmed` | `confirmed` | `RESERVED` | `Confirmed` | `R` (Reserved) |
| `checked_in` | `Started` | `checked_in` | `INHOUSE` | `InHouse` | `I` (In-House) |
| `checked_out` | `Processed` | `checked_out` | `CHECKEDOUT` | `CheckedOut` | `O` (Out) |
| `cancelled` | `Canceled` | `canceled` | `CANCELLED` | `Canceled` | `X` (Cancelled) |
| `no_show` | `NoShow` | `no_show` | `NOSHOW` | `NoShow` | `N` (No Show) |

Each adapter implements its own `mapStatus()` that converts provider values to `ReservationStatus`. This mapping lives inside the adapter, not in `PMSSyncService.mapReservationStatus()` — by the time data reaches the sync service, it's already normalized.

### OAuth Token Management

Cloudbeds, OPERA, and Apaleo use OAuth 2.0. Each adapter must:

1. Store refresh tokens encrypted in `app_configs`
2. Manage access token refresh automatically (before expiry)
3. Handle token revocation gracefully (prompt re-auth via dashboard)
4. Never log tokens or include them in error messages

Token refresh should be handled internally by the adapter — callers should not need to know about auth state.

### Webhook Integration

Each PMS delivers webhooks differently:

| Provider | Delivery | Signature | Registration |
|----------|----------|-----------|-------------|
| Mews | WebSocket (persistent connection) | N/A (connection-based) | API call to subscribe |
| Cloudbeds | HTTP POST | HMAC-SHA256 | Cloudbeds dashboard |
| OPERA | HTTP POST | Oracle signature | OHIP admin console |
| Apaleo | HTTP POST | HMAC-SHA256 | API call to subscribe |
| Protel | HTTP POST (if supported) | Varies | Protel config |

The existing webhook route (`/api/v1/webhooks/pms`) already dispatches to the active adapter's `parseWebhook()`. Each adapter implements:

- `parseWebhook(payload, headers)` — normalize the provider's event format to `PMSEvent`
- `verifyWebhookSignature(payload, signature)` — validate authenticity

For Mews (WebSocket-based), the adapter manages a persistent connection internally and converts incoming messages to `PMSEvent`, feeding them through the same event pipeline.

### Rate Limit Handling

Each adapter must respect its provider's rate limits:

- Track remaining quota from response headers (e.g., `X-RateLimit-Remaining`)
- Back off with exponential delay when approaching limits
- Log warnings when rate limit is hit
- Never retry indefinitely — fail after 3 attempts and let the caller handle it

The `stalenessThreshold` and `syncInterval` config fields (from 008) give operators control over how aggressively Jack calls the PMS API. Providers with strict rate limits should set higher defaults in their `configSchema`.

---

## Security

- **Credential storage** — API keys, client secrets, and OAuth tokens are stored encrypted in `app_configs` using the existing `ENCRYPTION_KEY` mechanism. Never stored in env vars or logs.
- **Webhook verification** — Every adapter that receives webhooks must verify signatures before processing. Unverified payloads are rejected with 401.
- **Token scoping** — OAuth integrations should request the minimum required scopes (read reservations, read guests, read rooms). No write access unless a future feature requires it.
- **Network isolation** — PMS API calls are outbound-only from Jack's server. No inbound access to Jack's database is granted to the PMS.

---

## Admin Experience

### Setup Steps

1. Navigate to **Apps → PMS** in the dashboard
2. Select the PMS provider from the list
3. Enter connection credentials (API key, OAuth client ID/secret, property ID)
4. Click **Test Connection** — adapter calls `testConnection()` to verify credentials
5. Optionally adjust **Staleness Threshold** and **Sync Interval** (sensible defaults pre-filled)
6. Save — Jack activates the adapter and runs an initial sync

### Configuration Fields per Provider

**Mews:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | password | yes | Mews API access token |
| `clientToken` | password | yes | Mews API client token |
| `propertyId` | text | yes | Mews enterprise (property) ID |

**Cloudbeds:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | text | yes | OAuth application client ID |
| `clientSecret` | password | yes | OAuth application client secret |
| `propertyId` | text | yes | Cloudbeds property ID |

**Oracle OPERA Cloud:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostUrl` | text | yes | OHIP gateway URL |
| `clientId` | text | yes | OAuth client ID |
| `clientSecret` | password | yes | OAuth client secret |
| `enterpriseId` | text | yes | Hotel/chain identifier |
| `username` | text | yes | Integration user |
| `password` | password | yes | Integration user password |

**Apaleo:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | text | yes | OAuth client ID |
| `clientSecret` | password | yes | OAuth client secret |
| `propertyId` | text | yes | Apaleo property ID |

**Protel:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiUrl` | text | yes | Protel API endpoint |
| `apiKey` | password | yes | API authentication key |
| `hotelId` | text | yes | Hotel identifier |

All providers also include `stalenessThreshold` (number, default varies) and `syncInterval` (number, default varies).

---

## What's NOT in Scope (Future)

- **Write operations** — Creating or modifying reservations in the PMS from Jack. All current adapter methods are read-only. Write access (e.g., posting charges, updating guest preferences) is a separate feature.
- **Multi-property support** — Each Jack instance connects to one property. Multi-property setups require one Jack instance per property (or a future multi-tenant architecture).
- **PMS migration tooling** — Switching from one PMS to another while preserving local data mappings. Operators would need to re-sync from the new PMS.
- **Custom PMS adapters** — A plugin API for hotels to write adapters for unsupported PMSes. The current approach is adding providers to Jack's codebase.

---

## Implementation Phases

Each phase delivers one fully functional PMS adapter with the same scope: reservations, guests, rooms, webhooks, and connection test.

### Phase 1: Mews

**Goal:** Hotels using Mews can connect Jack and get real-time reservation sync.

Implement `pms-mews` adapter. Mews has the cleanest API and best documentation, making it the ideal first real adapter. Includes WebSocket-based event handling for near-real-time updates. Add `'protel'` to the `IntegrationSource` type.

### Phase 2: Cloudbeds

**Goal:** Hotels using Cloudbeds can connect Jack and get reservation sync with webhook support.

Implement `pms-cloudbeds` adapter. OAuth 2.0 flow with token refresh. HTTP webhook support for real-time events.

### Phase 3: Oracle OPERA Cloud

**Goal:** Hotels using OPERA Cloud can connect Jack via the OHIP API.

Implement `pms-opera` adapter. Most complex auth model (OAuth 2.0 with OHIP gateway). Largest installed base in enterprise hospitality.

### Phase 4: Apaleo

**Goal:** Hotels using Apaleo can connect Jack with minimal configuration.

Implement `pms-apaleo` adapter. API-first design makes this the most straightforward OAuth integration. Clean REST API with strong typing.

### Phase 5: Protel

**Goal:** Hotels using Protel (Planet) can connect Jack.

Implement `pms-protel` adapter. Covers the European market. May require handling both Protel Air (cloud) and legacy on-prem API variants.

---

## Integration Test Suite

Every adapter must pass the same test suite before release:

1. `testConnection()` returns `true` with valid credentials, `false` with invalid
2. `getReservation()` returns a valid `NormalizedReservation` for a known ID
3. `getReservationByConfirmation()` returns a valid `NormalizedReservation` for a known confirmation number
4. `getModifiedReservations(since)` returns reservations modified after the given date
5. `searchReservations()` filters by arrival date, status, guest email, guest phone
6. `getGuest()`, `getGuestByPhone()`, `getGuestByEmail()` return `NormalizedGuest`
7. `getAllRooms()` returns rooms with valid `RoomStatus` values
8. `parseWebhook()` correctly normalizes provider-specific events to `PMSEvent`
9. Status mapping covers all provider statuses → 5 canonical `ReservationStatus` values
10. Rate limit handling: adapter backs off and retries on 429 responses

Tests run against a sandbox/test property for each provider.

---

## Related Documents

- [PMS Integration Spec](../04-specs/pms/index.md) — Adapter interface, normalized types, and config schema requirements
- [PMS Sync Freshness](./008-pms-sync-freshness.md) — Staleness guards that depend on adapter's `getReservation()` and `getReservationByConfirmation()`
- [Architecture](../03-architecture/index.md) — Kernel/adapter architecture
