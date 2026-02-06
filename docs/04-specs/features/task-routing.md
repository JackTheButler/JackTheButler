# Task Routing

Automatic task creation from guest intents.

---

## Overview

The Task Router:
1. Receives classified intent from message processor
2. Determines if a task should be created
3. Routes to appropriate department
4. Sets priority based on intent definition
5. Checks autonomy settings for approval requirements

---

## Routing Decision

```typescript
interface RoutingDecision {
  shouldCreateTask: boolean;
  department?: string;
  taskType?: string;
  priority: 'urgent' | 'high' | 'standard' | 'low';
  description?: string;
  requiresApproval?: boolean;
}
```

---

## Task Types

| Task Type | Intents |
|-----------|---------|
| `housekeeping` | `request.housekeeping.*`, `request.dnd`, `request.laundry` |
| `maintenance` | `request.maintenance.*` |
| `room_service` | `request.room_service` |
| `concierge` | `request.concierge`, `request.transport`, `request.special_occasion` |
| `other` | `feedback.complaint`, `emergency` |

---

## Departments

| Department | Task Types |
|------------|------------|
| `housekeeping` | Room cleaning, towels, amenities, laundry |
| `maintenance` | Repairs, WiFi issues, AC, plumbing |
| `room_service` | Food and beverage orders |
| `concierge` | Bookings, transportation, arrangements |
| `front_desk` | Check-in/out, reservations, billing, security |

---

## Priority Mapping

| Priority | When Used |
|----------|-----------|
| `urgent` | Emergency situations |
| `high` | Maintenance issues, complaints, security |
| `standard` | Normal service requests |
| `low` | DND, compliments |

---

## Decision Flow

```
┌─────────────────────────┐
│   Receive Intent        │
└───────────┬─────────────┘
            │
            v
┌─────────────────────────┐
│   Confidence ≥ 0.6?     │──No──▶ Skip task
└───────────┬─────────────┘
            │ Yes
            v
┌─────────────────────────┐
│   requiresAction?       │──No──▶ Skip task
└───────────┬─────────────┘
            │ Yes
            v
┌─────────────────────────┐
│   Has department?       │──No──▶ Skip task
└───────────┬─────────────┘
            │ Yes
            v
┌─────────────────────────┐
│   Check autonomy level  │
└───────────┬─────────────┘
            │
            v
┌─────────────────────────┐
│   L1: Queue approval    │
│   L2: Auto-create task  │
└─────────────────────────┘
```

---

## Guest Context

Routing considers guest context:
- **Guest ID** — Link task to guest record
- **Room Number** — Include in task description
- **Loyalty Tier** — May affect priority
- **Language** — For task notes

---

## Related

- [Intent Taxonomy](intent-taxonomy.md) — Intent definitions
- [Autonomy](autonomy.md) — Approval requirements
- [REST API](../api/rest-api.md) — Task endpoints
