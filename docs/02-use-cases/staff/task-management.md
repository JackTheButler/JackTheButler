# Use Case: Task Management

Staff workflows for handling conversations, tasks, and handoffs.

---

## Conversation Management

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-01 |
| Actor | Staff (all roles) |
| Interface | Dashboard, Mobile App |
| Priority | P0 |

### Description

Staff view, claim, and respond to guest conversations that have been escalated or require human attention. Jack provides context and suggestions to accelerate response.

### User Stories

- As front desk staff, I want to see all conversations needing attention
- As an agent, I want full context when I take over a conversation
- As a manager, I want to monitor conversation queues and response times

### Queue View

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONVERSATIONS                                          Filter ▼     │
├─────────────────────────────────────────────────────────────────────┤
│ 🔴 Room 412 - Sarah Chen                              2 min ago     │
│    "I'm very upset about the noise..."                              │
│    Escalated: Complaint                                             │
├─────────────────────────────────────────────────────────────────────┤
│ 🟡 Room 308 - Michael Torres                          8 min ago     │
│    "Can you book me a tee time tomorrow?"                           │
│    Needs: Concierge                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 🟢 Room 215 - Jennifer Park                          12 min ago     │
│    "Thanks! That's all I needed"                                    │
│    Status: Resolved (AI)                                            │
└─────────────────────────────────────────────────────────────────────┘

🔴 Urgent (< 5 min SLA)  🟡 Pending  🟢 Resolved
```

### Conversation Detail View

```
┌─────────────────────────────────────────────────────────────────────┐
│ Sarah Chen - Room 412                           [Take Over] [Close] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ GUEST PROFILE                    │ CONVERSATION                     │
│ ─────────────────                │ ─────────────                    │
│ Loyalty: Gold Member             │                                  │
│ Stays: 4 previous                │ Guest (10:23 PM):                │
│ Preferences:                     │ "There's so much noise from      │
│   • High floor                   │ the room next door. I can't      │
│   • Firm pillows                 │ sleep and I have meetings        │
│   • WSJ newspaper                │ tomorrow"                        │
│                                  │                                  │
│ Current Stay:                    │ Jack (10:23 PM):                 │
│   Check-in: Mar 15               │ "I'm so sorry about the          │
│   Check-out: Mar 18              │ disturbance. I'm alerting        │
│   Rate: $189/night               │ our team immediately..."         │
│   Room type: Deluxe King         │                                  │
│                                  │ Guest (10:25 PM):                │
│ NOTES                            │ "This is unacceptable. I'm a     │
│ ─────                            │ gold member and I specifically   │
│ "Repeat guest, appreciates       │ requested a quiet room"          │
│ quick resolution"                │                                  │
│                                  │ [ESCALATED TO STAFF]             │
│ SUGGESTED RESPONSE               │                                  │
│ ─────────────────                │                                  │
│ "I completely understand,        │                                  │
│ Ms. Chen. As a valued Gold       │                                  │
│ member, this isn't the           │                                  │
│ experience you deserve. I'm      │                                  │
│ [calling security / moving       │                                  │
│ you to room X]. May I also       │                                  │
│ offer [compensation]?"           │                                  │
│                                  │                                  │
│ [Use Suggestion] [Edit]          │ [Reply box]              [Send]  │
└─────────────────────────────────────────────────────────────────────┘
```

### Taking Over a Conversation

```
Agent clicks [Take Over]

System: Conversation assigned to Maria (Front Desk)

Jack to Guest: "I've connected you with Maria from our front desk
               team. She's reviewing your situation now."

Maria types response, sends.

Guest sees: "Maria: I completely understand, Ms. Chen..."
```

---

## Task Tracking

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-02 |
| Actor | Housekeeping, Maintenance, F&B |
| Interface | Mobile App, Dashboard |
| Priority | P0 |

### Description

Departments receive, claim, and complete tasks generated from guest requests. Task completion automatically triggers guest notifications.

### User Stories

- As housekeeping staff, I want to see my assigned tasks
- As a supervisor, I want to assign tasks to available staff
- As any staff, I want to mark tasks complete and add notes

### Task Queue (Housekeeping Mobile)

```
┌─────────────────────────────────────────────────────────────────────┐
│ HOUSEKEEPING TASKS                                     Maria ▼      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 🔴 URGENT                                                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Room 412 - Extra towels + hangers                               │ │
│ │ Requested: 5 min ago | SLA: 10 min remaining                    │ │
│ │                                               [Claim] [Details] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ 🟡 STANDARD                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Room 308 - Rollaway bed                                         │ │
│ │ Requested: 12 min ago | SLA: 20 min remaining                   │ │
│ │ Assigned to: Carlos                                [Details]    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Room 502 - Turndown service + rose petals                       │ │
│ │ Scheduled: 6:00 PM | Anniversary setup                          │ │
│ │                                               [Claim] [Details] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Task Completion Flow

```
Staff opens task "Room 412 - Extra towels + hangers"

Task details:
- 2 bath towels, 2 hand towels
- 6 hangers
- Guest note: "Please leave outside door, baby sleeping"

Staff delivers items, taps [Complete]

Optional: Add note "Left on door handle per guest request"

System:
1. Task marked complete
2. Jack notifies guest: "Your towels and hangers have been delivered"
3. Task logged to guest stay record
```

---

## Shift Handoff

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-04 |
| Actor | Supervisors, Managers |
| Interface | Dashboard |
| Priority | P2 |

### Description

Automated generation of shift handoff reports summarizing open issues, pending tasks, and notable guest situations.

### User Stories

- As an incoming manager, I want to know what happened on the previous shift
- As an outgoing agent, I want to ensure nothing falls through the cracks

### Handoff Report

```
┌─────────────────────────────────────────────────────────────────────┐
│ SHIFT HANDOFF REPORT                                                │
│ Evening → Night Shift | March 17, 2024 | 11:00 PM                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ OPEN ESCALATIONS (2)                                                │
│ ─────────────────────                                               │
│ • Room 412 (Sarah Chen) - Noise complaint, moved to 612             │
│   Status: Resolved, but guest unhappy. GM follow-up tomorrow.       │
│   Comp: 1 night credited                                            │
│                                                                     │
│ • Room 215 (James Wilson) - AC repair pending                       │
│   Status: Part ordered, maintenance scheduled 9 AM                  │
│   Guest has portable unit, comfortable for tonight                  │
│                                                                     │
│ PENDING TASKS (4)                                                   │
│ ────────────────                                                    │
│ • Room 308: Rollaway bed delivery (assigned to night porter)        │
│ • Room 601: 6 AM wake-up call                                       │
│ • Room 412: Champagne delivery (comp) - send at 8 AM                │
│ • Lobby: Newspaper delivery station setup (5:30 AM)                 │
│                                                                     │
│ VIP/NOTABLE GUESTS                                                  │
│ ──────────────────                                                  │
│ • Room 801: CEO of TechCorp (arrives tomorrow 2 PM)                 │
│   Pre-arrival requests: Specific water brand, extra security        │
│                                                                     │
│ • Room 612: Sarah Chen (moved from 412)                             │
│   Handle with care - service recovery in progress                   │
│                                                                     │
│ METRICS THIS SHIFT                                                  │
│ ──────────────────                                                  │
│ • Conversations: 47 total, 41 resolved by Jack, 6 escalated         │
│ • Avg response time: 24 seconds                                     │
│ • Tasks completed: 23/25 (2 pending above)                          │
│                                                                     │
│                                           [Acknowledge] [Add Note]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Response Assistance

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-05 |
| Actor | All staff |
| Interface | Dashboard, Mobile |
| Priority | P1 |

### Description

Jack suggests responses for staff to use or edit, accelerating response time while maintaining human judgment.

### User Stories

- As an agent, I want response suggestions based on the conversation
- As an agent, I want to quickly customize suggestions before sending
- As a new employee, I want to learn appropriate responses from AI suggestions

### Suggestion Types

| Situation | Suggestion Approach |
|-----------|---------------------|
| Information request | Factual answer from knowledge base |
| Service recovery | Empathetic template + compensation options |
| Complex request | Structured response with options |
| Complaint | Acknowledgment + action steps |

### Suggestion Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│ AI SUGGESTED RESPONSE                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Based on: Noise complaint from Gold member                          │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ I sincerely apologize for the disturbance, Ms. Chen. As a       │ │
│ │ Gold member, you deserve a peaceful stay, and we've fallen      │ │
│ │ short tonight.                                                  │ │
│ │                                                                 │ │
│ │ I can offer you:                                                │ │
│ │ • Immediate room move to [Room 612 - quiet corner, same type]   │ │
│ │ • [Select compensation: complimentary night / breakfast / spa]  │ │
│ │                                                                 │ │
│ │ Which would you prefer? I'll have someone assist with the       │ │
│ │ move right away if you'd like.                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Confidence: 92% | Similar past resolution: Room move + 1 night      │
│                                                                     │
│ [Use as-is] [Edit before sending] [Generate alternative]            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

### Conversation Management
- [ ] Real-time conversation queue updates
- [ ] One-click conversation takeover
- [ ] Full context visible (history, profile, notes)
- [ ] Seamless handoff visible to guest
- [ ] Conversation can be returned to Jack

### Task Tracking
- [ ] Tasks appear within 5 seconds of creation
- [ ] Push notifications for urgent tasks
- [ ] Completion triggers guest notification
- [ ] Task history maintained per stay
- [ ] SLA timers visible and accurate

### Shift Handoff
- [ ] Auto-generated at shift change times
- [ ] Includes all open items
- [ ] Highlights VIPs and service recovery
- [ ] Acknowledgment tracked

### Response Assistance
- [ ] Suggestions generated within 3 seconds
- [ ] Edit capability before sending
- [ ] Learning from staff edits (feedback loop)
- [ ] Configurable suggestion style per property

---

## Related

- [Guest: Issues & Complaints](../guest/during-stay.md#issues-and-complaints) - Source of escalations
- [Architecture: AI Engine](../../03-architecture/c4-components/ai-engine.md)
- [Spec: Task Routing](../../04-specs/features/task-routing.md)
