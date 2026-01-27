# Component: Integration Layer

The Integration Layer connects Jack to hotel operational systems, enabling bi-directional data flow and action execution.

---

## Purpose

Abstract the complexity of diverse hotel systems (PMS, POS, housekeeping, etc.) behind a unified interface, allowing Jack to read guest data and execute hospitality actions without knowing the specifics of each vendor's implementation.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INTEGRATION SERVICE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    INTEGRATION MANAGER                               │   │
│  │                                                                      │   │
│  │  • Adapter registration & lifecycle                                 │   │
│  │  • Connection pooling                                               │   │
│  │  • Health monitoring                                                │   │
│  │  • Sync scheduling                                                  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SYSTEM ADAPTERS                                  │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐│   │
│  │  │                    PMS ADAPTERS                                  ││   │
│  │  │                                                                  ││   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        ││   │
│  │  │  │  Opera   │  │   Mews   │  │Cloudbeds │  │  Generic │        ││   │
│  │  │  │  Cloud   │  │          │  │          │  │   HTNG   │        ││   │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        ││   │
│  │  └─────────────────────────────────────────────────────────────────┘│   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐│   │
│  │  │                 OPERATIONAL ADAPTERS                             ││   │
│  │  │                                                                  ││   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                       ││   │
│  │  │  │Housekeep │  │Maintenan │  │   POS    │                       ││   │
│  │  │  │  (Optii) │  │   ce     │  │ (Micros) │                       ││   │
│  │  │  └──────────┘  └──────────┘  └──────────┘                       ││   │
│  │  └─────────────────────────────────────────────────────────────────┘│   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SYNC ENGINE                                      │   │
│  │                                                                      │   │
│  │  • Scheduled pulls (reservations, room status)                      │   │
│  │  • Event-driven updates (webhooks from PMS)                         │   │
│  │  • Conflict resolution                                              │   │
│  │  • Data transformation                                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ACTION EXECUTOR                                  │   │
│  │                                                                      │   │
│  │  • Task creation (housekeeping, maintenance)                        │   │
│  │  • Reservation updates                                              │   │
│  │  • Guest profile updates                                            │   │
│  │  • Charge posting                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Interface

All system adapters implement a common interface:

```typescript
interface SystemAdapter {
  // Identity
  systemType: SystemType;
  vendorName: string;

  // Lifecycle
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Capabilities
  getCapabilities(): SystemCapabilities;
}

interface PMSAdapter extends SystemAdapter {
  // Guests
  getGuest(identifier: GuestIdentifier): Promise<Guest | null>;
  searchGuests(query: GuestQuery): Promise<Guest[]>;
  updateGuestProfile(guestId: string, updates: GuestUpdate): Promise<void>;

  // Reservations
  getReservation(confirmationNumber: string): Promise<Reservation | null>;
  getArrivals(date: Date): Promise<Reservation[]>;
  getDepartures(date: Date): Promise<Reservation[]>;
  getInHouseGuests(): Promise<Reservation[]>;

  // Room Status
  getRoomStatus(roomNumber: string): Promise<RoomStatus>;
  getAllRoomStatuses(): Promise<RoomStatus[]>;

  // Actions
  addReservationNote(confirmationNumber: string, note: string): Promise<void>;
  updateCheckoutTime(confirmationNumber: string, time: Date): Promise<void>;
  postCharge(confirmationNumber: string, charge: Charge): Promise<void>;
}

interface HousekeepingAdapter extends SystemAdapter {
  // Tasks
  createTask(task: HousekeepingTask): Promise<string>;
  getTask(taskId: string): Promise<HousekeepingTask>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;

  // Room Status
  getRoomCleaningStatus(roomNumber: string): Promise<CleaningStatus>;
  updateRoomStatus(roomNumber: string, status: CleaningStatus): Promise<void>;
}

interface MaintenanceAdapter extends SystemAdapter {
  createWorkOrder(order: WorkOrder): Promise<string>;
  getWorkOrder(orderId: string): Promise<WorkOrder>;
  updateWorkOrderStatus(orderId: string, status: WorkOrderStatus): Promise<void>;
}
```

---

## Data Models

### Unified Guest Model

```typescript
interface Guest {
  // Identity
  id: string;                    // Jack internal ID
  externalIds: {
    pms?: string;
    loyalty?: string;
  };

  // Contact
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;

  // Profile
  language: string;
  loyaltyTier?: string;
  vipStatus?: string;

  // Preferences (synced + learned)
  preferences: Preference[];

  // History
  stayCount: number;
  totalRevenue: number;
  lastStay?: Date;
}

interface Preference {
  category: 'room' | 'dining' | 'communication' | 'amenity';
  key: string;
  value: string;
  source: 'pms' | 'learned' | 'stated';
  confidence: number;
}
```

### Unified Reservation Model

```typescript
interface Reservation {
  // Identity
  id: string;
  confirmationNumber: string;
  externalId: string;

  // Guest
  guestId: string;
  guestName: string;

  // Stay Details
  propertyId: string;
  roomNumber?: string;
  roomType: string;
  arrivalDate: Date;
  departureDate: Date;

  // Status
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

  // Timing
  estimatedArrival?: Date;
  actualArrival?: Date;
  estimatedDeparture?: Date;
  actualDeparture?: Date;

  // Financial
  rateCode: string;
  totalRate: number;
  balance: number;

  // Notes
  specialRequests: string[];
  notes: ReservationNote[];
}
```

---

## PMS Integrations

### Oracle Opera Cloud

```typescript
class OperaCloudAdapter implements PMSAdapter {
  private client: OperaAPIClient;

  async connect(config: ConnectionConfig): Promise<void> {
    this.client = new OperaAPIClient({
      hostname: config.hostname,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      hotelId: config.hotelId
    });
    await this.client.authenticate();
  }

  async getGuest(identifier: GuestIdentifier): Promise<Guest | null> {
    const operaGuest = await this.client.getProfile(identifier);
    return operaGuest ? this.mapToGuest(operaGuest) : null;
  }

  async getArrivals(date: Date): Promise<Reservation[]> {
    const reservations = await this.client.getReservations({
      arrivalDate: date,
      reservationStatuses: ['RESERVED', 'DUE_IN']
    });
    return reservations.map(r => this.mapToReservation(r));
  }

  private mapToGuest(opera: OperaProfile): Guest {
    return {
      id: `opera:${opera.profileId}`,
      externalIds: { pms: opera.profileId },
      firstName: opera.name.first,
      lastName: opera.name.last,
      email: opera.emails?.[0]?.email,
      phone: opera.phones?.[0]?.number,
      // ... mapping continues
    };
  }
}
```

### Mews

```typescript
class MewsAdapter implements PMSAdapter {
  private connector: MewsConnector;

  async connect(config: ConnectionConfig): Promise<void> {
    this.connector = new MewsConnector({
      accessToken: config.accessToken,
      clientToken: config.clientToken,
      serviceId: config.serviceId
    });
  }

  async getInHouseGuests(): Promise<Reservation[]> {
    const reservations = await this.connector.getReservations({
      states: ['Started'],
      extent: {
        Reservations: true,
        Customers: true,
        Resources: true
      }
    });
    return this.mapReservations(reservations);
  }
}
```

### Generic HTNG/OTA

For systems supporting hospitality standards:

```typescript
class HTNGAdapter implements PMSAdapter {
  // Implements HTNG (Hotel Technology Next Generation) standard
  // Supports OTA (OpenTravel Alliance) message formats

  async getReservation(confirmationNumber: string): Promise<Reservation | null> {
    const response = await this.sendOTARequest('OTA_ReadRQ', {
      UniqueID: { Type: '14', ID: confirmationNumber }
    });
    return this.parseOTAResponse(response);
  }
}
```

---

## Sync Engine

### Sync Strategies

| Data Type | Strategy | Frequency | Direction |
|-----------|----------|-----------|-----------|
| Arrivals | Poll | Every 5 min | PMS → Jack |
| Departures | Poll | Every 5 min | PMS → Jack |
| Room Status | Poll | Every 5 min | PMS → Jack |
| Guest Profile | On-demand | Per conversation | PMS → Jack |
| Preferences | Event | Per interaction | Jack → PMS |
| Notes | Event | Per interaction | Jack → PMS |

### Sync Implementation

```typescript
class SyncEngine {
  async syncArrivals(propertyId: string): Promise<SyncResult> {
    const pmsAdapter = this.getAdapter(propertyId, 'pms');

    // Get arrivals for today and tomorrow
    const today = new Date();
    const tomorrow = addDays(today, 1);

    const [todayArrivals, tomorrowArrivals] = await Promise.all([
      pmsAdapter.getArrivals(today),
      pmsAdapter.getArrivals(tomorrow)
    ]);

    const arrivals = [...todayArrivals, ...tomorrowArrivals];

    // Upsert to local database
    for (const arrival of arrivals) {
      await this.upsertReservation(arrival);
      await this.upsertGuest(arrival.guestId);
    }

    return {
      synced: arrivals.length,
      timestamp: new Date()
    };
  }

  private async upsertReservation(reservation: Reservation): Promise<void> {
    await db.reservation.upsert({
      where: { confirmationNumber: reservation.confirmationNumber },
      update: reservation,
      create: reservation
    });
  }
}
```

---

## Action Executor

### Task Creation

```typescript
class ActionExecutor {
  async createHousekeepingTask(
    propertyId: string,
    request: ServiceRequest
  ): Promise<TaskResult> {
    // Get appropriate adapter
    const adapter = this.getAdapter(propertyId, 'housekeeping');

    // Map to system-specific format
    const task: HousekeepingTask = {
      roomNumber: request.roomNumber,
      taskType: this.mapTaskType(request.type),
      priority: this.mapPriority(request.urgency),
      description: request.description,
      items: request.items,
      guestName: request.guestName
    };

    // Create in external system
    const taskId = await adapter.createTask(task);

    // Store reference locally
    await db.task.create({
      data: {
        externalId: taskId,
        propertyId,
        conversationId: request.conversationId,
        type: 'housekeeping',
        status: 'pending',
        createdAt: new Date()
      }
    });

    return { taskId, status: 'created' };
  }
}
```

### Charge Posting

```typescript
async postRoomServiceCharge(
  confirmationNumber: string,
  order: RoomServiceOrder
): Promise<ChargeResult> {
  const pmsAdapter = this.getAdapter(order.propertyId, 'pms');

  const charge: Charge = {
    amount: order.total,
    description: `Room Service - ${order.items.length} items`,
    revenueCenter: 'ROOM_SERVICE',
    reference: order.orderId
  };

  await pmsAdapter.postCharge(confirmationNumber, charge);

  return { success: true, chargeId: order.orderId };
}
```

---

## Configuration

```yaml
integrations:
  pms:
    vendor: opera_cloud
    config:
      hostname: ${OPERA_HOSTNAME}
      clientId: ${OPERA_CLIENT_ID}
      clientSecret: ${OPERA_CLIENT_SECRET}
      hotelId: ${OPERA_HOTEL_ID}

  housekeeping:
    vendor: optii
    config:
      apiKey: ${OPTII_API_KEY}
      propertyId: ${OPTII_PROPERTY_ID}

  maintenance:
    vendor: internal
    config:
      # Uses internal task system

  sync:
    arrivals:
      enabled: true
      interval: 300000  # 5 minutes
    roomStatus:
      enabled: true
      interval: 300000

  retry:
    maxAttempts: 3
    backoff: exponential
    initialDelay: 1000
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Connection failure | Retry with backoff, alert after 3 failures |
| Auth expired | Auto-refresh token, re-authenticate |
| Rate limited | Queue requests, respect retry-after |
| Data validation | Log, skip record, continue sync |
| System unavailable | Use cached data, flag stale |

---

## Metrics

| Metric | Description |
|--------|-------------|
| `integration.sync.duration` | Sync job duration |
| `integration.sync.records` | Records synced |
| `integration.action.success` | Successful actions |
| `integration.action.failure` | Failed actions |
| `integration.api.latency` | External API latency |
| `integration.api.errors` | API error rate |

---

## Related

- [PMS Integration Spec](../../04-specs/integrations/pms-integration.md)
- [AI Engine Skills](ai-engine.md#skills) - Skill execution
- [Data Model](../data-model.md) - Local data storage
