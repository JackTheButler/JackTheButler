# Use Case: Review Center

> **Status: Superseded — removed.** The Review Center and its underlying approval queue were removed in May 2026. The dashboard page, API routes (`/api/v1/approvals`), DB table (`approval_queue`), and permissions (`approvals:view`, `approvals:manage`) no longer exist. Content below is retained for historical context only.

Staff review and approval of AI-proposed actions.

---

## Summary

| Attribute | Value |
|-----------|-------|
| ID | S-06 |
| Actor | Staff (managers, front desk) |
| Interface | Dashboard |
| Priority | P0 |

---

## Description

When Jack's autonomy level requires approval for certain actions, those actions are queued in the Review Center. Staff review pending items — proposed responses, task creations, and guest offers — and approve or reject them before they are executed.

This is the core human oversight mechanism that lets hotels control how much Jack does independently.

---

## User Stories

- As a manager, I want to review AI responses before they reach guests so I can ensure quality
- As front desk staff, I want to quickly approve routine actions without slowing down service
- As a manager, I want to reject inappropriate responses with a reason so Jack can improve
- As staff, I want to see conversation context when reviewing a proposed action

---

## Dashboard View

```
┌─────────────────────────────────────────────────────────────────────┐
│ REVIEW CENTER                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                           │
│ │ Pending  │  │ Approved │  │ Rejected │                           │
│ │    5     │  │   12     │  │    2     │                           │
│ └──────────┘  └──────────┘  └──────────┘                           │
│                                                                     │
│ [All] [Pending] [Approved] [Rejected]                               │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 💬 Response to Sarah Chen (Room 412) via WhatsApp    2 min ago │ │
│ │    "I'd be happy to arrange early check-in for you..."         │ │
│ │    Confidence: 92% | Intent: request.checkin.early              │ │
│ │                                          [▼ Expand] [Approve ▼]│ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📋 Task: Extra towels for Room 308                   5 min ago │ │
│ │    Department: Housekeeping | Priority: Standard                │ │
│ │                                          [▼ Expand] [Approve ▼]│ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Expanded Item with Context

```
┌─────────────────────────────────────────────────────────────────────┐
│ 💬 Response to Sarah Chen (Room 412) via WhatsApp                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ PROPOSED RESPONSE                                                   │
│ ─────────────────                                                   │
│ "I'd be happy to arrange early check-in for you! I've checked      │
│ availability and can confirm 12:00 PM check-in at no additional     │
│ charge. I've noted this on your reservation."                       │
│                                                                     │
│ CONVERSATION CONTEXT                                                │
│ ────────────────────                                                │
│ Guest: "Is early check-in possible? My flight lands at 10am"       │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │ [Approve]                                                     │   │
│ ├───────────────────────────────────────────────────────────────┤   │
│ │ Reject with reason:                                           │   │
│ │ [                                               ] [Reject]    │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Workflows

### Approve an Action

```
Staff opens Review Center
  → Sees pending items with preview
  → Expands item to view full context
  → Clicks [Approve]
  → Action is executed (response sent, task created, etc.)
  → Item moves to "Approved" tab
```

### Reject an Action

```
Staff opens Review Center
  → Expands pending item
  → Enters rejection reason
  → Clicks [Reject]
  → Action is NOT executed
  → Item moves to "Rejected" tab with reason
```

---

## Relationship to Autonomy Levels

| Autonomy Level | Review Center Behavior |
|----------------|------------------------|
| L1: Approval Required | All actions queue for review |
| L2: Autonomous | Actions execute immediately, no review needed |
| Per-action override | Individual action types can be set to L1 or L2 regardless of global level |

---

## Acceptance Criteria

- [ ] Pending items appear within seconds of AI proposing an action
- [ ] Full conversation context available for each item
- [ ] One-click approve for routine items
- [ ] Rejection requires a reason
- [ ] Approved actions execute immediately
- [ ] Stats show pending/approved/rejected counts
- [ ] Real-time updates (polling or WebSocket)

---

## Related

- [Autonomy Configuration](engine-configuration.md#autonomy-settings) - Controls what goes to review
- [Guest: Service Requests](../guest/during-stay.md#service-requests) - Source of task approvals
- [Task Management](task-management.md) - Tasks created after approval
