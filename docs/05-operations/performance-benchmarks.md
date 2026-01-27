# Performance Benchmarks

This document defines performance targets and benchmarks for Jack The Butler.

---

## Overview

Performance targets ensure Jack provides responsive guest experiences and efficient staff operations. Benchmarks are categorized by:

- API response times
- Message processing latency
- AI generation times
- Database query performance
- Concurrent capacity

---

## API Response Time Targets

### HTTP Endpoints

| Category | Target (p50) | Target (p95) | Target (p99) | Max |
|----------|--------------|--------------|--------------|-----|
| Health checks | < 5ms | < 10ms | < 20ms | 50ms |
| Authentication | < 50ms | < 100ms | < 200ms | 500ms |
| Read operations | < 20ms | < 50ms | < 100ms | 200ms |
| Write operations | < 30ms | < 75ms | < 150ms | 300ms |
| List/search | < 50ms | < 100ms | < 200ms | 500ms |
| Webhook receipt | < 10ms | < 20ms | < 50ms | 100ms |

### WebSocket Operations

| Operation | Target | Max |
|-----------|--------|-----|
| Connection establishment | < 100ms | 500ms |
| Message send | < 20ms | 100ms |
| Ping/pong roundtrip | < 50ms | 200ms |
| Event broadcast | < 10ms | 50ms |

---

## Message Processing Latency

### End-to-End Processing

From message receipt to response sent:

| Scenario | Target | Acceptable | Max |
|----------|--------|------------|-----|
| Simple FAQ (cached) | < 500ms | < 1s | 2s |
| Knowledge base query | < 1s | < 2s | 3s |
| AI-generated response | < 2s | < 3s | 5s |
| Complex multi-step | < 3s | < 5s | 10s |
| With PMS lookup | < 2s | < 3s | 5s |

### Component Breakdown

| Component | Target | Max |
|-----------|--------|-----|
| Webhook validation | < 5ms | 20ms |
| Message parsing | < 10ms | 50ms |
| Guest lookup | < 15ms | 50ms |
| Conversation retrieval | < 20ms | 75ms |
| Intent classification | < 200ms | 500ms |
| Knowledge base search | < 100ms | 300ms |
| AI response generation | < 1.5s | 4s |
| Channel adapter send | < 200ms | 1s |
| Database persistence | < 20ms | 100ms |

---

## AI Provider Performance

### Claude API

| Operation | Target | Timeout |
|-----------|--------|---------|
| Intent classification (Haiku) | < 200ms | 2s |
| Response generation (Sonnet) | < 1.5s | 10s |
| Complex reasoning (Opus) | < 5s | 30s |
| Streaming first token | < 300ms | 2s |

### OpenAI API (Fallback)

| Operation | Target | Timeout |
|-----------|--------|---------|
| Chat completion (GPT-4o) | < 2s | 15s |
| Embedding generation | < 100ms | 2s |

### Ollama (Local Fallback)

| Operation | Target | Timeout |
|-----------|--------|---------|
| Inference (7B model) | < 3s | 30s |
| Embedding generation | < 200ms | 5s |

---

## Database Performance

### SQLite Query Targets

| Query Type | Target | Max | Index Required |
|------------|--------|-----|----------------|
| Point lookup (by ID) | < 1ms | 5ms | Primary key |
| Foreign key lookup | < 2ms | 10ms | Yes |
| Simple filter | < 5ms | 20ms | Depends |
| Range query | < 10ms | 50ms | Yes |
| Full-text search | < 20ms | 100ms | FTS5 |
| Vector similarity | < 50ms | 200ms | sqlite-vec |
| Aggregation | < 20ms | 100ms | Depends |
| Join (2 tables) | < 10ms | 50ms | Yes |
| Join (3+ tables) | < 20ms | 100ms | Yes |

### Write Operations

| Operation | Target | Max |
|-----------|--------|-----|
| Single insert | < 2ms | 10ms |
| Single update | < 2ms | 10ms |
| Batch insert (100 rows) | < 20ms | 100ms |
| Transaction (5 operations) | < 10ms | 50ms |

### Database Size Limits

| Metric | Recommended | Maximum |
|--------|-------------|---------|
| Database file size | < 5GB | 10GB |
| Single table rows | < 10M | 50M |
| Concurrent connections | 5 | 10 |
| WAL file size | < 100MB | 500MB |

---

## Concurrent Capacity

### Connections

| Resource | Target | Max |
|----------|--------|-----|
| HTTP connections | 1,000 | 5,000 |
| WebSocket connections | 500 | 2,000 |
| Database connections | 5 | 10 |
| AI provider connections | 10 | 50 |

### Throughput

| Metric | Target | Max |
|--------|--------|-----|
| Messages per second | 50 | 200 |
| API requests per second | 100 | 500 |
| WebSocket events per second | 200 | 1,000 |
| Background jobs per second | 20 | 100 |

### Guest Capacity

| Metric | Target | Notes |
|--------|--------|-------|
| Active conversations | 500 | Concurrent |
| Messages per day | 50,000 | Total |
| Guests in database | 100,000 | Total |
| Conversations per day | 2,000 | New |

---

## Memory Usage

### Node.js Process

| Metric | Target | Alert | Max |
|--------|--------|-------|-----|
| Heap used | < 256MB | > 384MB | 512MB |
| Heap total | < 512MB | > 768MB | 1GB |
| RSS | < 512MB | > 768MB | 1GB |
| External | < 64MB | > 128MB | 256MB |

### Caches

| Cache | Size | TTL | Notes |
|-------|------|-----|-------|
| LRU cache (general) | 1,000 entries | 5 min | Configurable |
| Knowledge embeddings | 10,000 vectors | N/A | Persistent |
| Rate limit counters | 10,000 entries | 1 hour | SQLite |
| Session cache | 1,000 entries | 15 min | JWT tokens |

---

## Startup Performance

| Phase | Target | Max |
|-------|--------|-----|
| Process start | < 500ms | 2s |
| Database connection | < 100ms | 500ms |
| Migration check | < 200ms | 1s |
| Channel initialization | < 500ms | 2s |
| AI provider check | < 1s | 5s |
| Total cold start | < 3s | 10s |
| Ready to serve | < 5s | 15s |

---

## Benchmarking Tools

### Load Testing

```typescript
// Using autocannon for HTTP load testing
import autocannon from 'autocannon';

const result = await autocannon({
  url: 'http://localhost:3000/api/v1/health/live',
  connections: 100,
  duration: 30,
  headers: {
    'Authorization': 'Bearer {token}',
  },
});

console.log(autocannon.printResult(result));
```

### Database Benchmarking

```typescript
// Benchmark database operations
async function benchmarkDatabase() {
  const iterations = 1000;

  // Benchmark reads
  const readStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await db.guests.findById('guest_test123');
  }
  const readTime = (performance.now() - readStart) / iterations;
  console.log(`Average read: ${readTime.toFixed(2)}ms`);

  // Benchmark writes
  const writeStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await db.messages.create({
      id: `msg_bench_${i}`,
      conversationId: 'conv_test',
      content: 'Benchmark message',
      direction: 'inbound',
    });
  }
  const writeTime = (performance.now() - writeStart) / iterations;
  console.log(`Average write: ${writeTime.toFixed(2)}ms`);
}
```

### AI Response Timing

```typescript
// Measure AI response times
async function benchmarkAI() {
  const prompts = [
    'What time is checkout?',
    'I need extra towels',
    'Can you recommend a restaurant?',
  ];

  for (const prompt of prompts) {
    const start = performance.now();
    await aiEngine.generateResponse(prompt, context);
    const duration = performance.now() - start;
    console.log(`"${prompt}": ${duration.toFixed(0)}ms`);
  }
}
```

---

## Performance Monitoring

### Key Metrics to Track

```typescript
interface PerformanceMetrics {
  // Response times (percentiles)
  httpResponseP50: number;
  httpResponseP95: number;
  httpResponseP99: number;

  // Message processing
  messageProcessingP50: number;
  messageProcessingP95: number;
  aiGenerationP50: number;
  aiGenerationP95: number;

  // Throughput
  requestsPerSecond: number;
  messagesPerSecond: number;
  errorsPerSecond: number;

  // Resources
  heapUsedMB: number;
  cpuPercent: number;
  dbConnectionsActive: number;

  // Saturation
  activeConnections: number;
  pendingJobs: number;
  queueDepth: number;
}
```

### Prometheus Metrics

```typescript
// Expose metrics for Prometheus
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const messageProcessingDuration = new Histogram({
  name: 'message_processing_duration_seconds',
  help: 'Message processing duration in seconds',
  labelNames: ['channel', 'intent'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
});

const aiResponseDuration = new Histogram({
  name: 'ai_response_duration_seconds',
  help: 'AI response generation duration in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});
```

---

## Performance Optimization Guidelines

### Database Optimization

1. **Use indexes** for all filtered/joined columns
2. **Enable WAL mode** for better concurrency
3. **Batch operations** when possible
4. **Use prepared statements** for repeated queries
5. **Vacuum periodically** to reclaim space

### AI Optimization

1. **Use streaming** for long responses
2. **Cache common responses** (FAQ answers)
3. **Use Haiku** for classification, Sonnet for generation
4. **Batch embeddings** when updating knowledge base
5. **Set appropriate timeouts** to fail fast

### API Optimization

1. **Enable compression** (gzip/brotli)
2. **Use connection pooling** for external APIs
3. **Implement request coalescing** for duplicate requests
4. **Cache static responses** (health, config)
5. **Use ETags** for conditional requests

---

## Degraded Performance Handling

### Response Time Alerts

| Threshold | Action |
|-----------|--------|
| p95 > 2x target | Log warning |
| p95 > 3x target | Alert on-call |
| p99 > max | Circuit breaker |
| Error rate > 1% | Alert on-call |
| Error rate > 5% | Page on-call |

### Graceful Degradation

```typescript
// Degrade AI responses under load
async function getResponse(message: string): Promise<string> {
  const load = await getSystemLoad();

  if (load > 0.9) {
    // High load: use cached/template responses only
    return getCachedResponse(message) || FALLBACK_RESPONSE;
  }

  if (load > 0.7) {
    // Medium load: use faster model
    return generateWithHaiku(message);
  }

  // Normal load: full AI response
  return generateWithSonnet(message);
}
```

---

## Configuration

```yaml
performance:
  # Timeouts
  timeouts:
    httpRequest: 30000           # 30 seconds
    aiProvider: 10000            # 10 seconds
    databaseQuery: 5000          # 5 seconds
    channelSend: 5000            # 5 seconds

  # Thresholds
  thresholds:
    httpResponseWarning: 200     # ms
    httpResponseError: 500       # ms
    aiResponseWarning: 3000      # ms
    aiResponseError: 10000       # ms

  # Limits
  limits:
    maxConcurrentRequests: 500
    maxWebSocketConnections: 1000
    maxJobQueueSize: 10000

  # Monitoring
  monitoring:
    enabled: true
    sampleRate: 0.1              # 10% sampling
    histogramBuckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

---

## Related

- [Health Checks](../04-specs/api/health-checks.md) - Health monitoring
- [Logging](logging.md) - Performance logging
- [Deployment](deployment.md) - Production configuration
