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
  const staff = await getAvailableStaffByRole(target.role);

  if (staff.length === 0) {
    // Try fallback
    const fallbackStaff = await getAvailableStaffByRole(target.fallbackRole);

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

## Escalation Queue Management

### Queue Ordering

Escalations are ordered using a **priority-weighted FIFO** algorithm:

```typescript
interface EscalationQueueItem {
  conversationId: string;
  priority: EscalationPriority;
  escalatedAt: Date;
  slaDeadline: Date;
  score: number;  // Calculated for ordering
}

function calculateQueueScore(item: EscalationQueueItem): number {
  const priorityWeights = {
    critical: 10000,
    high: 1000,
    normal: 100
  };

  const ageMinutes = (Date.now() - item.escalatedAt.getTime()) / 60000;
  const slaRemainingMinutes = (item.slaDeadline.getTime() - Date.now()) / 60000;

  // Score = priority weight + age bonus - SLA urgency penalty
  // Higher score = should be handled first
  let score = priorityWeights[item.priority];
  score += ageMinutes * 10;  // Older items get +10 per minute
  score += Math.max(0, 30 - slaRemainingMinutes) * 50;  // SLA urgency in last 30 min

  return score;
}

// Queue is sorted by score descending
// Result: Critical items first, then high + aging, then normal + aging
// Within same priority, older items and SLA-approaching items surface
```

### Queue Position Display

```
┌─────────────────────────────────────────────────────────────────────┐
│ ESCALATION QUEUE                                    12 conversations │
├─────────────────────────────────────────────────────────────────────┤
│ #1  🔴 Room 412 - Complaint         Critical    2 min   SLA: 3 min  │
│ #2  🔴 Room 801 - VIP Request       High        8 min   SLA: 2 min  │
│ #3  🟡 Room 308 - Billing           High        5 min   SLA: 5 min  │
│ #4  🟡 Room 215 - General           Normal      15 min  SLA: 0 min  │ ⚠️
│ ... │
└─────────────────────────────────────────────────────────────────────┘
```

### Reassignment Between Agents

```typescript
interface ReassignmentReason {
  type: 'manual' | 'shift_end' | 'agent_busy' | 'skill_mismatch' | 'sla_risk';
  note?: string;
}

async function reassignEscalation(
  conversationId: string,
  fromStaffId: string,
  toStaffId: string | null,  // null = return to queue
  reason: ReassignmentReason
): Promise<void> {
  const conversation = await getConversation(conversationId);

  // Log reassignment
  await createAuditLog({
    action: 'escalation.reassigned',
    conversationId,
    actorId: fromStaffId,
    metadata: {
      fromStaffId,
      toStaffId,
      reason: reason.type,
      note: reason.note
    }
  });

  if (toStaffId) {
    // Direct reassignment to another agent
    await updateConversation(conversationId, { assignedTo: toStaffId });
    await notifyStaff(toStaffId, {
      type: 'escalation_assigned',
      conversation,
      message: `Reassigned from ${fromStaffId}: ${reason.note || reason.type}`
    });

    // Notify guest of handoff
    await sendToConversation(conversationId, {
      senderType: 'system',
      content: `I've connected you with ${await getStaffName(toStaffId)} who will continue helping you.`
    });
  } else {
    // Return to queue
    await updateConversation(conversationId, {
      assignedTo: null,
      state: 'escalated'  // Remains escalated, just unassigned
    });

    // Recalculate queue position (may have higher priority now due to age)
    await reindexQueueItem(conversationId);
  }
}
```

### SLA Violation Detection

```typescript
interface SLAConfig {
  critical: { response: 5, resolution: 15 };    // minutes
  high: { response: 10, resolution: 30 };
  normal: { response: 15, resolution: 60 };
}

// Check runs every minute
async function checkSLAViolations(): Promise<void> {
  const escalations = await getActiveEscalations();

  for (const escalation of escalations) {
    const slaConfig = SLA_CONFIG[escalation.priority];
    const ageMinutes = (Date.now() - escalation.escalatedAt.getTime()) / 60000;

    // Response SLA (time to first staff response)
    if (!escalation.firstResponseAt && ageMinutes > slaConfig.response) {
      await handleSLABreach(escalation, 'response');
    }

    // Resolution SLA (time to resolve)
    if (ageMinutes > slaConfig.resolution) {
      await handleSLABreach(escalation, 'resolution');
    }

    // Warning at 80% of SLA
    if (!escalation.slaWarned && ageMinutes > slaConfig.response * 0.8) {
      await sendSLAWarning(escalation);
    }
  }
}

async function handleSLABreach(escalation: Escalation, type: 'response' | 'resolution'): Promise<void> {
  // Log breach
  await createMetric('sla.breach', {
    conversationId: escalation.conversationId,
    priority: escalation.priority,
    type,
    breachMinutes: calculateBreachMinutes(escalation)
  });

  // Alert supervisor
  const supervisor = await getDepartmentSupervisor('front_desk');
  await sendUrgentNotification(supervisor.id, {
    title: `SLA Breach: ${type}`,
    message: `Room ${escalation.roomNumber} - ${escalation.priority} escalation exceeded ${type} SLA`,
    action: { type: 'view_conversation', conversationId: escalation.conversationId }
  });

  // For critical, also page duty manager
  if (escalation.priority === 'critical') {
    await pageDutyManager(escalation, `Critical SLA breach: ${type}`);
  }
}
```

### Queue Overflow Handling

When escalation queue exceeds capacity thresholds:

| Queue Size | Action |
|------------|--------|
| > 20 | Alert shift supervisor |
| > 35 | Page duty manager, consider calling in staff |
| > 50 | Emergency mode: auto-response to new escalations, prioritize critical only |

```typescript
const QUEUE_THRESHOLDS = {
  warning: 20,
  critical: 35,
  emergency: 50
};

async function handleQueueOverflow(queueSize: number): Promise<void> {
  if (queueSize > QUEUE_THRESHOLDS.emergency) {
    // Emergency mode
    await setEmergencyMode(true);
    await sendToAllEscalated({
      content: "We're experiencing high demand. A team member will be with you as soon as possible. " +
               "For urgent matters, please call the front desk directly."
    });
    await notifyAllManagers('queue_emergency', { queueSize });

  } else if (queueSize > QUEUE_THRESHOLDS.critical) {
    await pageDutyManager(null, `Escalation queue critical: ${queueSize} items`);
    await suggestCallInStaff();

  } else if (queueSize > QUEUE_THRESHOLDS.warning) {
    await alertSupervisor('queue_warning', { queueSize });
  }
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

### Task Completion Notification Timing

When a task completes, guest notification follows these rules:

| Scenario | Notification Timing | Behavior |
|----------|---------------------|----------|
| Normal completion | **Immediate** | Send within 5 seconds of task marked complete |
| Guest in active conversation | **Contextual** | Inject into conversation flow (not separate message) |
| Multiple tasks pending | **Batched** | If 2+ tasks complete within 60s, batch into single message |
| Guest checked out | **Suppressed** | Don't notify, log for records only |
| Quiet hours (10 PM - 8 AM) | **Queued** | Hold until 8 AM unless task was marked urgent |

```typescript
interface CompletionNotificationConfig {
  batchWindowMs: number;           // Default: 60000 (60 seconds)
  respectQuietHours: boolean;      // Default: true
  quietHoursStart: number;         // Default: 22 (10 PM)
  quietHoursEnd: number;           // Default: 8 (8 AM)
  suppressAfterCheckout: boolean;  // Default: true
  urgentBypassQuietHours: boolean; // Default: true
}

async function notifyTaskCompleted(task: Task, config: CompletionNotificationConfig): Promise<void> {
  const guest = await getGuest(task.guestId);
  const reservation = await getActiveReservation(guest.id);

  // Check if guest has checked out
  if (config.suppressAfterCheckout && (!reservation || reservation.status === 'checked_out')) {
    await logCompletionSuppressed(task, 'guest_checked_out');
    return;
  }

  // Check quiet hours (unless urgent)
  const guestHour = getGuestLocalHour(guest);
  const inQuietHours = guestHour >= config.quietHoursStart || guestHour < config.quietHoursEnd;

  if (config.respectQuietHours && inQuietHours) {
    if (task.priority !== 'urgent' || !config.urgentBypassQuietHours) {
      await queueNotificationUntil(task, getNextQuietHoursEnd(guest));
      return;
    }
  }

  // Check for active conversation
  const conversation = await getActiveConversation(guest.id);

  if (conversation) {
    // Inject into conversation instead of separate notification
    await injectCompletionIntoConversation(conversation, task);
    return;
  }

  // Check for batching (other tasks completed recently)
  const recentCompletions = await getRecentCompletions(guest.id, config.batchWindowMs);

  if (recentCompletions.length > 0) {
    // Add to batch queue, will send when batch window closes
    await addToBatch(guest.id, task);
    return;
  }

  // Send immediate notification
  await sendGuestNotification(guest, {
    template: 'task_completed',
    data: {
      taskType: task.type,
      description: task.description,
      roomNumber: reservation.roomNumber
    }
  });
}

// Batch notification example
// "Your requests have been completed:
//  • Extra towels delivered to room 412
//  • Iron and ironing board delivered
//  Is there anything else I can help with?"
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
    const dutyManager = await getDutyManager();
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
