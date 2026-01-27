# ADR-004: PMS Integration Pattern

## Status

Proposed

## Context

Jack must integrate with Property Management Systems (PMS) to:
- Retrieve guest profiles and reservations
- Check room availability and status
- Post charges and notes
- Sync guest preferences

### PMS Landscape

| PMS | Market | API Quality | Notes |
|-----|--------|-------------|-------|
| Oracle Opera | Enterprise | Good | HTNG/REST, complex auth |
| Mews | Modern/Mid | Excellent | REST, webhooks |
| Cloudbeds | SMB | Good | REST |
| Protel | Europe | Variable | SOAP/REST |
| Clock | Europe | Good | REST |
| Custom/Legacy | Variable | Poor | Often database-direct |

### Challenges

- No universal PMS API standard (HTNG exists but adoption varies)
- Auth mechanisms differ (OAuth, API keys, certificates)
- Data models vary significantly
- Some PMS require on-premise connectors
- Rate limits and quotas differ

### Requirements

- Support at least 5 major PMS platforms at launch
- Add new PMS integrations without core changes
- Handle PMS unavailability gracefully
- Bi-directional sync with conflict resolution
- Audit trail for all PMS writes

## Decision

Implement a **PMS Adapter Pattern** with:

1. **Common PMS Interface**: Defines all operations Jack needs from any PMS
2. **Vendor Adapters**: One adapter per PMS that implements the interface
3. **Sync Engine**: Scheduled and event-driven synchronization
4. **Local Cache**: PostgreSQL stores synced data for fast access
5. **Write-Through**: Writes go to PMS first, then update local cache

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Integration Service                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              PMS Interface                       │   │
│  │                                                  │   │
│  │  getGuest() | getReservation() | postCharge()   │   │
│  │  getArrivals() | updateProfile() | ...          │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                               │
│         ┌───────────────┼───────────────┐              │
│         │               │               │              │
│         ▼               ▼               ▼              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Opera    │  │    Mews    │  │ Cloudbeds  │       │
│  │  Adapter   │  │  Adapter   │  │  Adapter   │       │
│  └────────────┘  └────────────┘  └────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

**Read Path (Guest Lookup):**
```
Request → Check Local Cache → Cache Hit? → Return
                                  ↓ No
                           Fetch from PMS
                                  ↓
                           Update Cache
                                  ↓
                              Return
```

**Write Path (Post Note):**
```
Request → Validate → Write to PMS → Success? → Update Cache → Return
                                       ↓ No
                                   Return Error
```

**Sync Path (Arrivals):**
```
Scheduler (every 5 min) → Fetch Arrivals from PMS
                               ↓
                        Compare with Cache
                               ↓
                        Upsert Changes
                               ↓
                        Emit Events (new arrivals)
```

## Consequences

### Positive

- **Extensibility**: New PMS added by implementing interface
- **Testability**: Adapters can be mocked for testing
- **Resilience**: Local cache allows operation during PMS outage
- **Performance**: Most reads served from cache
- **Consistency**: Write-through ensures PMS is source of truth
- **Flexibility**: Sync frequency configurable per data type

### Negative

- **Eventual consistency**: Cache may be slightly stale
- **Adapter maintenance**: Each PMS requires ongoing maintenance
- **Complexity**: More moving parts than direct integration
- **Data mapping**: Must map diverse PMS models to common format

### Risks

- PMS API changes breaking adapters - mitigate with versioning and monitoring
- Cache staleness causing issues - mitigate with short TTLs and manual refresh
- Write conflicts - mitigate with optimistic locking where supported

## Alternatives Considered

### Option A: Direct PMS Access (No Abstraction)

Each feature directly calls PMS APIs.

- **Pros**: Simpler initial implementation, full access to PMS features
- **Cons**: PMS logic scattered throughout codebase, hard to add new PMS, no resilience

### Option B: Third-Party Integration Platform

Use Hapi, Mews Marketplace, or similar hospitality integration platforms.

- **Pros**: Pre-built connectors, maintained by others
- **Cons**: Additional cost, dependency on third party, may not cover all needed operations, data privacy concerns

### Option C: Database-Level Integration

Connect directly to PMS databases (where possible).

- **Pros**: Real-time data, no API limitations
- **Cons**: Security concerns, tight coupling, not supported by cloud PMS, maintenance nightmare

## Implementation Notes

### Phase 1 (Launch)
- Opera Cloud adapter
- Mews adapter
- Cloudbeds adapter

### Phase 2
- Protel adapter
- Generic HTNG adapter
- Webhook receivers for real-time updates

### Phase 3
- On-premise connector for legacy systems
- Custom adapter toolkit for hotels with unique PMS

## References

- [Integration Layer Component](../c4-components/integration-layer.md)
- [PMS Integration Spec](../../04-specs/integrations/pms-integration.md)
- [HTNG Specifications](https://www.htng.org/)
