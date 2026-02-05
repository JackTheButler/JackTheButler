# Use Cases

This section documents all user interactions with Jack The Butler, organized by actor and domain.

---

## Overview

Jack serves three primary actor groups:

| Actor | Description | Primary Value |
|-------|-------------|---------------|
| **Guest** | Hotel guests before, during, and after their stay | Instant, personalized service |
| **Staff** | Hotel employees across departments | Efficiency and context |
| **System** | Automated operations and integrations | Consistency and scale |

---

## Use Case Map

### Guest Use Cases

| ID | Use Case | Priority | Status | Link |
|----|----------|----------|--------|------|
| G-01 | Pre-arrival messaging | P0 | Draft | [guest/pre-arrival.md](guest/pre-arrival.md) |
| G-02 | Check-in assistance | P0 | Draft | [guest/during-stay.md](guest/during-stay.md#check-in) |
| G-03 | Service requests | P0 | Draft | [guest/during-stay.md](guest/during-stay.md#service-requests) |
| G-04 | Information inquiries | P0 | Draft | [guest/during-stay.md](guest/during-stay.md#information-inquiries) |
| G-05 | Room issues & complaints | P0 | Draft | [guest/during-stay.md](guest/during-stay.md#issues-and-complaints) |
| G-06 | Dining & room service | P1 | Draft | [guest/during-stay.md](guest/during-stay.md#dining) |
| G-07 | Concierge services | P1 | Draft | [guest/during-stay.md](guest/during-stay.md#concierge) |
| G-08 | Check-out assistance | P0 | Draft | [guest/during-stay.md](guest/during-stay.md#check-out) |
| G-09 | Post-stay follow-up | P2 | Draft | [guest/post-stay.md](guest/post-stay.md) |
| G-10 | Lost & found | P2 | Draft | [guest/post-stay.md](guest/post-stay.md#lost-and-found) |

### Staff Use Cases

| ID | Use Case | Priority | Status | Link |
|----|----------|----------|--------|------|
| S-01 | Conversation management | P0 | Draft | [staff/task-management.md](staff/task-management.md) |
| S-02 | Task assignment & tracking | P0 | Draft | [staff/task-management.md](staff/task-management.md#task-tracking) |
| S-03 | Guest intelligence lookup | P1 | Draft | [staff/guest-intelligence.md](staff/guest-intelligence.md) |
| S-04 | Shift handoff | P2 | Planned | [staff/task-management.md](staff/task-management.md#shift-handoff) |
| S-05 | Response assistance | P1 | Planned | [staff/task-management.md](staff/task-management.md#response-assistance) |
| S-06 | Review center | P0 | Built | [staff/review-center.md](staff/review-center.md) |
| S-07 | Knowledge base management | P0 | Built | [staff/knowledge-base.md](staff/knowledge-base.md) |
| S-08 | App configuration | P0 | Built | [staff/engine-configuration.md](staff/engine-configuration.md) |
| S-09 | Autonomy settings | P0 | Built | [staff/engine-configuration.md](staff/engine-configuration.md#autonomy-settings) |
| S-10 | Automation rules | P1 | Built | [staff/engine-configuration.md](staff/engine-configuration.md#automation-rules) |

### Operations Use Cases

| ID | Use Case | Priority | Status | Link |
|----|----------|----------|--------|------|
| O-01 | Proactive notifications | P1 | Draft | [operations/automation.md](operations/automation.md) |
| O-02 | Review monitoring | P2 | Planned | [operations/automation.md](operations/automation.md#reviews) |
| O-03 | Reporting & analytics | P2 | Planned | [operations/analytics.md](operations/analytics.md) |
| O-04 | No-show handling | P2 | Planned | [operations/automation.md](operations/automation.md#no-show) |

---

## Priority Definitions

| Priority | Definition | Criteria |
|----------|------------|----------|
| **P0** | Must have | Core functionality, launch blocker |
| **P1** | Should have | High value, target for initial release |
| **P2** | Nice to have | Valuable but can follow initial release |
| **P3** | Future | Roadmap items, not currently scoped |

---

## Use Case Template

All use cases follow this structure:

```markdown
# Use Case: [Name]

## Summary
| Attribute | Value |
|-----------|-------|
| ID | [G/S/O]-XX |
| Actor | Guest / Staff / System |
| Channels | WhatsApp, Web, etc. |
| Priority | P0 / P1 / P2 |
| Dependencies | [Links] |

## Description
[1-2 paragraphs]

## User Stories
- As a [actor], I want to [action] so that [outcome]

## Flow
### Happy Path
1. ...

### Alternative Paths
- **A1**: If [condition] → ...

## Examples
> **Guest**: "..."
> **Jack**: "..."

## Acceptance Criteria
- [ ] ...

## Related
- [Links to architecture, specs]
```

---

## Reading Guide

- **Product/Design**: Focus on user stories and examples
- **Engineering**: Review flows, acceptance criteria, and related specs
- **QA**: Use acceptance criteria for test case development

---

## Sections

- [Guest Use Cases](guest/) - Pre-arrival through post-stay
- [Staff Use Cases](staff/) - Agent and management interfaces
- [Operations Use Cases](operations/) - Automation and analytics
