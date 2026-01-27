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
    maxDelay: 30000       # Cap at 30 seconds
    jitter: true          # Add randomness to prevent thundering herd
```

---

## Retry Logic

### Retry Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;       // Default: 3
  initialDelayMs: number;    // Default: 1000 (1 second)
  maxDelayMs: number;        // Default: 30000 (30 seconds)
  backoffMultiplier: number; // Default: 2 (exponential)
  jitter: boolean;           // Default: true
  retryableErrors: string[]; // HTTP status codes or error types
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', '429', '500', '502', '503', '504']
};
```

### Exponential Backoff with Jitter

```typescript
function calculateBackoff(attempt: number, config: RetryConfig): number {
  // Base delay with exponential increase
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter (0-50% of delay) to prevent thundering herd
  if (config.jitter) {
    const jitterRange = delay * 0.5;
    delay = delay + Math.random() * jitterRange;
  }

  return Math.floor(delay);
}

// Example delays for 3 attempts:
// Attempt 1: 1000ms + 0-500ms jitter = 1000-1500ms
// Attempt 2: 2000ms + 0-1000ms jitter = 2000-3000ms
// Attempt 3: 4000ms + 0-2000ms jitter = 4000-6000ms
```

### Retry Implementation

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: { operationName: string; metadata?: Record<string, any> }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryable(error, config.retryableErrors)) {
        throw error;  // Non-retryable, fail immediately
      }

      // Check if we have attempts remaining
      if (attempt === config.maxAttempts) {
        break;  // No more retries
      }

      // Calculate and wait for backoff
      const delayMs = calculateBackoff(attempt, config);

      console.warn(`Retry ${attempt}/${config.maxAttempts} for ${context.operationName} ` +
                   `after ${delayMs}ms: ${error.message}`);

      await sleep(delayMs);
    }
  }

  // All retries exhausted - send to dead letter queue
  await sendToDeadLetterQueue({
    operation: context.operationName,
    error: lastError,
    metadata: context.metadata,
    attempts: config.maxAttempts,
    failedAt: new Date()
  });

  throw lastError;
}

function isRetryable(error: Error, retryableErrors: string[]): boolean {
  // Check error code
  if ('code' in error && retryableErrors.includes(String(error.code))) {
    return true;
  }

  // Check HTTP status
  if ('status' in error && retryableErrors.includes(String(error.status))) {
    return true;
  }

  // Check for specific retryable error types
  if (error.message?.includes('timeout') || error.message?.includes('ECONNRESET')) {
    return true;
  }

  return false;
}
```

### Dead Letter Queue

When all retries are exhausted, failed operations go to a dead letter queue:

```typescript
interface DeadLetterItem {
  id: string;
  operation: string;
  payload: any;
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  status: 'pending' | 'retrying' | 'resolved' | 'abandoned';
  resolvedBy?: string;
  resolvedAt?: Date;
  notes?: string;
}

class DeadLetterQueue {
  async add(item: Omit<DeadLetterItem, 'id' | 'status'>): Promise<string> {
    const id = generateId('dlq');

    await db.deadLetterQueue.create({
      data: {
        id,
        ...item,
        status: 'pending'
      }
    });

    // Alert operations team
    await alertOps({
      type: 'dead_letter',
      operation: item.operation,
      error: item.error.message,
      itemId: id
    });

    return id;
  }

  async retry(itemId: string): Promise<void> {
    const item = await db.deadLetterQueue.findUnique({ where: { id: itemId } });

    await db.deadLetterQueue.update({
      where: { id: itemId },
      data: { status: 'retrying', lastAttemptAt: new Date() }
    });

    try {
      await replayOperation(item.operation, item.payload);
      await db.deadLetterQueue.update({
        where: { id: itemId },
        data: { status: 'resolved', resolvedAt: new Date() }
      });
    } catch (error) {
      await db.deadLetterQueue.update({
        where: { id: itemId },
        data: {
          status: 'pending',
          error: { message: error.message, code: error.code },
          attempts: item.attempts + 1
        }
      });
      throw error;
    }
  }

  async abandon(itemId: string, reason: string, staffId: string): Promise<void> {
    await db.deadLetterQueue.update({
      where: { id: itemId },
      data: {
        status: 'abandoned',
        resolvedBy: staffId,
        resolvedAt: new Date(),
        notes: reason
      }
    });
  }
}
```

### Monitoring Dead Letter Queue

```yaml
alerts:
  deadLetterQueue:
    # Alert if items accumulating
    - condition: count > 10
      severity: warning
      message: "Dead letter queue has {count} items"

    # Alert if old items not resolved
    - condition: oldest_item_age > 4h
      severity: high
      message: "Dead letter item pending for {age}"

    # Alert on specific operations
    - condition: operation == 'postCharge' && count > 0
      severity: critical
      message: "Failed charge posting in dead letter queue"
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
