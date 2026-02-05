# ADR-004: AI Autonomy Levels with Approval Queue

## Status

Accepted

## Context

Hotels have different comfort levels with AI acting on their behalf. Some want every AI response reviewed by staff. Others trust the AI to handle routine requests autonomously.

A single on/off toggle isn't sufficient — hotels need granular control over what the AI can do automatically (e.g. auto-respond to FAQs but require approval for task creation).

## Decision

Implement a **two-level autonomy system** with per-action-type configuration:

- **L1 (Assisted):** Action requires staff approval before execution
- **L2 (Supervised):** Action executes automatically, staff can monitor via dashboard

Each action type (`respondToGuest`, `createHousekeepingTask`, `issueRefund`, etc.) is independently configurable to L1 or L2.

An **approval queue** (`src/core/approval-queue.ts`, `approval_queue` table) holds pending actions when L1 is active. Staff approve or reject from the dashboard.

Additionally, a **confidence threshold** can override L2 to L1 — if the AI's confidence score is too low, the action is queued for approval regardless of the autonomy level setting.

## Consequences

### Positive

- Hotels start cautious (L1 for everything) and relax controls as they build trust
- Granular per-action control — auto-respond to greetings but require approval for refunds
- Confidence-based fallback catches uncertain AI responses even in L2 mode
- All queued actions are auditable

### Negative

- L1 mode adds latency — guests wait for staff to approve each response
- Approval queue requires staff to be actively monitoring the dashboard

### Why this is acceptable

L1 latency is expected during the trust-building phase. The system sends a contextual holding message to the guest (e.g. "I've noted your housekeeping request, our team will confirm shortly") while the action awaits approval. Hotels are expected to migrate action types to L2 as they gain confidence in the AI's accuracy.
