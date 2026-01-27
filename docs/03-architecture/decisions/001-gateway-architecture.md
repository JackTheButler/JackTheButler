# ADR-001: Gateway-Centric Architecture

## Status

Accepted

## Context

Jack The Butler needs to orchestrate communication between multiple systems:
- Various messaging channels (WhatsApp, SMS, Email, WebChat)
- AI processing engine
- Hotel operational systems (PMS, POS, Housekeeping)
- Staff interfaces (Dashboard, Mobile App)

We need to decide how these components communicate and which component (if any) serves as the central coordinator.

### Constraints

- Real-time messaging requires low latency
- Multiple channels must be supported without duplicating logic
- Staff need real-time visibility into guest conversations
- System must handle component failures gracefully
- Hotels may want to self-host for data sovereignty

### Influences

- [Clawdbot architecture](https://github.com/clawdbot/clawdbot) uses a Gateway pattern for similar multi-channel coordination
- Microservices patterns for hospitality systems
- Event-driven architecture for real-time updates

## Decision

Adopt a **Gateway-Centric Architecture** where a central Gateway service:

1. Receives all inbound messages from channel adapters
2. Routes messages to the AI Engine for processing
3. Coordinates responses back through appropriate channels
4. Maintains conversation state and context
5. Publishes events for real-time UI updates
6. Handles escalation routing to staff

```
Channels ──► Gateway ──► AI Engine
                │
                ├──► Integration Service
                │
                └──► Staff Interfaces (via WebSocket)
```

The Gateway is the **Joint AI Control Kernel** (JACK) - the namesake of the product.

## Consequences

### Positive

- **Single source of truth**: All messages flow through one point, simplifying debugging and auditing
- **Consistent state management**: Conversation state lives in one place
- **Simplified channel adapters**: Adapters only handle protocol translation, not business logic
- **Real-time updates**: WebSocket connections to Gateway enable live dashboards
- **Graceful degradation**: Gateway can queue messages if AI Engine is slow/unavailable
- **Security boundary**: Single point to enforce authentication and rate limiting

### Negative

- **Single point of failure**: Gateway must be highly available; outage affects all channels
- **Potential bottleneck**: All traffic flows through Gateway; must scale horizontally
- **Complexity in Gateway**: Gateway accumulates responsibility; risk of becoming a monolith
- **Latency overhead**: Extra hop for all messages (minor, typically <10ms)

### Risks

- Gateway becoming too complex - mitigate by keeping it focused on routing, not business logic
- Scaling challenges - mitigate with horizontal scaling and sticky sessions for WebSocket

## Alternatives Considered

### Option A: Direct Service-to-Service Communication

Each channel adapter communicates directly with AI Engine and Integration Service.

- **Pros**: No single point of failure, potentially lower latency
- **Cons**: Duplicated routing logic, complex state management, harder to maintain conversation context, difficult real-time updates

### Option B: Message Bus Only (No Gateway)

Use Redis/Kafka as the sole coordination mechanism, with services subscribing to relevant topics.

- **Pros**: Highly decoupled, proven scalability
- **Cons**: Complex to maintain conversation state, harder to implement request-response patterns, more operational overhead

### Option C: API Gateway + Separate Services

Use a standard API Gateway (Kong, AWS API Gateway) with separate microservices.

- **Pros**: Industry-standard approach, lots of tooling
- **Cons**: Doesn't handle WebSocket well, doesn't maintain conversation context, requires additional state service

## References

- [Clawdbot Gateway Architecture](https://github.com/clawdbot/clawdbot)
- [C4 Containers Diagram](../c4-containers.md)
- [Gateway Component Details](../c4-components/gateway.md)
