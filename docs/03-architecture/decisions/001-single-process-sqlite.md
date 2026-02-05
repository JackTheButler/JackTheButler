# ADR-001: Single-Process Monolith with SQLite

## Status

Accepted

## Context

Jack The Butler is designed for self-hosted deployment on hotel infrastructure. Hotels need a system that:

- Runs without a DevOps team
- Requires minimal configuration
- Keeps guest data on-premise
- Is easy to back up and restore

## Decision

Run everything in a single Node.js process with SQLite as the only database.

- **One process:** Gateway, AI engine, automation, and all services share a single process
- **One database file:** SQLite at `data/jack.db` with WAL mode for concurrent reads
- **One container:** Docker image with no external service dependencies
- **Vector search:** sqlite-vec extension embedded in the same database

## Consequences

### Positive

- Zero-config deployment: `docker run` with a volume mount
- Backup is copying one file
- No network latency between components — direct function calls
- No connection pooling, no ORM complexity for distributed transactions

### Negative

- Vertical scaling only (single process, single file database)
- SQLite write throughput is limited to one writer at a time
- No horizontal scaling without architectural changes

### Why this is acceptable

A single hotel property generates ~50–500 conversations/day. SQLite handles thousands of writes per second. The bottleneck is AI provider API latency, not database throughput.
