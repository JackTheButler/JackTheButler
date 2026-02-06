# Conversation State Machine

Finite state machine for conversation lifecycle management.

---

## States

| State | Description |
|-------|-------------|
| `new` | Just created, no messages yet |
| `active` | AI is handling the conversation |
| `waiting` | Waiting for guest response |
| `escalated` | Handed off to human staff |
| `resolved` | Issue resolved, conversation ending |
| `closed` | Conversation archived |

---

## State Diagram

```
                    message_received
         ┌─────────────────────────────────┐
         │                                 │
         v                                 │
       ┌─────┐  message_received   ┌───────────┐
       │ new │─────────────────────│  active   │◄───┐
       └─────┘                     └───────────┘    │
                                        │           │
                         response_sent  │           │ message_received
                                        v           │
                                  ┌───────────┐     │
                                  │  waiting  │─────┘
                                  └───────────┘
                                        │
                         escalation_triggered
                                        v
                                  ┌───────────┐
                    ┌─────────────│ escalated │
                    │             └───────────┘
                    │                   │
         staff_resolved                 │ timeout
                    │                   │
                    v                   v
              ┌───────────┐      ┌───────────┐
              │ resolved  │─────▶│  closed   │
              └───────────┘      └───────────┘
                    │                   │
                    └───────────────────┘
                      message_received (reopen)
```

---

## Transitions

### From `new`
| Event | Next State |
|-------|------------|
| `message_received` | `active` |

### From `active`
| Event | Next State |
|-------|------------|
| `response_sent` | `waiting` |
| `escalation_triggered` | `escalated` |
| `guest_satisfied` | `resolved` |
| `timeout` | `closed` |

### From `waiting`
| Event | Next State |
|-------|------------|
| `message_received` | `active` |
| `escalation_triggered` | `escalated` |
| `timeout` | `closed` |

### From `escalated`
| Event | Next State |
|-------|------------|
| `staff_assigned` | `escalated` |
| `message_received` | `escalated` |
| `response_sent` | `escalated` |
| `staff_resolved` | `resolved` |
| `timeout` | `closed` |

### From `resolved`
| Event | Next State |
|-------|------------|
| `reopen` | `active` |
| `message_received` | `active` |
| `guest_satisfied` | `closed` |
| `timeout` | `closed` |

### From `closed`
| Event | Next State |
|-------|------------|
| `reopen` | `active` |
| `message_received` | `active` |

---

## Events

| Event | Description |
|-------|-------------|
| `message_received` | Guest sent a message |
| `response_sent` | AI/staff sent a response |
| `escalation_triggered` | Escalation criteria met |
| `staff_assigned` | Staff member took over |
| `staff_resolved` | Staff marked as resolved |
| `guest_satisfied` | Guest confirmed resolution |
| `timeout` | Inactivity timeout |
| `reopen` | Explicit reopen request |

---

## Helper Methods

```typescript
// Check if conversation needs staff attention
fsm.requiresStaffAttention(): boolean  // true if escalated

// Check if conversation is active
fsm.isActive(): boolean  // true if active, waiting, or escalated

// Check if conversation is closed
fsm.isTerminal(): boolean  // true if closed

// Get valid events for current state
fsm.getValidEvents(): ConversationEvent[]
```

---

## Related

- [REST API](../api/rest-api.md) — Conversation endpoints
- [Task Routing](task-routing.md) — Task creation from conversations
