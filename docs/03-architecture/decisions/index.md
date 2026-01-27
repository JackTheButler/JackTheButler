# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for Jack The Butler.

---

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help us:

- Remember why decisions were made
- Onboard new team members
- Revisit decisions when context changes
- Maintain consistency across the codebase

---

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [001](001-gateway-architecture.md) | Gateway-Centric Architecture | Accepted | 2024-01 |
| [002](002-ai-provider-abstraction.md) | AI Provider Abstraction | Accepted | 2024-01 |
| [003](003-message-queue.md) | Redis for Message Queue | Accepted | 2024-01 |
| [004](004-pms-integration-pattern.md) | PMS Integration Pattern | Proposed | 2024-02 |

---

## ADR Status Definitions

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet decided |
| **Accepted** | Decision made and in effect |
| **Deprecated** | No longer applies, superseded |
| **Superseded** | Replaced by another ADR |

---

## ADR Template

```markdown
# ADR-XXX: [Title]

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-YYY

## Context

[What situation prompted this decision? What constraints exist?]

## Decision

[What did we decide to do?]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Drawback 1]
- [Drawback 2]

### Risks
- [Risk 1]

## Alternatives Considered

### Option A: [Name]
- Pros: ...
- Cons: ...

### Option B: [Name]
- Pros: ...
- Cons: ...

## References

- [Link to relevant documentation]
```

---

## Creating a New ADR

1. Copy the template above
2. Use the next available number (e.g., `005-*.md`)
3. Fill in all sections
4. Submit for team review
5. Update status once decided

---

## Related

- [Architecture Overview](../index.md)
- [C4 Containers](../c4-containers.md)
