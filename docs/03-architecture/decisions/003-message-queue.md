# ADR-003: In-Memory Queue with Optional Redis

## Status

Accepted (Updated for self-hosted architecture)

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
- **Zero external dependencies** (self-hosted friendly)
- Support for rate limiting
- Session storage for WebSocket connections

### Constraints

- Hotels self-host with limited DevOps expertise
- Single-tenant deployment (one instance per hotel)
- Must handle 100-1000 messages per minute per property
- Cost-sensitive (hotels aren't big tech companies)

## Decision

Use **in-memory queues and event emitters** as the default, with **Redis as an optional enhancement** for larger deployments.

### Default: In-Memory (Self-Hosted)

For single-tenant self-hosted deployments, use Node.js EventEmitter and in-memory data structures:

```typescript
import { EventEmitter } from 'events';

// Simple pub/sub
const events = new EventEmitter();
events.emit('conversation:update', { conversationId: '123', ... });

// In-memory queue with persistence
class InMemoryQueue {
  private queue: Message[] = [];

  async push(message: Message) {
    this.queue.push(message);
    // Optionally persist to SQLite for durability
  }

  async pop(): Promise<Message | undefined> {
    return this.queue.shift();
  }
}

// LRU cache for hot data
import { LRUCache } from 'lru-cache';
const cache = new LRUCache({ max: 1000, ttl: 3600000 });
```

### Optional: Redis (High-Volume)

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

### Positive (In-Memory Default)

- **Zero dependencies**: No external services to install or manage
- **Simplicity**: Single process, no network overhead
- **Self-host friendly**: Works out of the box
- **Performance**: No serialization or network latency
- **Cost-effective**: No additional infrastructure

### Positive (Optional Redis)

- **Horizontal scaling**: Multiple instances can share state
- **Persistence**: Messages survive process restarts
- **Battle-tested**: Widely used for this purpose

### Negative

- **In-memory limitations**: State lost on restart (acceptable for cache/sessions)
- **No horizontal scaling** without Redis
- **Memory bound**: Queue size limited by process memory

### Mitigations

- Critical data (messages, tasks) stored in SQLite, not queue
- Queue used only for transient operations
- LRU eviction prevents memory exhaustion
- Optional Redis upgrade path for growth

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
