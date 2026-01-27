# Specification: PMS Integration

Property Management System integration specification.

---

## Overview

Jack integrates with Property Management Systems to:
- Retrieve guest profiles and preferences
- Access reservation details
- Check room availability and status
- Post notes and charges
- Sync guest preferences

---

## Supported Operations

### Read Operations

| Operation | Description | Frequency |
|-----------|-------------|-----------|
| `getGuest` | Retrieve guest profile | On-demand |
| `searchGuests` | Search by name/email/phone | On-demand |
| `getReservation` | Get reservation details | On-demand |
| `getArrivals` | List arriving guests | Scheduled (5 min) |
| `getDepartures` | List departing guests | Scheduled (5 min) |
| `getInHouseGuests` | List checked-in guests | Scheduled (5 min) |
| `getRoomStatus` | Get room cleaning status | Scheduled (5 min) |

### Write Operations

| Operation | Description | Trigger |
|-----------|-------------|---------|
| `addNote` | Add note to reservation | Per conversation |
| `updatePreferences` | Update guest preferences | Per learning |
| `postCharge` | Post charge to folio | Per transaction |
| `updateCheckout` | Modify checkout time | Per request |

---

## Common Interface

```typescript
interface PMSAdapter {
  // Connection
  connect(config: PMSConfig): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Guests
  getGuest(identifier: GuestIdentifier): Promise<Guest | null>;
  searchGuests(query: GuestQuery): Promise<Guest[]>;
  updateGuestPreferences(guestId: string, prefs: Preference[]): Promise<void>;

  // Reservations
  getReservation(confirmationNumber: string): Promise<Reservation | null>;
  getArrivals(date: Date): Promise<Reservation[]>;
  getDepartures(date: Date): Promise<Reservation[]>;
  getInHouseGuests(): Promise<Reservation[]>;
  addReservationNote(confirmationNumber: string, note: string): Promise<void>;
  updateCheckoutTime(confirmationNumber: string, time: Date): Promise<void>;

  // Financials
  postCharge(confirmationNumber: string, charge: Charge): Promise<void>;
  getBalance(confirmationNumber: string): Promise<number>;

  // Room Status
  getRoomStatus(roomNumber: string): Promise<RoomStatus>;
  getAllRoomStatuses(): Promise<RoomStatus[]>;
}
```

---

## Oracle Opera Cloud

### Authentication

OAuth 2.0 with client credentials flow.

```typescript
const config = {
  hostname: 'https://hostname.hospitality.oraclecloud.com',
  clientId: process.env.OPERA_CLIENT_ID,
  clientSecret: process.env.OPERA_CLIENT_SECRET,
  hotelId: 'HOTEL01',
  scope: 'reservation profile'
};
```

Token refresh: Tokens expire in 1 hour; auto-refresh at 50 minutes.

### API Endpoints

| Operation | Endpoint |
|-----------|----------|
| Get Profile | `GET /par/v1/hotels/{hotelId}/profiles/{profileId}` |
| Search Profiles | `GET /par/v1/hotels/{hotelId}/profiles` |
| Get Reservation | `GET /rsv/v1/hotels/{hotelId}/reservations/{reservationId}` |
| Get Arrivals | `GET /rsv/v1/hotels/{hotelId}/reservations?arrivalDate={date}` |
| Post Comment | `POST /rsv/v1/hotels/{hotelId}/reservations/{id}/comments` |
| Post Charge | `POST /csh/v1/hotels/{hotelId}/postings` |

### Data Mapping

```typescript
function mapOperaGuest(opera: OperaProfile): Guest {
  return {
    id: `opera:${opera.profileId}`,
    externalIds: { pms: opera.profileId },
    firstName: opera.profileDetails.customer.personName[0].givenName,
    lastName: opera.profileDetails.customer.personName[0].surname,
    email: opera.emails?.find(e => e.primary)?.email,
    phone: opera.phones?.find(p => p.primary)?.phoneNumber,
    loyaltyTier: opera.membershipInfo?.[0]?.membershipLevel,
    preferences: mapOperaPreferences(opera.preferences)
  };
}
```

### Rate Limits

- 100 requests per minute per hotel
- Batch endpoints preferred for bulk operations

---

## Mews

### Authentication

Client token and access token pair.

```typescript
const config = {
  platformAddress: 'https://api.mews.com',
  clientToken: process.env.MEWS_CLIENT_TOKEN,
  accessToken: process.env.MEWS_ACCESS_TOKEN,
  serviceId: process.env.MEWS_SERVICE_ID
};
```

### API Endpoints

Mews uses a single endpoint with operation-based routing:

```
POST https://api.mews.com/api/connector/v1/{operation}
```

| Operation | Endpoint Operation |
|-----------|-------------------|
| Get Customers | `customers/getAll` |
| Get Reservations | `reservations/getAll` |
| Add Customer Note | `customers/addNote` |
| Post Revenue | `accountingItems/add` |

### Request Format

```json
{
  "ClientToken": "...",
  "AccessToken": "...",
  "Client": "Jack The Butler",
  "ServiceIds": ["service-id"],
  "StartUtc": "2024-01-15T00:00:00Z",
  "EndUtc": "2024-01-16T00:00:00Z",
  "States": ["Started"],
  "Extent": {
    "Reservations": true,
    "Customers": true,
    "Resources": true
  }
}
```

### Webhooks

Mews supports webhooks for real-time events:

```json
{
  "Events": [
    {
      "Type": "ReservationUpdated",
      "Id": "event-id",
      "ReservationId": "res-id"
    }
  ]
}
```

Supported events:
- `ReservationCreated`
- `ReservationUpdated`
- `ReservationCanceled`
- `CustomerCreated`
- `CustomerUpdated`

---

## Cloudbeds

### Authentication

API key authentication.

```typescript
const config = {
  baseUrl: 'https://api.cloudbeds.com/api/v1.2',
  apiKey: process.env.CLOUDBEDS_API_KEY,
  propertyId: process.env.CLOUDBEDS_PROPERTY_ID
};
```

### API Endpoints

| Operation | Endpoint |
|-----------|----------|
| Get Guest | `GET /getGuest` |
| Get Reservation | `GET /getReservation` |
| Get Arrivals | `GET /getReservations?checkInFrom={date}` |
| Get Housekeeping | `GET /getHousekeepingStatus` |
| Post Note | `POST /postReservationNote` |

### Response Format

```json
{
  "success": true,
  "data": {
    "reservationID": "12345",
    "guestFirstName": "Sarah",
    "guestLastName": "Chen",
    "checkIn": "2024-01-15",
    "checkOut": "2024-01-18",
    "roomNumber": "412",
    "status": "checked_in"
  }
}
```

---

## Sync Configuration

```yaml
pms:
  vendor: opera_cloud  # or mews, cloudbeds

  sync:
    arrivals:
      enabled: true
      schedule: "*/5 * * * *"  # Every 5 minutes
      lookAheadDays: 1

    departures:
      enabled: true
      schedule: "*/5 * * * *"
      lookAheadDays: 1

    roomStatus:
      enabled: true
      schedule: "*/5 * * * *"

    guestProfiles:
      mode: on_demand  # Don't bulk sync, fetch as needed

  cache:
    guestTTL: 3600        # 1 hour
    reservationTTL: 300   # 5 minutes
    roomStatusTTL: 60     # 1 minute

  retry:
    maxAttempts: 3
    backoff: exponential
    initialDelay: 1000
```

---

## Error Handling

### Common Errors

| Error | Handling |
|-------|----------|
| `401 Unauthorized` | Refresh token, re-authenticate |
| `404 Not Found` | Return null, log for investigation |
| `429 Rate Limited` | Queue request, respect Retry-After |
| `500 Server Error` | Retry with backoff |
| `Connection Timeout` | Retry, alert if persistent |

### Fallback Behavior

When PMS is unavailable:

1. **Read operations**: Return cached data, flag as stale
2. **Write operations**: Queue for retry, alert staff
3. **Critical operations**: Alert immediately, manual fallback

---

## Security

### Credential Storage

- API keys/secrets stored in secure vault (e.g., HashiCorp Vault)
- Never logged or exposed in errors
- Rotated quarterly

### Data Handling

- PII encrypted in transit and at rest
- Minimal data cached (what's needed for operations)
- Audit log for all PMS writes

### Network Security

- All connections over TLS 1.2+
- IP allowlisting where supported
- VPN for on-premise systems

---

## Testing

### Sandbox Environments

| PMS | Sandbox |
|-----|---------|
| Opera Cloud | Partner sandbox available |
| Mews | Demo environment |
| Cloudbeds | Test property |

### Mock Adapter

For development without PMS access:

```typescript
class MockPMSAdapter implements PMSAdapter {
  private guests = new Map<string, Guest>();
  private reservations = new Map<string, Reservation>();

  async getGuest(identifier: GuestIdentifier): Promise<Guest | null> {
    return this.guests.get(identifier.id) || null;
  }

  // ... mock implementations
}
```

---

## Related

- [Integration Layer](../../03-architecture/c4-components/integration-layer.md)
- [ADR-004: PMS Integration Pattern](../../03-architecture/decisions/004-pms-integration-pattern.md)
- [Data Model](../../03-architecture/data-model.md)
