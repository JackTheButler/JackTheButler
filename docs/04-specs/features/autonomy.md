# Autonomy Levels

> **Status: Superseded — removed.** The L1/L2 autonomy system and approval queue were removed in May 2026 as part of the pipeline migration. The `approval_queue` table, `src/core/approval/` modules, autonomy settings UI, and `/api/v1/approvals` + `/api/v1/settings/autonomy` routes no longer exist. Content below is retained for historical context only.

Configurable autonomy for hotel AI operations.

---

## Overview

Autonomy controls how independently Jack operates. Two levels:

| Level | Name | Behavior |
|-------|------|----------|
| **L1** | Approval Required | All actions require staff approval |
| **L2** | Auto-Execute | Actions run automatically, staff monitors |

---

## Action Types

Each action type can be configured independently:

| Action | Default | Description |
|--------|---------|-------------|
| `respondToGuest` | L2 | Send AI-generated responses |
| `createHousekeepingTask` | L2 | Create housekeeping tasks |
| `createMaintenanceTask` | L2 | Create maintenance tasks |
| `createConciergeTask` | L2 | Create concierge tasks |
| `createRoomServiceTask` | L2 | Create room service tasks |
| `issueRefund` | L1 | Issue refunds (financial) |
| `offerDiscount` | L1 | Offer discounts (financial) |
| `sendMarketingMessage` | L1 | Send marketing messages |

---

## Confidence Thresholds

| Threshold | Default | Purpose |
|-----------|---------|---------|
| `approval` | 0.7 | Above this → auto-execute allowed |
| `urgent` | 0.5 | Below this → flag as urgent |

---

## Financial Limits

Financial actions support limits:

```typescript
// Refund: auto-approve up to $50
{
  level: 'L2',
  maxAutoAmount: 50
}

// Discount: auto-approve up to 15%
{
  level: 'L2',
  maxAutoPercent: 15
}
```

---

## Settings Structure

```typescript
interface AutonomySettings {
  defaultLevel: 'L1' | 'L2';
  actions: Record<ActionType, ActionConfig>;
  confidenceThresholds: {
    approval: number;
    urgent: number;
  };
}
```

---

## Decision Logic

```
Action Request
      │
      v
┌─────────────────────┐
│  Get action config  │
└─────────┬───────────┘
          │
          v
┌─────────────────────┐     ┌──────────────┐
│  Level = L1?        │─Yes─▶│ Queue for    │
└─────────┬───────────┘     │ approval     │
          │ No              └──────────────┘
          v
┌─────────────────────┐     ┌──────────────┐
│  Has amount limit?  │─Yes─▶│ Check limit  │
└─────────┬───────────┘     └──────┬───────┘
          │ No                     │
          v                        v
┌─────────────────────┐     ┌──────────────┐
│  Auto-execute       │     │ Over limit?  │
└─────────────────────┘     │ → Approval   │
                            │ Under?       │
                            │ → Execute    │
                            └──────────────┘
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/autonomy` | Get current settings |
| PUT | `/settings/autonomy` | Update settings |

---

## Approval Queue

When L1 is configured or limits exceeded:

1. Action is queued in `approvals` table
2. Staff sees pending item in dashboard
3. Staff approves or rejects
4. If approved, action executes

---

## Related

- [REST API](../api/rest-api.md) — Autonomy & approval endpoints
- [Task Routing](task-routing.md) — Task creation with autonomy
- [WebSocket](../api/websocket.md) — Real-time approval notifications
