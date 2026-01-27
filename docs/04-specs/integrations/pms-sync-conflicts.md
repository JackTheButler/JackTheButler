# PMS Sync Conflict Resolution

This document defines how Jack handles data conflicts between local storage and the Property Management System (PMS).

---

## Overview

Jack maintains a local copy of PMS data for performance and offline resilience. Conflicts can occur when:
- Local data is modified while disconnected from PMS
- PMS data changes between sync intervals
- Multiple systems update the same record

---

## Conflict Detection

### Timestamp Comparison

Every synced record tracks modification timestamps from both sources:

```typescript
interface SyncedRecord {
  id: string;                    // Internal ID
  externalId: string;            // PMS ID
  localUpdatedAt: Date;          // Last local modification
  pmsUpdatedAt: Date;            // Last known PMS modification
  lastSyncAt: Date;              // Last successful sync
  syncStatus: SyncStatus;
}

type SyncStatus =
  | 'synced'                     // Local and PMS match
  | 'local_modified'             // Local changes pending push
  | 'pms_modified'               // PMS has newer data
  | 'conflict'                   // Both modified since last sync
  | 'sync_error';                // Last sync failed
```

### Conflict Detection Algorithm

```typescript
function detectConflict(
  local: SyncedRecord,
  pmsRecord: PMSRecord
): ConflictResult {
  const pmsModified = new Date(pmsRecord.updatedAt) > local.lastSyncAt;
  const localModified = local.localUpdatedAt > local.lastSyncAt;

  if (pmsModified && localModified) {
    return {
      type: 'conflict',
      localChanges: getChangedFields(local, local.lastSyncSnapshot),
      pmsChanges: getChangedFields(pmsRecord, local.lastSyncSnapshot),
    };
  }

  if (pmsModified) {
    return { type: 'pms_modified' };
  }

  if (localModified) {
    return { type: 'local_modified' };
  }

  return { type: 'synced' };
}
```

---

## Authority Rules

Different fields have different authoritative sources:

### Reservation Data

| Field | Authority | Rationale |
|-------|-----------|-----------|
| `guestName` | PMS | Official booking name |
| `checkInDate` | PMS | Reservation dates |
| `checkOutDate` | PMS | Reservation dates |
| `roomNumber` | PMS | Room assignment |
| `roomType` | PMS | Booked room category |
| `rateCode` | PMS | Pricing information |
| `adults` / `children` | PMS | Occupancy |
| `specialRequests` | **Merge** | Both can add |
| `status` | PMS | Booking status |
| `balance` | PMS | Financial data |

### Guest Profile Data

| Field | Authority | Rationale |
|-------|-----------|-----------|
| `name` | PMS | Legal name |
| `email` | PMS | Contact from booking |
| `phone` | PMS | Contact from booking |
| `loyaltyNumber` | PMS | Loyalty program |
| `loyaltyTier` | PMS | Loyalty status |
| `preferences` | **Merge** | Jack learns preferences |
| `notes` | **Merge** | Both can add notes |
| `tags` | **Merge** | Both can tag |
| `communicationChannel` | Local | Jack-specific |
| `lastInteraction` | Local | Jack-specific |

### Configuration

```yaml
sync:
  authority:
    # PMS is authoritative (overwrite local)
    pms_authoritative:
      - reservations.guestName
      - reservations.checkInDate
      - reservations.checkOutDate
      - reservations.roomNumber
      - reservations.status
      - guests.name
      - guests.email
      - guests.loyaltyTier

    # Local is authoritative (don't overwrite)
    local_authoritative:
      - guests.communicationChannel
      - guests.lastInteraction
      - conversations.*
      - tasks.*

    # Merge both sources
    merge_fields:
      - reservations.specialRequests
      - guests.preferences
      - guests.notes
      - guests.tags
```

---

## Conflict Resolution Strategies

### Strategy 1: PMS Wins (Default for PMS-Authoritative Fields)

```typescript
function resolvePMSWins(local: any, pms: any, field: string): any {
  // Simply use PMS value
  return pms[field];
}
```

### Strategy 2: Local Wins (For Local-Authoritative Fields)

```typescript
function resolveLocalWins(local: any, pms: any, field: string): any {
  // Keep local value, don't sync back to PMS
  return local[field];
}
```

### Strategy 3: Merge (For Additive Fields)

```typescript
function resolveMerge(
  local: any,
  pms: any,
  field: string,
  lastSync: any
): any {
  // Get baseline from last sync
  const baseline = lastSync?.[field] || [];

  // Find additions from each source
  const localAdditions = difference(local[field], baseline);
  const pmsAdditions = difference(pms[field], baseline);

  // Find removals (only PMS can remove for authoritative data)
  const pmsRemovals = difference(baseline, pms[field]);

  // Merge: baseline + local additions + pms additions - pms removals
  let merged = [...baseline, ...localAdditions, ...pmsAdditions];
  merged = difference(merged, pmsRemovals);

  // Deduplicate
  return [...new Set(merged)];
}
```

### Strategy 4: Latest Wins (Timestamp-Based)

```typescript
function resolveLatestWins(
  local: any,
  localUpdatedAt: Date,
  pms: any,
  pmsUpdatedAt: Date,
  field: string
): any {
  return pmsUpdatedAt > localUpdatedAt ? pms[field] : local[field];
}
```

### Strategy 5: Manual Resolution

For critical conflicts that can't be auto-resolved:

```typescript
interface ManualConflict {
  id: string;
  entityType: 'reservation' | 'guest';
  entityId: string;
  field: string;
  localValue: any;
  pmsValue: any;
  detectedAt: Date;
  status: 'pending' | 'resolved';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: 'local' | 'pms' | 'custom';
  customValue?: any;
}

// Alert staff to manual conflicts
async function createManualConflict(conflict: ConflictResult): Promise<void> {
  await db.manualConflicts.create({
    id: generateId('conflict'),
    ...conflict,
    status: 'pending',
    detectedAt: new Date(),
  });

  // Notify relevant staff
  await notifyStaff({
    type: 'sync_conflict',
    message: `Data conflict detected for ${conflict.entityType} ${conflict.entityId}`,
    priority: 'high',
  });
}
```

---

## Sync Process

### Normal Sync Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Jack     │     │   Sync      │     │    PMS      │
│   (Local)   │     │   Service   │     │   (Remote)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Get local changes│                   │
       │<──────────────────│                   │
       │                   │                   │
       │                   │  Fetch PMS data   │
       │                   │──────────────────>│
       │                   │                   │
       │                   │  PMS records      │
       │                   │<──────────────────│
       │                   │                   │
       │    Detect conflicts                   │
       │<──────────────────│                   │
       │                   │                   │
       │    Resolve conflicts                  │
       │<──────────────────│                   │
       │                   │                   │
       │  Apply resolved   │                   │
       │<──────────────────│                   │
       │                   │                   │
       │                   │  Push local changes
       │                   │  (if applicable)  │
       │                   │──────────────────>│
       │                   │                   │
```

### Sync Implementation

```typescript
async function syncWithPMS(): Promise<SyncResult> {
  const result: SyncResult = {
    started: new Date(),
    recordsProcessed: 0,
    conflicts: [],
    errors: [],
  };

  try {
    // 1. Fetch changes from PMS since last sync
    const lastSync = await getLastSyncTime();
    const pmsChanges = await pmsClient.getChanges(lastSync);

    // 2. Get local changes since last sync
    const localChanges = await getLocalChanges(lastSync);

    // 3. Process each PMS record
    for (const pmsRecord of pmsChanges) {
      try {
        const localRecord = await findLocalRecord(pmsRecord.id);

        if (!localRecord) {
          // New record from PMS - create locally
          await createLocalRecord(pmsRecord);
        } else {
          // Existing record - check for conflicts
          const conflict = detectConflict(localRecord, pmsRecord);

          if (conflict.type === 'conflict') {
            const resolved = await resolveConflict(localRecord, pmsRecord, conflict);
            result.conflicts.push({
              recordId: pmsRecord.id,
              resolution: resolved.strategy,
            });
          }

          await updateLocalRecord(localRecord.id, conflict.resolvedData);
        }

        result.recordsProcessed++;
      } catch (error) {
        result.errors.push({
          recordId: pmsRecord.id,
          error: error.message,
        });
      }
    }

    // 4. Push local-only changes to PMS (if supported)
    for (const localChange of localChanges) {
      if (canPushToPMS(localChange)) {
        await pmsClient.update(localChange);
      }
    }

    // 5. Update sync timestamp
    await updateLastSyncTime(new Date());

    result.completed = new Date();
    result.success = true;

  } catch (error) {
    result.success = false;
    result.error = error.message;
  }

  return result;
}
```

---

## Stale Data Handling

### During PMS Downtime

When PMS is unavailable:

```typescript
interface StaleDataPolicy {
  maxStaleAge: number;           // Max age before warning (seconds)
  criticalStaleAge: number;      // Max age before blocking (seconds)
  affectedOperations: string[];  // Operations affected by stale data
}

const STALE_DATA_POLICIES: Record<string, StaleDataPolicy> = {
  reservations: {
    maxStaleAge: 300,            // 5 minutes
    criticalStaleAge: 3600,      // 1 hour
    affectedOperations: ['check_in', 'room_change', 'billing'],
  },
  guests: {
    maxStaleAge: 900,            // 15 minutes
    criticalStaleAge: 86400,     // 24 hours
    affectedOperations: ['loyalty_lookup'],
  },
  rooms: {
    maxStaleAge: 60,             // 1 minute
    criticalStaleAge: 300,       // 5 minutes
    affectedOperations: ['room_status', 'housekeeping'],
  },
};
```

### Stale Data Indicators

```typescript
interface DataFreshness {
  lastSyncAt: Date;
  staleAge: number;              // Seconds since last sync
  status: 'fresh' | 'stale' | 'critical';
  canPerformOperation: boolean;
  warning?: string;
}

function checkDataFreshness(
  entityType: string,
  operation: string
): DataFreshness {
  const lastSync = getLastSyncTime(entityType);
  const age = (Date.now() - lastSync.getTime()) / 1000;
  const policy = STALE_DATA_POLICIES[entityType];

  let status: 'fresh' | 'stale' | 'critical' = 'fresh';
  let warning: string | undefined;
  let canPerform = true;

  if (age > policy.criticalStaleAge) {
    status = 'critical';
    warning = `Data is ${Math.round(age / 60)} minutes old. PMS sync required.`;
    if (policy.affectedOperations.includes(operation)) {
      canPerform = false;
    }
  } else if (age > policy.maxStaleAge) {
    status = 'stale';
    warning = `Data may be outdated. Last sync: ${formatRelativeTime(lastSync)}`;
  }

  return { lastSyncAt: lastSync, staleAge: age, status, canPerformOperation: canPerform, warning };
}
```

### UI Indicators

```typescript
// Dashboard shows sync status
interface SyncStatusDisplay {
  lastSync: Date;
  status: 'connected' | 'syncing' | 'stale' | 'error';
  message: string;
  nextSync?: Date;
}

// API responses include freshness header
// X-Data-Freshness: fresh|stale|critical
// X-Last-Sync: 2024-01-15T10:30:00Z
```

---

## Sync Failure Alerting

### Alert Levels

| Condition | Level | Action |
|-----------|-------|--------|
| Single sync fails | Info | Log, retry |
| 3 consecutive failures | Warning | Notify on-call |
| 5+ consecutive failures | Critical | Alert manager, dashboard banner |
| Data critically stale | Critical | Block affected operations |

### Alert Configuration

```yaml
sync:
  alerts:
    channels:
      - type: email
        recipients: ["ops@hotel.com"]
        minLevel: warning

      - type: slack
        webhook: ${SLACK_WEBHOOK}
        minLevel: critical

      - type: dashboard
        minLevel: warning

    thresholds:
      consecutiveFailures:
        warning: 3
        critical: 5

      staleData:
        warning: 300      # 5 minutes
        critical: 3600    # 1 hour
```

### Alert Implementation

```typescript
async function handleSyncFailure(error: Error, attempt: number): Promise<void> {
  const consecutiveFailures = await incrementFailureCount();

  // Log all failures
  logger.error('PMS sync failed', {
    error: error.message,
    attempt,
    consecutiveFailures,
  });

  // Check alert thresholds
  if (consecutiveFailures >= 5) {
    await sendAlert({
      level: 'critical',
      title: 'PMS Sync Critical Failure',
      message: `PMS sync has failed ${consecutiveFailures} consecutive times. Immediate attention required.`,
      context: { lastError: error.message },
    });
  } else if (consecutiveFailures >= 3) {
    await sendAlert({
      level: 'warning',
      title: 'PMS Sync Failures',
      message: `PMS sync has failed ${consecutiveFailures} times. Investigating.`,
    });
  }

  // Update dashboard status
  await updateSyncStatus({
    status: 'error',
    message: `Sync failed: ${error.message}`,
    failureCount: consecutiveFailures,
  });
}

async function handleSyncSuccess(): Promise<void> {
  const previousFailures = await getFailureCount();

  // Reset failure count
  await resetFailureCount();

  // If recovering from failures, send recovery alert
  if (previousFailures >= 3) {
    await sendAlert({
      level: 'info',
      title: 'PMS Sync Recovered',
      message: `PMS sync has recovered after ${previousFailures} failures.`,
    });
  }

  // Update dashboard status
  await updateSyncStatus({
    status: 'connected',
    message: 'Sync successful',
    lastSync: new Date(),
  });
}
```

---

## Audit Trail

All sync operations and conflict resolutions are logged:

```typescript
interface SyncAuditEntry {
  id: string;
  timestamp: Date;
  operation: 'sync' | 'conflict_resolution' | 'manual_override';
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  conflictDetails?: {
    localValue: any;
    pmsValue: any;
    resolution: string;
  };
  resolvedBy?: string;           // 'system' or staff ID
}
```

---

## Related

- [PMS Integration](pms-integration.md) - Overall PMS integration pattern
- [ADR-004: PMS Integration Pattern](../../03-architecture/decisions/004-pms-integration-pattern.md)
- [Database Schema](../database/schema.ts) - Sync status fields
