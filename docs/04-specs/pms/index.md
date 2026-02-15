# PMS Integration

Property Management System adapter interface.

---

## Overview

Jack integrates with hotel PMS systems to access:
- Guest profiles
- Reservations
- Room status

Data is normalized to a common format regardless of PMS provider.

---

## Supported Providers

| Provider | App ID | Status |
|----------|--------|--------|
| Mock (Testing) | `pms-mock` | Implemented |
| Mews | `pms-mews` | Planned |
| Cloudbeds | `pms-cloudbeds` | Planned |
| Opera | `pms-opera` | Planned |
| Apaleo | `pms-apaleo` | Planned |

---

## Adapter Interface

All PMS adapters implement `PMSAdapter`:

```typescript
interface PMSAdapter {
  provider: IntegrationSource;
  testConnection(): Promise<boolean>;

  // Reservations
  getReservation(externalId: string): Promise<NormalizedReservation | null>;
  getReservationByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null>;
  searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]>;
  getModifiedReservations(since: Date): Promise<NormalizedReservation[]>;

  // Guests
  getGuest(externalId: string): Promise<NormalizedGuest | null>;
  getGuestByPhone(phone: string): Promise<NormalizedGuest | null>;
  getGuestByEmail(email: string): Promise<NormalizedGuest | null>;
  searchGuests(query: string): Promise<NormalizedGuest[]>;

  // Rooms
  getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null>;
  getAllRooms(): Promise<NormalizedRoom[]>;

  // Webhooks (optional)
  parseWebhook?(payload: unknown, headers?: Record<string, string>): Promise<PMSEvent | null>;
  verifyWebhookSignature?(payload: string, signature: string): boolean;
}
```

---

## Normalized Types

### Guest

```typescript
interface NormalizedGuest {
  externalId: string;
  source: IntegrationSource;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  language?: string;
  nationality?: string;
  loyaltyTier?: string;
  vipStatus?: string;
  preferences?: GuestPreference[];
  notes?: string;
}
```

### Reservation

```typescript
interface NormalizedReservation {
  externalId: string;
  source: IntegrationSource;
  confirmationNumber: string;
  guest: NormalizedGuest;
  roomNumber?: string;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  status: ReservationStatus;
  adults: number;
  children: number;
  rateCode?: string;
  totalRate?: number;
  currency?: string;
  specialRequests?: string[];
  notes?: string[];
}
```

### Reservation Status

| Status | Description |
|--------|-------------|
| `confirmed` | Reservation confirmed |
| `checked_in` | Guest has arrived |
| `checked_out` | Guest has departed |
| `cancelled` | Reservation cancelled |
| `no_show` | Guest did not arrive |

### Room

```typescript
interface NormalizedRoom {
  number: string;
  type: string;
  status: RoomStatus;
  floor?: string;
  currentGuestId?: string;
  currentReservationId?: string;
}
```

### Room Status

| Status | Description |
|--------|-------------|
| `vacant` | Room unoccupied |
| `occupied` | Guest in room |
| `dirty` | Needs cleaning |
| `clean` | Cleaned, not inspected |
| `inspected` | Ready for guest |
| `out_of_order` | Not available |

---

## Data Sync

Jack syncs PMS data to local database for:
- Faster lookups
- Offline capability
- Guest context building

**Sync methods:**
1. **Polling** — Periodic fetch of modified records (interval configured per PMS via `syncInterval`)
2. **Webhooks** — Real-time push from PMS

**Freshness guarantees:**

The local `reservations` table is a cache. Critical code paths (AI guest context, webchat verification) check the `syncedAt` timestamp before acting. If data is older than the provider's `stalenessThreshold`, a fresh single-record lookup is made via `getReservation()` or `getReservationByConfirmation()`. Automations run a bulk `syncReservations()` before evaluating triggers.

> **Important for new providers:** `getReservation()` and `getReservationByConfirmation()` are used by the freshness system to refresh individual stale records. These must return accurate, up-to-date data from the PMS API — not cached or batched results. Every PMS API supports single-record lookup. See [PMS Sync Freshness](../../06-roadmap/008-pms-sync-freshness.md) for full design.

---

## Webhook Events

| Event | Description |
|-------|-------------|
| `reservation.created` | New reservation |
| `reservation.updated` | Reservation changed |
| `reservation.cancelled` | Reservation cancelled |
| `guest.checked_in` | Guest arrived |
| `guest.checked_out` | Guest departed |
| `guest.updated` | Guest profile changed |
| `room.status_changed` | Room status changed |

---

## Configuration

Each PMS provider has its own config schema:

| Field | Description |
|-------|-------------|
| `apiUrl` | PMS API endpoint |
| `apiKey` | API authentication key |
| `clientId` | OAuth client ID |
| `clientSecret` | OAuth client secret |
| `propertyId` | Hotel property identifier |
| `webhookSecret` | Secret for webhook verification |
| `stalenessThreshold` | **Required.** How old cached reservation data can be (in seconds) before the system fetches fresh data from the PMS for critical operations. Default varies per provider (code fallback: 300s / 5 min). |
| `syncInterval` | **Required.** How often to poll the PMS for reservation changes (in seconds). Acts as a safety net for missed webhooks. Default varies per provider (code fallback: 900s / 15 min). |

> **Note for new providers:** Every PMS provider must include `stalenessThreshold` and `syncInterval` in its `configSchema` with sensible defaults for that provider's API rate limits and webhook reliability. If omitted, the system falls back to code defaults (5 min / 15 min), but providers should set their own. See `src/apps/pms/providers/mock.ts` as a reference.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reservations` | List reservations |
| GET | `/reservations/:id` | Get reservation |
| GET | `/reservations/arriving-today` | Today's arrivals |
| GET | `/reservations/in-house` | Current guests |

---

## Related

- [Webhooks](../api/webhooks.md) — PMS webhook handling
- [Sync Conflicts](sync-conflicts.md) — Conflict resolution (Planned)
