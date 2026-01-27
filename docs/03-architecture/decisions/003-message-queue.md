# ADR-003: Redis for Message Queue

## Status

Accepted

## Context

Jack The Butler requires asynchronous messaging for:
- Routing inbound messages to the AI Engine
- Broadcasting real-time updates to staff dashboards
- Queuing outbound messages for rate-limited channels
- Task distribution to workers
- Caching frequently accessed data

### Requirements

- Low latency for real-time feel (<50ms)
- Pub/Sub for broadcasting to multiple subscribers
- Reliable message delivery
- Simple operations (self-hosted friendly)
- Support for rate limiting
- Session storage for WebSocket connections

### Constraints

- Hotels may self-host with limited DevOps expertise
- Must handle 100-1000 messages per minute per property
- Cost-sensitive (hotels aren't big tech companies)

## Decision

Use **Redis** as the message broker, cache, and session store.

### Use Cases

| Use Case | Redis Feature |
|----------|---------------|
| Real-time updates | Pub/Sub |
| Message queuing | Lists (LPUSH/BRPOP) |
| Rate limiting | Sorted Sets + Lua scripts |
| Caching | Key-Value with TTL |
| Sessions | Hash + TTL |
| Deduplication | Sets with TTL |

### Implementation Patterns

**Pub/Sub for Real-Time Updates:**
```typescript
// Publisher (Gateway)
redis.publish('property:123:conversations', JSON.stringify(update));

// Subscriber (Dashboard WebSocket handler)
redis.subscribe('property:123:conversations', (message) => {
  broadcastToClients(message);
});
```

**Reliable Queue for Outbound Messages:**
```typescript
// Producer
await redis.lpush('outbound:whatsapp', JSON.stringify(message));

// Consumer (with reliability)
const message = await redis.brpoplpush(
  'outbound:whatsapp',
  'outbound:whatsapp:processing',
  0
);
// Process message
await redis.lrem('outbound:whatsapp:processing', 1, message);
```

**Rate Limiting:**
```typescript
const key = `ratelimit:whatsapp:${phoneNumber}`;
const current = await redis.incr(key);
if (current === 1) {
  await redis.expire(key, 60); // 60 second window
}
if (current > 80) {
  throw new RateLimitError();
}
```

## Consequences

### Positive

- **Simplicity**: Single technology for multiple use cases
- **Performance**: In-memory, extremely fast
- **Operational simplicity**: Easy to deploy, monitor, backup
- **Battle-tested**: Widely used, well-understood
- **Cost-effective**: Low resource requirements
- **Self-host friendly**: Simple to run on-premise

### Negative

- **Persistence limitations**: Not designed as primary data store
- **No exactly-once delivery**: At-most-once or at-least-once semantics
- **Memory bound**: All data must fit in RAM
- **Limited querying**: Not a full message broker

### Risks

- Message loss during Redis restart - mitigate with AOF persistence and replicas
- Memory exhaustion - mitigate with TTLs and monitoring
- Scale limitations - mitigate with Redis Cluster for larger deployments

## Alternatives Considered

### Option A: RabbitMQ

Full-featured message broker with AMQP protocol.

- **Pros**: Reliable delivery, flexible routing, dead letter queues
- **Cons**: More complex to operate, doesn't cover caching/sessions, higher resource usage

### Option B: Apache Kafka

Distributed streaming platform for high-throughput scenarios.

- **Pros**: Extreme scalability, message replay, strong durability
- **Cons**: Complex operations, overkill for our scale, high resource requirements, not self-host friendly

### Option C: PostgreSQL LISTEN/NOTIFY + Queues

Use PostgreSQL for pub/sub and queuing.

- **Pros**: Single database, transactional consistency
- **Cons**: Higher latency, doesn't scale as well for pub/sub, not designed for this use case

### Option D: AWS SQS + ElastiCache

Managed services for queuing and caching.

- **Pros**: Fully managed, scalable
- **Cons**: Cloud lock-in, not self-hostable, cost at scale

## References

- [Redis Documentation](https://redis.io/documentation)
- [Gateway Component](../c4-components/gateway.md)
- [C4 Containers](../c4-containers.md)
