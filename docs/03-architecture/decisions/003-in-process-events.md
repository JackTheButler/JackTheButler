# ADR-003: In-Process Events over Message Queue

## Status

Accepted

## Context

Components need to communicate asynchronously. For example:

- When a message is received, the dashboard needs a real-time update
- When a task is created, automation rules may need to fire
- When a conversation is escalated, staff notifications need to be sent

The standard approach for async communication is a message queue (Redis, RabbitMQ, etc.). But this adds an external service dependency.

## Decision

Use a **typed event emitter** (wrapping Node.js `EventEmitter`) for all async internal communication.

- `src/events/` defines a `TypedEventEmitter` with typed event payloads
- `src/types/events.ts` defines all event types and their payloads

**Emitters:** Core message processor, approval queue, conversation service, task service, automation actions — emit events after state changes.

**Subscribers:** WebSocket bridge (pushes to dashboard), automation event subscriber (triggers event-based rules).

## Consequences

### Positive

- No external service to deploy or manage
- Zero latency — events are delivered in-process
- Type-safe API — events and payloads are typed via `AppEvent` union
- Consistent with single-process architecture (ADR-001)

### Negative

- Events are lost on process restart (no persistence or replay)
- No cross-process communication (rules out horizontal scaling)
- No built-in retry or dead letter queue

### Why this is acceptable

Single-tenant, single-process deployment means there's no second process to communicate with. Events that matter (messages, tasks) are persisted to SQLite before being emitted, so the database is the source of truth — not the event bus.
