# Automation

Event-based and time-based automation rules.

---

## Overview

The Automation Engine:
- Evaluates events against enabled rules
- Runs time-based triggers on schedule
- Executes action chains
- Handles retries for failed actions
- Logs all executions

---

## Trigger Types

### Event-Based

Triggered by system events:

| Event Type | Description |
|------------|-------------|
| `reservation.created` | New reservation |
| `reservation.checked_in` | Guest checked in |
| `reservation.checked_out` | Guest checked out |
| `reservation.cancelled` | Reservation cancelled |
| `guest.created` | New guest record |
| `task.created` | Task created |
| `task.completed` | Task completed |

### Time-Based

Triggered at specific times relative to reservation dates:

| Type | Description |
|------|-------------|
| `before_arrival` | X days/hours before arrival |
| `after_arrival` | X days/hours after arrival |
| `before_departure` | X days/hours before departure |
| `after_departure` | X days/hours after departure |

---

## Action Types

| Action | Description |
|--------|-------------|
| `send_message` | Send message to guest via channel |
| `send_email` | Send email to guest or staff |
| `create_task` | Create a task |
| `notify_staff` | Send notification to staff |
| `webhook` | Call external webhook URL |

---

## Rule Definition

```typescript
interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  triggerType: 'event_based' | 'time_based';
  triggerConfig: TriggerConfig;
  actionType: string;
  actionConfig: ActionConfig;
  actions?: ActionDefinition[];  // Chained actions
  enabled: boolean;
}
```

---

## Trigger Configuration

**Event-based:**
```json
{
  "eventType": "reservation.checked_in",
  "conditions": {
    "roomType": "suite"
  }
}
```

**Time-based:**
```json
{
  "type": "before_arrival",
  "offset": { "days": 1 },
  "time": "10:00"
}
```

---

## Action Configuration

**Send message:**
```json
{
  "template": "welcome_message",
  "channel": "whatsapp"
}
```

**Create task:**
```json
{
  "department": "housekeeping",
  "taskType": "turndown",
  "priority": "standard"
}
```

**Notify staff:**
```json
{
  "role": "manager",
  "message": "VIP guest arriving: {{guest.firstName}} {{guest.lastName}}"
}
```

---

## Execution Context

Actions have access to context:

```typescript
interface ExecutionContext {
  ruleId: string;
  ruleName: string;
  event?: AutomationEvent;
  guest?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    language?: string;
  };
  reservation?: {
    id: string;
    arrivalDate: string;
    departureDate: string;
    roomNumber?: string;
  };
}
```

---

## Template Variables

Use in message templates:

| Variable | Description |
|----------|-------------|
| `{{guest.firstName}}` | Guest first name |
| `{{guest.lastName}}` | Guest last name |
| `{{guest.email}}` | Guest email |
| `{{reservation.roomNumber}}` | Room number |
| `{{reservation.arrivalDate}}` | Arrival date |
| `{{reservation.departureDate}}` | Departure date |

---

## Retry Handling

Failed actions are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 15 minutes |

Maximum 3 retry attempts.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/automation/rules` | List all rules |
| GET | `/automation/rules/:id` | Get rule |
| POST | `/automation/rules` | Create rule |
| PATCH | `/automation/rules/:id` | Update rule |
| DELETE | `/automation/rules/:id` | Delete rule |
| POST | `/automation/rules/:id/test` | Test rule |
| GET | `/automation/rules/:id/logs` | Get execution logs |

---

## Related

- [REST API](../api/rest-api.md) — Automation endpoints
- [Channels](../channels/whatsapp.md) — Message delivery
