# Use Case: Engine Configuration

Staff configure Jack's apps and automation rules.

---

## App Management

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-08 |
| Actor | Admin, Manager |
| Interface | Dashboard (Engine > Apps) |
| Priority | P0 |

### Description

Apps are the external services Jack connects to — AI providers (Anthropic, OpenAI, Ollama, Local AI), communication channels (WhatsApp, SMS, Email), and hotel systems (PMS). Staff configure credentials, test connections, and enable or disable apps through the dashboard.

### User Stories

- As admin, I want to set up AI provider credentials so Jack can generate responses
- As admin, I want to configure WhatsApp so guests can message Jack
- As a manager, I want to test connections to verify apps are working
- As admin, I want to disable a malfunctioning app without losing its configuration

### App List View

```
┌─────────────────────────────────────────────────────────────────────┐
│ APPS                                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Connected: 3  |  Ready: 1  |  Errors: 0  |  Total: 4               │
│                                                                     │
│ 🔍 [Search apps...                                       ]          │
│                                                                     │
│ AI PROVIDERS                                                    2   │
│ ┌───────────────────────────────────┐ ┌───────────────────────────┐ │
│ │ 🤖 Anthropic (Claude)            │ │ 🏠 Local AI              │ │
│ │ Advanced reasoning and           │ │ Embeddings and completion │ │
│ │ conversation                     │ │ without external APIs     │ │
│ │ ● Connected                    > │ │ ⚙ Not set up           > │ │
│ └───────────────────────────────────┘ └───────────────────────────┘ │
│                                                                     │
│ COMMUNICATION CHANNELS                                          2   │
│ ┌───────────────────────────────────┐ ┌───────────────────────────┐ │
│ │ 💬 WhatsApp Business             │ │ ✉️ Mailgun                │ │
│ │ Guest messaging via Meta         │ │ Email for guest           │ │
│ │ WhatsApp Cloud API               │ │ communication             │ │
│ │ ● Connected                    > │ │ ⚡ Ready to test        > │ │
│ └───────────────────────────────────┘ └───────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### App Configuration View

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to Apps                                                      │
│                                                                     │
│ 🤖 Anthropic (Claude)                                    [Docs ↗]   │
│ Advanced reasoning and conversation                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ CONNECTION STATUS                                                   │
│ ─────────────────                                                   │
│ ● Connected | Last checked: 2 min ago                               │
│                                            [Test Connection]        │
│                                                                     │
│ CONFIGURATION                                                       │
│ ─────────────                                                       │
│ API Key:      [sk-ant-••••••••••••••••••••••    ] [👁]              │
│ Model:        [claude-sonnet-4-20250514 ▼]                          │
│ Max Tokens:   [4096                            ]                    │
│ Enabled:      [■ On]                                                │
│                                                                     │
│                                                          [Save]     │
│                                                                     │
│ ACTIVITY LOG                                                        │
│ ────────────                                                        │
│ connection_test  ✓ success  42ms   2 min ago                        │
│ config_updated   ✓ success   —     5 min ago                        │
│ connection_test  ✗ error    —      1 hour ago                       │
│                                                                     │
│ DANGER ZONE                                                         │
│ ───────────                                                         │
│ [Remove Configuration] — Disables the app and clears all settings   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### App Statuses

| Status | Meaning |
|--------|---------|
| Connected | Configured, enabled, and connection test passed |
| Ready to test | Configured and enabled, but not yet tested |
| Error | Configured but connection test failed |
| Disabled | Configured but manually turned off |
| Not set up | No configuration saved |

---

## Autonomy Settings

> **Status: Superseded — removed.** The Autonomy Settings page, approval queue, and per-action L1/L2 configuration were removed in May 2026. Confidence-based escalation continues to operate via `src/core/conversation/escalation.ts`. Section retained for historical context.

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-09 |
| Actor | Manager, Admin |
| Interface | Dashboard (Engine > Autonomy) |
| Priority | P0 |

### Description

Autonomy settings control how much Jack can do without staff approval. Hotels choose a global autonomy level and can override it per action type. Actions that exceed the configured level are sent to the Review Center.

### User Stories

- As a manager, I want to start with full approval mode until I trust Jack's responses
- As admin, I want to let Jack handle routine responses autonomously but require approval for tasks
- As a manager, I want to adjust confidence thresholds to control when Jack is uncertain

### Autonomy Levels

| Level | Name | Behavior |
|-------|------|----------|
| L1 | Approval Required | All actions queue in Review Center for staff approval |
| L2 | Autonomous | Jack executes actions immediately without approval |

### Settings Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUTONOMY SETTINGS                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ GLOBAL DEFAULT                                                      │
│ ──────────────                                                      │
│ [L1 Approval Required]  [L2 Autonomous]                             │
│                                                                     │
│ PER-ACTION OVERRIDES                                                │
│ ────────────────────                                                │
│ Send guest response      [L1] [L2]                                  │
│ Create task              [L1] [L2]                                  │
│ Send proactive message   [L1] [L2]                                  │
│ Update reservation       [L1] [L2]                                  │
│ Escalate to staff        [L1] [L2]                                  │
│ Close conversation       [L1] [L2]                                  │
│ Offer upsell             [L1] [L2]  (Coming Soon)                   │
│ Process payment          [L1] [L2]  (Coming Soon)                   │
│                                                                     │
│ CONFIDENCE THRESHOLDS                                               │
│ ─────────────────────                                               │
│ Approval threshold:  ──────●────── 70%                              │
│ (Below this, action requires approval regardless of autonomy level) │
│                                                                     │
│ Urgent threshold:    ────●──────── 40%                              │
│ (Below this, action is flagged as urgent in Review Center)          │
│                                                                     │
│                                          [Reset Defaults] [Save]    │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Setup

| Hotel Comfort Level | Suggested Configuration |
|---------------------|-------------------------|
| Just getting started | L1 globally — review everything |
| Trusting routine responses | L2 for responses, L1 for tasks and reservations |
| Fully confident | L2 globally, L1 only for reservations and payments |

---

## Automation Rules

### Summary

| Attribute | Value |
|-----------|-------|
| ID | S-10 |
| Actor | Manager, Admin |
| Interface | Dashboard (Engine > Automations) |
| Priority | P1 |

### Description

Automation rules are trigger-action pairs that execute without AI reasoning. Hotels configure time-based triggers (e.g., "3 days before arrival, send welcome message") and event-based triggers (e.g., "when task is completed, notify guest").

### User Stories

- As a manager, I want to send automatic welcome messages before guest arrival
- As admin, I want to configure checkout reminders
- As a manager, I want to create custom automations for my property's workflows
- As admin, I want to test a rule before enabling it

### Automation List

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUTOMATIONS                                              [+ New Rule]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Active: 2  |  Inactive: 1  |  Errors: 0  |  Total: 3               │
│                                                                     │
│ [All] [Scheduled] [Event-Based]                                     │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ⏰ Pre-Arrival Welcome Message                         [■ On]  │ │
│ │    3 days before arrival at 10:00 AM → Send message             │ │
│ │    Runs: 142 times | Last: 2 hours ago                       >  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ⏰ Checkout Reminder                                   [■ On]  │ │
│ │    Day of departure at 8:00 AM → Send message                   │ │
│ │    Runs: 89 times | Last: this morning                       >  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ 📡 Task Completion Notification                        [□ Off] │ │
│ │    When task completed → Notify guest                           │ │
│ │    Runs: 0 times | Never run                                 >  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Rule Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to Automations                                               │
│                                                                     │
│ Pre-Arrival Welcome Message                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ BASIC INFO                                                          │
│ ──────────                                                          │
│ Name:        [Pre-Arrival Welcome Message          ]                │
│ Description: [Send welcome message before arrival  ]                │
│ Enabled:     [■ On]                                                 │
│                                                                     │
│ TRIGGER                                                             │
│ ───────                                                             │
│ Type: [⏰ Time-Based ▼]                                             │
│ When: [3] days [before ▼] [arrival ▼] at [10:00 ▼]                 │
│                                                                     │
│ ACTION                                                              │
│ ──────                                                              │
│ Type: [💬 Send Message ▼]                                           │
│ Template: [Welcome Message ▼]                                       │
│ Channel: [Preferred ▼]                                              │
│                                                                     │
│                                       [Test Rule] [Cancel] [Save]   │
│                                                                     │
│ EXECUTION LOG                                                       │
│ ─────────────                                                       │
│ ✓ success  Sarah Chen     2 hours ago    45ms                       │
│ ✓ success  Michael Torres yesterday      38ms                       │
│ ✗ error    James Wilson   2 days ago     —    "No phone number"     │
│                                                                     │
│ DANGER ZONE                                                         │
│ ───────────                                                         │
│ [Delete Rule]                                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Trigger Types

| Type | Configuration | Examples |
|------|---------------|----------|
| Time-based | Days before/after arrival/departure + time of day | 3 days before arrival at 10 AM |
| Event-based | System event type | Task completed, reservation created, conversation escalated |

### Action Types

| Type | Configuration | What It Does |
|------|---------------|-------------|
| Send message | Template + channel | Sends a message to the guest |
| Create task | Department + priority | Creates a staff task |
| Notify staff | Department | Sends an alert to staff dashboard |
| Webhook | URL + payload | Calls an external service |

---

## Acceptance Criteria

### App Management
- [ ] All apps listed with current status
- [ ] Dynamic configuration form based on app schema
- [ ] Password fields masked with show/hide toggle
- [ ] Connection testing with success/error feedback and latency
- [ ] Enable/disable without losing configuration
- [ ] Activity log showing recent events

### Autonomy Settings
- [ ] Global level selection (L1/L2)
- [ ] Per-action overrides
- [ ] Confidence threshold sliders
- [ ] Reset to defaults option
- [ ] Changes take effect immediately after save

### Automation Rules
- [ ] Create, edit, delete rules
- [ ] Enable/disable toggle from list view
- [ ] Time-based and event-based trigger configuration
- [ ] Multiple action types
- [ ] Test execution with feedback
- [ ] Execution log with status and latency

---

## Related

- [Review Center](review-center.md) - Where L1 actions are reviewed
- [Knowledge Base](knowledge-base.md) - Requires AI provider app to be configured
- [Operations: Automation](../operations/automation.md) - Detailed automation use cases
