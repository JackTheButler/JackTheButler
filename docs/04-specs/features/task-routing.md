# Specification: Task Routing

Request routing, assignment, and escalation logic.

---

## Overview

Task Routing determines how guest requests flow through Jack - when to handle autonomously, when to create tasks for staff, and when to escalate conversations to human agents.

---

## Routing Decision Flow

```
Guest message received
         │
         ▼
┌─────────────────────┐
│ Classify intent     │
│ + confidence        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     Confidence < threshold
│ Check confidence    │ ─────────────────────────────► ESCALATE
└──────────┬──────────┘
           │ Confidence >= threshold
           ▼
┌─────────────────────┐     Yes
│ Is information      │ ─────────────────────────────► AI RESPONDS
│ only?               │
└──────────┬──────────┘
           │ No (action required)
           ▼
┌─────────────────────┐     Yes
│ Can AI execute      │ ─────────────────────────────► AI EXECUTES
│ autonomously?       │                                + RESPONDS
└──────────┬──────────┘
           │ No
           ▼
┌─────────────────────┐     Yes
│ Create task for     │ ─────────────────────────────► CREATE TASK
│ department?         │                                + AI RESPONDS
└──────────┬──────────┘
           │ No (requires human judgment)
           ▼
       ESCALATE
```

---

## Confidence Thresholds

### Global Threshold

Default confidence threshold for autonomous handling:

```yaml
routing:
  confidenceThreshold: 0.7  # 70%
```

### Intent-Specific Thresholds

Some intents require higher confidence:

| Intent Category | Threshold | Rationale |
|-----------------|-----------|-----------|
| `inquiry.*` | 0.7 | Standard information requests |
| `request.service.*` | 0.7 | Routine service requests |
| `request.dining.*` | 0.75 | Involves charges |
| `complaint.*` | 0.8 | Sensitive, needs accuracy |
| `request.room.change` | 0.85 | Complex, affects stay |
| `cancellation` | N/A | Always escalate |

### Configuration

```yaml
routing:
  confidenceThreshold: 0.7

  intentThresholds:
    complaint: 0.8
    request.dining: 0.75
    request.room.change: 0.85

  alwaysEscalate:
    - cancellation
    - billing_dispute
    - legal_request
```

---

## Escalation Rules

### Automatic Escalation Triggers

| Trigger | Description |
|---------|-------------|
| Low confidence | Intent confidence below threshold |
| Explicit request | Guest asks for human/manager |
| Complaint severity | High-severity complaint detected |
| Repeat issue | Same issue reported 2+ times |
| VIP guest | Guest flagged as VIP |
| Failed resolution | AI attempted but guest unsatisfied |
| Sensitive topic | Certain intents always escalate |

### Escalation Detection

```typescript
interface EscalationDecision {
  shouldEscalate: boolean;
  reason: EscalationReason;
  priority: EscalationPriority;
  suggestedAssignee?: string;
}

type EscalationReason =
  | 'low_confidence'
  | 'explicit_request'
  | 'complaint_severity'
  | 'repeat_issue'
  | 'vip_guest'
  | 'failed_resolution'
  | 'sensitive_topic';

type EscalationPriority = 'critical' | 'high' | 'normal';

function evaluateEscalation(
  message: Message,
  classification: IntentClassification,
  context: ConversationContext
): EscalationDecision {
  // Check explicit request
  if (detectHumanRequest(message.content)) {
    return {
      shouldEscalate: true,
      reason: 'explicit_request',
      priority: 'normal'
    };
  }

  // Check confidence
  const threshold = getThreshold(classification.intent);
  if (classification.confidence < threshold) {
    return {
      shouldEscalate: true,
      reason: 'low_confidence',
      priority: 'normal'
    };
  }

  // Check complaint severity
  if (classification.intent.startsWith('complaint.')) {
    const severity = assessComplaintSeverity(message, classification);
    if (severity === 'high' || severity === 'critical') {
      return {
        shouldEscalate: true,
        reason: 'complaint_severity',
        priority: severity === 'critical' ? 'critical' : 'high'
      };
    }
  }

  // Check VIP status
  if (context.guest?.vipStatus || context.guest?.loyaltyTier === 'platinum') {
    // VIP handling - lower threshold, but don't always escalate
    if (classification.confidence < threshold + 0.1) {
      return {
        shouldEscalate: true,
        reason: 'vip_guest',
        priority: 'high'
      };
    }
  }

  // Check repeat issues
  if (isRepeatIssue(context, classification.intent)) {
    return {
      shouldEscalate: true,
      reason: 'repeat_issue',
      priority: 'high'
    };
  }

  return { shouldEscalate: false, reason: null, priority: null };
}
```

---

## Task Creation

### Task Types

| Type | Department | Example |
|------|------------|---------|
| `housekeeping` | Housekeeping | Extra towels, room cleaning |
| `maintenance` | Engineering | AC not working, plumbing |
| `room_service` | F&B | Food orders |
| `concierge` | Concierge | Restaurant reservations |
| `front_desk` | Front Desk | Billing questions |
| `valet` | Valet | Car requests |
| `spa` | Spa | Appointment booking |

### Task Priority

```typescript
type TaskPriority = 'urgent' | 'high' | 'standard' | 'low';

function determineTaskPriority(
  intent: string,
  context: ConversationContext
): TaskPriority {
  // Urgency keywords
  const urgentKeywords = ['immediately', 'urgent', 'emergency', 'asap', 'now'];
  if (urgentKeywords.some(k => context.lastMessage.includes(k))) {
    return 'urgent';
  }

  // VIP guests get priority boost
  if (context.guest?.vipStatus) {
    return 'high';
  }

  // Complaint-related tasks are high priority
  if (intent.startsWith('complaint.')) {
    return 'high';
  }

  // Intent-based defaults
  const priorityMap: Record<string, TaskPriority> = {
    'complaint.maintenance': 'high',
    'complaint.cleanliness': 'high',
    'request.service.towels': 'standard',
    'request.concierge.booking': 'standard'
  };

  return priorityMap[intent] || 'standard';
}
```

### SLA by Priority

| Priority | Response SLA | Resolution SLA |
|----------|--------------|----------------|
| Urgent | 5 minutes | 15 minutes |
| High | 10 minutes | 30 minutes |
| Standard | 15 minutes | 60 minutes |
| Low | 30 minutes | 4 hours |

---

## Assignment Logic

### Department Routing

```typescript
function routeToDepartment(intent: string): Department {
  const routingMap: Record<string, Department> = {
    'request.service.towels': 'housekeeping',
    'request.service.housekeeping': 'housekeeping',
    'request.service.amenity': 'housekeeping',
    'complaint.maintenance': 'maintenance',
    'complaint.cleanliness': 'housekeeping',
    'request.dining.room_service': 'f&b',
    'request.dining.reservation': 'f&b',
    'request.concierge': 'concierge',
    'request.room.early_checkin': 'front_desk',
    'request.room.late_checkout': 'front_desk',
    'complaint.billing': 'front_desk'
  };

  // Find best match
  for (const [pattern, dept] of Object.entries(routingMap)) {
    if (intent.startsWith(pattern)) {
      return dept;
    }
  }

  // Default to front desk
  return 'front_desk';
}
```

### Staff Assignment

```typescript
interface AssignmentStrategy {
  type: 'round_robin' | 'least_busy' | 'skill_based' | 'manual';
}

async function assignTask(
  task: Task,
  strategy: AssignmentStrategy
): Promise<string | null> {
  const availableStaff = await getAvailableStaff(task.department);

  if (availableStaff.length === 0) {
    return null; // Unassigned, goes to department queue
  }

  switch (strategy.type) {
    case 'round_robin':
      return roundRobinAssign(availableStaff, task.department);

    case 'least_busy':
      return leastBusyAssign(availableStaff);

    case 'skill_based':
      return skillBasedAssign(availableStaff, task);

    case 'manual':
      return null; // Staff claims from queue

    default:
      return null;
  }
}

async function leastBusyAssign(staff: Staff[]): Promise<string> {
  const workloads = await Promise.all(
    staff.map(async (s) => ({
      staffId: s.id,
      activeCount: await getActiveTaskCount(s.id)
    }))
  );

  workloads.sort((a, b) => a.activeCount - b.activeCount);
  return workloads[0].staffId;
}
```

---

## Escalation Routing

### Escalation Targets

| Escalation Type | Primary Target | Fallback |
|-----------------|----------------|----------|
| General | Front Desk | Duty Manager |
| Complaint | Duty Manager | GM |
| VIP | Concierge Manager | Duty Manager |
| Billing | Front Desk Manager | Duty Manager |
| Emergency | Security | Duty Manager |

### Escalation Assignment

```typescript
async function assignEscalation(
  conversation: Conversation,
  decision: EscalationDecision
): Promise<string | null> {
  // Get escalation target based on reason
  const target = getEscalationTarget(decision.reason, conversation);

  // Find available staff for target role
  const staff = await getAvailableStaffByRole(
    conversation.propertyId,
    target.role
  );

  if (staff.length === 0) {
    // Try fallback
    const fallbackStaff = await getAvailableStaffByRole(
      conversation.propertyId,
      target.fallbackRole
    );

    if (fallbackStaff.length === 0) {
      // Alert on-call manager
      await alertOnCallManager(conversation, decision);
      return null;
    }

    return fallbackStaff[0].id;
  }

  // Assign to least-loaded staff member
  return leastBusyAssign(staff);
}
```

---

## Notification

### Task Notifications

```typescript
interface TaskNotification {
  taskId: string;
  type: 'created' | 'assigned' | 'due_soon' | 'overdue';
  recipientId: string;
  channels: NotificationChannel[];
  message: string;
}

async function notifyTaskCreated(task: Task): Promise<void> {
  const notifications: TaskNotification[] = [];

  // Notify assigned staff
  if (task.assignedTo) {
    notifications.push({
      taskId: task.id,
      type: 'created',
      recipientId: task.assignedTo,
      channels: ['push', 'dashboard'],
      message: `New ${task.type} request: ${task.description}`
    });
  }

  // Notify department queue
  else {
    const supervisors = await getDepartmentSupervisors(task.department);
    for (const sup of supervisors) {
      notifications.push({
        taskId: task.id,
        type: 'created',
        recipientId: sup.id,
        channels: ['push', 'dashboard'],
        message: `New unassigned ${task.type} request`
      });
    }
  }

  await sendNotifications(notifications);
}
```

### Escalation Notifications

```typescript
async function notifyEscalation(
  conversation: Conversation,
  assignedTo: string,
  decision: EscalationDecision
): Promise<void> {
  const staff = await getStaff(assignedTo);

  await sendNotification({
    recipientId: assignedTo,
    channels: ['push', 'sms', 'dashboard'],
    priority: decision.priority,
    title: 'Conversation Escalated',
    message: `Room ${conversation.reservation?.roomNumber}: ${decision.reason}`,
    actionUrl: `/conversations/${conversation.id}`
  });

  // For critical, also notify duty manager
  if (decision.priority === 'critical') {
    const dutyManager = await getDutyManager(conversation.propertyId);
    await sendNotification({
      recipientId: dutyManager.id,
      channels: ['push', 'sms'],
      priority: 'critical',
      title: 'Critical Escalation',
      message: `Requires immediate attention: Room ${conversation.reservation?.roomNumber}`
    });
  }
}
```

---

## Configuration

```yaml
routing:
  # Confidence thresholds
  confidenceThreshold: 0.7
  intentThresholds:
    complaint: 0.8
    request.dining: 0.75

  # Always escalate these intents
  alwaysEscalate:
    - cancellation
    - billing_dispute

  # VIP handling
  vip:
    boostPriority: true
    lowerThreshold: 0.1

  # Assignment strategy
  assignment:
    default: least_busy
    housekeeping: round_robin
    maintenance: skill_based

  # SLA settings (minutes)
  sla:
    urgent:
      response: 5
      resolution: 15
    high:
      response: 10
      resolution: 30
    standard:
      response: 15
      resolution: 60
    low:
      response: 30
      resolution: 240

  # Notifications
  notifications:
    escalation:
      channels: [push, sms, dashboard]
    task:
      channels: [push, dashboard]
    dueSoon:
      thresholdMinutes: 5
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| `routing.ai_handled` | Requests handled by AI |
| `routing.tasks_created` | Tasks created |
| `routing.escalations` | Conversations escalated |
| `routing.escalation_reasons` | Breakdown by reason |
| `routing.assignment_time` | Time to assign |
| `routing.sla_breaches` | SLA violations |

---

## Related

- [AI Engine](../../03-architecture/c4-components/ai-engine.md)
- [Gateway](../../03-architecture/c4-components/gateway.md)
- [Task Management Use Case](../../02-use-cases/staff/task-management.md)
