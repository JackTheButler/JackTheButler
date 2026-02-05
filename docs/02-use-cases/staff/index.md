# Staff Use Cases

Use cases for hotel staff interacting with Jack The Butler.

---

## Overview

Staff interact with Jack through dedicated interfaces (dashboard, mobile app, internal messaging) to:

- Manage guest conversations
- Handle escalated requests
- Access guest intelligence
- Coordinate tasks across departments

---

## Staff Roles

| Role | Primary Use Cases | Interface |
|------|-------------------|-----------|
| Front Desk Agent | Conversation management, check-in support | Dashboard, Mobile |
| Concierge | Guest requests, recommendations | Dashboard |
| Housekeeping Supervisor | Task assignment, room status | Mobile |
| Maintenance | Work orders | Mobile |
| F&B Staff | Room service, reservations | Dashboard |
| Duty Manager | Escalations, complaints | Dashboard, Mobile |
| General Manager | Analytics, high-priority escalations | Dashboard |

---

## Use Case Summary

| ID | Use Case | Priority | Status | Link |
|----|----------|----------|--------|------|
| S-01 | Conversation management | P0 | Draft | [task-management.md](task-management.md) |
| S-02 | Task assignment & tracking | P0 | Draft | [task-management.md](task-management.md#task-tracking) |
| S-03 | Guest intelligence | P1 | Draft | [guest-intelligence.md](guest-intelligence.md) |
| S-04 | Shift handoff | P2 | Planned | [task-management.md](task-management.md#shift-handoff) |
| S-05 | Response assistance | P1 | Planned | [task-management.md](task-management.md#response-assistance) |
| S-06 | Review center | P0 | Built | [review-center.md](review-center.md) |
| S-07 | Knowledge base management | P0 | Built | [knowledge-base.md](knowledge-base.md) |
| S-08 | App configuration | P0 | Built | [engine-configuration.md](engine-configuration.md) |
| S-09 | Autonomy settings | P0 | Built | [engine-configuration.md](engine-configuration.md#autonomy-settings) |
| S-10 | Automation rules | P1 | Built | [engine-configuration.md](engine-configuration.md#automation-rules) |

---

## Key Workflows

### 1. Escalation Handling

```
[Jack escalates conversation]
     │
     ▼
┌─────────────────┐
│ Notification to │
│ assigned agent  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Agent reviews   │
│ conversation    │
│ + guest profile │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Agent responds  │
│ (AI suggests)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Resolution or   │
│ further action  │
└─────────────────┘
```

### 2. Task Fulfillment

```
[Guest request via Jack]
     │
     ▼
┌─────────────────┐
│ Task created in │
│ department queue│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Staff claims or │
│ auto-assigned   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task completed  │
│ + marked done   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Jack notifies   │
│ guest           │
└─────────────────┘
```

---

## Interface Requirements

### Dashboard (Web)

- Real-time conversation list with status indicators
- Split view: conversation + guest profile
- Task queues by department
- Analytics and reports
- Configuration and settings

### Mobile App

- Push notifications for escalations
- Quick response actions
- Task claim and completion
- Guest lookup
- Offline capability for task viewing

---

## Sections

- [Task Management](task-management.md) - Conversations, tasks, handoffs
- [Guest Intelligence](guest-intelligence.md) - Profile lookup and insights
- [Review Center](review-center.md) - Approving and rejecting AI actions
- [Knowledge Base](knowledge-base.md) - Managing hotel knowledge and site scraper
- [Engine Configuration](engine-configuration.md) - Apps, autonomy, and automation rules

---

## Related

- [Guest Use Cases](../guest/) - What generates staff work
- [Operations Use Cases](../operations/) - Automated workflows
- [Architecture: Staff Interface](../../03-architecture/c4-components/gateway.md)
