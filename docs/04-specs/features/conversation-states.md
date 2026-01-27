# Conversation State Machine Specification

This document defines the state machine for conversations in Jack The Butler.

---

## Overview

Conversations move through defined states as they progress from initial guest contact through resolution. The state machine ensures:

- Clear workflow for staff
- Proper SLA tracking
- Correct routing and escalation
- Consistent guest experience

---

## State Diagram

```
                                    ┌─────────────────────────────────────┐
                                    │                                     │
                                    ▼                                     │
┌────────┐    guest      ┌────────────────┐    ai_handled    ┌──────────┐│
│  NEW   │───message────▶│     ACTIVE     │─────────────────▶│ RESOLVED ││
└────────┘               └────────────────┘                  └──────────┘│
                                │                                   ▲     │
                                │ needs_human                       │     │
                                ▼                                   │     │
                         ┌────────────────┐    staff_resolved       │     │
                         │   ESCALATED    │─────────────────────────┘     │
                         └────────────────┘                               │
                                │                                         │
                                │ transferred                             │
                                ▼                                         │
                         ┌────────────────┐                               │
                         │  TRANSFERRED   │───────────────────────────────┘
                         └────────────────┘          resolved

                         ┌────────────────┐
     any state ─────────▶│    CLOSED     │ (timeout/manual close)
                         └────────────────┘

                         ┌────────────────┐
     any state ─────────▶│   ARCHIVED    │ (data retention)
                         └────────────────┘
```

---

## States

### NEW

Initial state when conversation is created.

```typescript
interface NewState {
  status: 'new';
  createdAt: Date;
  channel: ChannelType;
  guestId: string;
}
```

**Entry conditions:**
- First message received from guest
- No existing active conversation for this guest

**Allowed transitions:**
- → `ACTIVE`: Message processed by AI
- → `CLOSED`: No activity timeout (rare)

**Duration:** Typically < 1 second (auto-transitions to ACTIVE)

---

### ACTIVE

Conversation is being handled, primarily by AI.

```typescript
interface ActiveState {
  status: 'active';
  handledBy: 'ai' | 'staff';
  lastMessageAt: Date;
  messageCount: number;
  intent?: string;
}
```

**Entry conditions:**
- AI begins processing message
- Staff returns conversation from escalated

**Allowed transitions:**
- → `ESCALATED`: AI determines human needed
- → `RESOLVED`: Issue addressed, guest satisfied
- → `CLOSED`: Inactivity timeout

**Key behaviors:**
- AI responds to messages
- Tracks conversation context
- Monitors sentiment
- Auto-escalates on certain triggers

---

### ESCALATED

Conversation requires human staff attention.

```typescript
interface EscalatedState {
  status: 'escalated';
  escalatedAt: Date;
  reason: EscalationReason;
  priority: Priority;
  assignedTo?: string;           // Staff ID
  assignedAt?: Date;
  slaDeadline: Date;
}

type EscalationReason =
  | 'guest_requested'           // Guest asked for human
  | 'negative_sentiment'        // Detected frustration
  | 'complex_request'           // AI cannot handle
  | 'vip_guest'                 // VIP always gets human
  | 'complaint'                 // Complaint detected
  | 'emergency'                 // Safety concern
  | 'repeated_issue'            // Same problem multiple times
  | 'ai_uncertainty';           // AI confidence too low

type Priority = 'urgent' | 'high' | 'normal' | 'low';
```

**Entry conditions:**
- AI confidence below threshold
- Guest explicitly requests human
- Negative sentiment detected
- VIP guest policy
- Complaint or emergency detected

**Allowed transitions:**
- → `ACTIVE`: Staff returns to AI handling
- → `TRANSFERRED`: Staff transfers to another staff/department
- → `RESOLVED`: Staff resolves the issue
- → `CLOSED`: Inactivity timeout (with warning)

**Key behaviors:**
- Appears in staff queue
- SLA timer active
- Notifications sent to staff
- AI provides suggested responses

---

### TRANSFERRED

Conversation has been transferred to different staff/department.

```typescript
interface TransferredState {
  status: 'transferred';
  transferredAt: Date;
  fromStaffId: string;
  toStaffId?: string;           // Specific staff
  toDepartment?: string;        // Or department queue
  reason?: string;
  previousAssignments: Assignment[];
}

interface Assignment {
  staffId: string;
  assignedAt: Date;
  unassignedAt: Date;
  reason: string;
}
```

**Entry conditions:**
- Staff transfers conversation
- Department routing rules

**Allowed transitions:**
- → `ESCALATED`: New assignee accepts
- → `RESOLVED`: Resolved during transfer
- → `CLOSED`: Timeout

**Key behaviors:**
- Tracks transfer history
- Preserves context for new handler
- Resets SLA appropriately

---

### RESOLVED

Conversation issue has been addressed.

```typescript
interface ResolvedState {
  status: 'resolved';
  resolvedAt: Date;
  resolvedBy: 'ai' | 'staff';
  resolverId?: string;          // Staff ID if by staff
  resolution?: string;          // Brief description
  satisfactionRating?: number;  // 1-5 if collected
}
```

**Entry conditions:**
- AI completes guest request
- Staff marks as resolved
- Guest confirms issue resolved

**Allowed transitions:**
- → `ACTIVE`: Guest sends new message (within reopen window)
- → `CLOSED`: Reopen window expires
- → `ARCHIVED`: Data retention policy

**Key behaviors:**
- Satisfaction survey may be sent
- Analytics recorded
- Can be reopened within window

---

### CLOSED

Conversation is finished and cannot be reopened.

```typescript
interface ClosedState {
  status: 'closed';
  closedAt: Date;
  closedReason: CloseReason;
  closedBy?: string;            // Staff ID if manual
}

type CloseReason =
  | 'resolved_timeout'          // Reopen window expired
  | 'inactivity_timeout'        // No messages for X hours
  | 'manual_close'              // Staff closed
  | 'guest_checkout'            // Guest checked out
  | 'duplicate';                // Merged with another
```

**Entry conditions:**
- Timeout after resolution
- Inactivity timeout
- Manual close by staff
- Guest checkout triggers

**Allowed transitions:**
- → `ARCHIVED`: Data retention policy

**Key behaviors:**
- New messages create new conversation
- Data retained per policy

---

### ARCHIVED

Conversation data archived for long-term storage.

```typescript
interface ArchivedState {
  status: 'archived';
  archivedAt: Date;
  archiveLocation?: string;     // If moved to cold storage
}
```

**Entry conditions:**
- Data retention policy triggers
- Manual archive

**Allowed transitions:**
- None (terminal state)

---

## Transitions

### Transition Definition

```typescript
interface StateTransition {
  from: ConversationStatus[];
  to: ConversationStatus;
  trigger: TransitionTrigger;
  guard?: (conversation: Conversation, context: TransitionContext) => boolean;
  action?: (conversation: Conversation, context: TransitionContext) => Promise<void>;
}

type TransitionTrigger =
  | 'message_received'
  | 'ai_response_sent'
  | 'escalation_triggered'
  | 'staff_assigned'
  | 'staff_resolved'
  | 'staff_transferred'
  | 'staff_returned_to_ai'
  | 'timeout'
  | 'manual_close'
  | 'guest_checkout'
  | 'retention_policy';

interface TransitionContext {
  triggeredBy: 'system' | 'ai' | 'staff' | 'guest';
  actorId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

### Transition Table

| From | To | Trigger | Guard | Action |
|------|----|---------|-------|--------|
| NEW | ACTIVE | message_received | - | Start AI processing |
| ACTIVE | ESCALATED | escalation_triggered | - | Create staff task, notify |
| ACTIVE | RESOLVED | ai_response_sent | Guest confirmed / AI confident | Record resolution |
| ESCALATED | ACTIVE | staff_returned_to_ai | AI can handle | Clear assignment |
| ESCALATED | TRANSFERRED | staff_transferred | - | Record transfer, notify |
| ESCALATED | RESOLVED | staff_resolved | - | Record resolution, send survey |
| TRANSFERRED | ESCALATED | staff_assigned | - | Update assignment |
| TRANSFERRED | RESOLVED | staff_resolved | - | Record resolution |
| RESOLVED | ACTIVE | message_received | Within reopen window | Resume context |
| RESOLVED | CLOSED | timeout | Reopen window expired | - |
| * | CLOSED | timeout | Inactivity | Notify if escalated |
| * | CLOSED | manual_close | Has permission | Record reason |
| CLOSED | ARCHIVED | retention_policy | Retention period elapsed | Move to archive |

### Implementation

```typescript
class ConversationStateMachine {
  private transitions: StateTransition[] = [
    // NEW → ACTIVE
    {
      from: ['new'],
      to: 'active',
      trigger: 'message_received',
      action: async (conv, ctx) => {
        conv.status = 'active';
        conv.handledBy = 'ai';
        await this.emit('conversation:activated', { conversationId: conv.id });
      },
    },

    // ACTIVE → ESCALATED
    {
      from: ['active'],
      to: 'escalated',
      trigger: 'escalation_triggered',
      action: async (conv, ctx) => {
        conv.status = 'escalated';
        conv.escalatedAt = new Date();
        conv.escalationReason = ctx.metadata?.reason;
        conv.priority = this.calculatePriority(conv, ctx);
        conv.slaDeadline = this.calculateSlaDeadline(conv);

        await this.createStaffTask(conv);
        await this.notifyStaff(conv);
        await this.emit('conversation:escalated', { conversationId: conv.id });
      },
    },

    // ESCALATED → RESOLVED
    {
      from: ['escalated'],
      to: 'resolved',
      trigger: 'staff_resolved',
      action: async (conv, ctx) => {
        conv.status = 'resolved';
        conv.resolvedAt = new Date();
        conv.resolvedBy = 'staff';
        conv.resolverId = ctx.actorId;
        conv.resolution = ctx.metadata?.resolution;

        await this.sendSatisfactionSurvey(conv);
        await this.emit('conversation:resolved', { conversationId: conv.id });
      },
    },

    // RESOLVED → ACTIVE (reopen)
    {
      from: ['resolved'],
      to: 'active',
      trigger: 'message_received',
      guard: (conv) => this.isWithinReopenWindow(conv),
      action: async (conv, ctx) => {
        conv.status = 'active';
        conv.handledBy = 'ai';
        await this.emit('conversation:reopened', { conversationId: conv.id });
      },
    },

    // Any → CLOSED (timeout)
    {
      from: ['active', 'escalated', 'transferred', 'resolved'],
      to: 'closed',
      trigger: 'timeout',
      action: async (conv, ctx) => {
        conv.status = 'closed';
        conv.closedAt = new Date();
        conv.closedReason = ctx.metadata?.reason || 'inactivity_timeout';

        await this.emit('conversation:closed', { conversationId: conv.id });
      },
    },
  ];

  async transition(
    conversation: Conversation,
    trigger: TransitionTrigger,
    context: TransitionContext
  ): Promise<Conversation> {
    const transition = this.findTransition(conversation.status, trigger);

    if (!transition) {
      throw new InvalidTransitionError(
        `Cannot ${trigger} from ${conversation.status}`
      );
    }

    // Check guard
    if (transition.guard && !transition.guard(conversation, context)) {
      throw new TransitionGuardError(
        `Transition guard failed for ${trigger}`
      );
    }

    // Execute action
    if (transition.action) {
      await transition.action(conversation, context);
    }

    // Save updated conversation
    await this.db.conversations.update(conversation.id, conversation);

    // Log transition
    await this.logTransition(conversation, transition, context);

    return conversation;
  }

  private findTransition(
    currentStatus: ConversationStatus,
    trigger: TransitionTrigger
  ): StateTransition | undefined {
    return this.transitions.find(
      (t) => t.from.includes(currentStatus) && t.trigger === trigger
    );
  }
}
```

---

## Timeouts

### Configuration

```typescript
interface TimeoutConfig {
  newToActive: number;           // ms, auto-transition
  activeInactivity: number;      // ms, close if no messages
  escalatedInactivity: number;   // ms, close with warning
  resolvedReopen: number;        // ms, window to reopen
  transferredTimeout: number;    // ms, return to queue if not accepted
}

const DEFAULT_TIMEOUTS: TimeoutConfig = {
  newToActive: 1000,             // 1 second
  activeInactivity: 24 * 60 * 60 * 1000,      // 24 hours
  escalatedInactivity: 72 * 60 * 60 * 1000,   // 72 hours
  resolvedReopen: 4 * 60 * 60 * 1000,         // 4 hours
  transferredTimeout: 30 * 60 * 1000,         // 30 minutes
};
```

### Timeout Processing

```typescript
// Scheduled job to check timeouts
async function processConversationTimeouts(): Promise<void> {
  const now = new Date();

  // Active conversations - inactivity
  const staleActive = await db.conversations.findStale('active', DEFAULT_TIMEOUTS.activeInactivity);
  for (const conv of staleActive) {
    await stateMachine.transition(conv, 'timeout', {
      triggeredBy: 'system',
      metadata: { reason: 'inactivity_timeout' },
    });
  }

  // Escalated conversations - warning then close
  const staleEscalated = await db.conversations.findStale('escalated', DEFAULT_TIMEOUTS.escalatedInactivity);
  for (const conv of staleEscalated) {
    // Send warning first if not already warned
    if (!conv.timeoutWarningAt) {
      await sendTimeoutWarning(conv);
      await db.conversations.update(conv.id, { timeoutWarningAt: now });
    } else if (now - conv.timeoutWarningAt > 24 * 60 * 60 * 1000) {
      // Close if warning was 24+ hours ago
      await stateMachine.transition(conv, 'timeout', {
        triggeredBy: 'system',
        metadata: { reason: 'inactivity_timeout' },
      });
    }
  }

  // Resolved conversations - close after reopen window
  const expiredResolved = await db.conversations.findStale('resolved', DEFAULT_TIMEOUTS.resolvedReopen);
  for (const conv of expiredResolved) {
    await stateMachine.transition(conv, 'timeout', {
      triggeredBy: 'system',
      metadata: { reason: 'resolved_timeout' },
    });
  }
}
```

---

## Permission Matrix

Who can trigger which transitions:

| Transition | System | AI | Staff | Admin |
|------------|--------|----|----|-------|
| new → active | ✓ | ✓ | | |
| active → escalated | ✓ | ✓ | ✓ | ✓ |
| active → resolved | | ✓ | ✓ | ✓ |
| escalated → active | | | ✓ | ✓ |
| escalated → transferred | | | ✓ | ✓ |
| escalated → resolved | | | ✓ | ✓ |
| transferred → escalated | | | ✓ | ✓ |
| resolved → active | ✓ | | | |
| * → closed (manual) | | | ✓ | ✓ |
| * → closed (timeout) | ✓ | | | |
| closed → archived | ✓ | | | ✓ |

---

## Events

State transitions emit events for other components:

```typescript
// Event payloads
interface ConversationActivatedEvent {
  conversationId: string;
  guestId: string;
  channel: ChannelType;
}

interface ConversationEscalatedEvent {
  conversationId: string;
  guestId: string;
  reason: EscalationReason;
  priority: Priority;
  slaDeadline: Date;
}

interface ConversationResolvedEvent {
  conversationId: string;
  guestId: string;
  resolvedBy: 'ai' | 'staff';
  resolverId?: string;
  durationMinutes: number;
}

interface ConversationClosedEvent {
  conversationId: string;
  guestId: string;
  reason: CloseReason;
  totalMessages: number;
  durationMinutes: number;
}
```

---

## SLA Tracking

### SLA Rules

```typescript
interface SlaRule {
  priority: Priority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationMinutes: number;     // Escalate if not assigned
}

const SLA_RULES: Record<Priority, SlaRule> = {
  urgent: {
    priority: 'urgent',
    firstResponseMinutes: 5,
    resolutionMinutes: 60,
    escalationMinutes: 2,
  },
  high: {
    priority: 'high',
    firstResponseMinutes: 15,
    resolutionMinutes: 240,
    escalationMinutes: 10,
  },
  normal: {
    priority: 'normal',
    firstResponseMinutes: 60,
    resolutionMinutes: 480,
    escalationMinutes: 30,
  },
  low: {
    priority: 'low',
    firstResponseMinutes: 240,
    resolutionMinutes: 1440,
    escalationMinutes: 120,
  },
};
```

### SLA Monitoring

```typescript
async function checkSlaBreaches(): Promise<void> {
  const escalated = await db.conversations.findByStatus('escalated');

  for (const conv of escalated) {
    const sla = SLA_RULES[conv.priority];
    const now = new Date();

    // Check first response SLA
    if (!conv.firstResponseAt) {
      const deadline = addMinutes(conv.escalatedAt, sla.firstResponseMinutes);
      if (now > deadline) {
        await handleSlaBreachWarning(conv, 'first_response');
      }
    }

    // Check resolution SLA
    const resolutionDeadline = addMinutes(conv.escalatedAt, sla.resolutionMinutes);
    if (now > resolutionDeadline) {
      await handleSlaBreachWarning(conv, 'resolution');
    }

    // Check unassigned escalation
    if (!conv.assignedTo) {
      const assignDeadline = addMinutes(conv.escalatedAt, sla.escalationMinutes);
      if (now > assignDeadline) {
        await escalateUnassigned(conv);
      }
    }
  }
}
```

---

## Configuration

```yaml
conversations:
  states:
    # Timeout durations
    timeouts:
      activeInactivity: 86400000     # 24 hours in ms
      escalatedInactivity: 259200000 # 72 hours
      resolvedReopen: 14400000       # 4 hours
      transferredTimeout: 1800000    # 30 minutes

    # Reopen behavior
    reopenWindow: 14400000           # 4 hours after resolved

    # Auto-close behavior
    autoClose:
      enabled: true
      warnBefore: 86400000           # 24 hours warning

  # SLA settings
  sla:
    enabled: true
    checkInterval: 60000             # Check every minute
    notifyOnBreach: true
    escalateOnBreach: true

  # Archive settings
  archive:
    afterDays: 365
    compressionEnabled: true
```

---

## Related

- [Gateway API](../api/gateway-api.md) - Conversation endpoints
- [Task Routing](task-routing.md) - Staff assignment
- [Events](../api/events.md) - Event definitions
