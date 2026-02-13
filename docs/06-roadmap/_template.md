# Feature Name

> Phase: Planned
> Status: Not Started
> Priority: High | Medium | Low
> Depends On: [Other Feature](./000-other-feature.md) (if applicable, remove if none)

## Overview

What is this feature in 2-3 sentences. What problem does it solve and who benefits from it.

## Goals

Numbered list of high-level goals — what success looks like. Keep it to 3-6 items. These are outcomes, not tasks.

1. **Goal name** — One sentence description
2. **Goal name** — One sentence description
3. **Goal name** — One sentence description

## Key Features

Split by audience when the feature touches both guests and staff. Use a single flat list if it only affects one group.

### User-Facing

Numbered list. Each item: **bold name** + one sentence explaining what the user experiences.

### Staff-Facing (Dashboard)

Numbered list. Same format.

---

## Architecture

How the feature fits into the existing system. Include:

- **Where it lives** — which directories/files, how it maps to the kernel/app/adapter architecture
- **How it connects** — data flow diagram (text-based), which existing systems it integrates with
- **Technical details** — type changes, tech stack choices, protocols. Keep these as subsections here rather than standalone sections.

---

## Core Concepts

The 2-4 major concepts that define how this feature works. Each gets its own top-level section. These are the sections a developer needs to read to understand the feature before implementing.

Name these sections after the actual concepts, not generic labels. Examples from past docs: "Widget Embed Model", "Widget Actions", "Session Management".

For each concept section, explain:
- What it is and why it exists
- How it works (flow diagrams, interface definitions, state transitions)
- Edge cases and how they're handled

---

## Security

How this feature handles security concerns. Only include if the feature has security implications (public-facing, handles sensitive data, authentication/authorization). Remove this section entirely if not applicable.

Cover:
- What data is exposed and to whom
- How access is controlled
- Abuse prevention measures
- Data handling (what's stored, what's discarded)

---

## Admin Experience

How admins configure and manage this feature. Only include if the feature has admin-facing configuration. Remove if not applicable.

- **Configuration** — what settings are available, where they live in the dashboard
- **Setup steps** — numbered walkthrough of how an admin gets this feature running

---

## Key Differences

Comparison table showing how this feature relates to or differs from similar existing functionality. Useful when the feature is a new variant of something that already exists (e.g., a new channel type, a new AI provider). Remove if not applicable.

---

## What's NOT in Scope (Future)

Bulleted list of things that are intentionally excluded from this version. Prevents scope creep and sets expectations. Each item: **bold name** + one sentence explaining why it's deferred.

---

## Data Model

Database schema changes required by this feature. Only include if the feature adds or modifies tables/columns. Remove if not applicable.

- New tables (SQL or TypeScript schema definition)
- Column additions to existing tables
- Migration notes (what happens to existing data)

---

## Implementation Phases

Ordered list of phases. Each phase has:
- **Title** — short, descriptive
- **Goal** — one sentence stating what's true when this phase is done
- **Description** — 1-2 sentences on what's built. No task-level detail — that comes during implementation planning.

Structure phases so that earlier phases deliver a testable proof of concept, and later phases layer on design, features, and hardening.

---

## Related Documents

Links to other roadmap docs or architecture docs that this feature connects to.

- [Related Feature](./000-related.md) — one line on how it relates
