# Health Check Specification

This document defines health check endpoints for Jack The Butler.

---

## Overview

Health checks enable monitoring systems to verify Jack is operational. Three levels of checks are provided:

| Endpoint | Purpose | Response Time | Check Depth |
|----------|---------|---------------|-------------|
| `/health/live` | Is process running? | <10ms | Minimal |
| `/health/ready` | Can accept traffic? | <100ms | Dependencies |
| `/health/detailed` | Full system status | <5s | Comprehensive |

---

## Liveness Check

### Endpoint

```http
GET /health/live
```

### Purpose

Confirms the process is running and not deadlocked. Used by orchestrators (Docker, Kubernetes) to restart unhealthy instances.

### Response

**Healthy (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Unhealthy (503 Service Unavailable):**
```json
{
  "status": "error",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Implementation

```typescript
app.get('/health/live', (ctx) => {
  // Simple check - if we can respond, we're alive
  ctx.status = 200;
  ctx.body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});
```

---

## Readiness Check

### Endpoint

```http
GET /health/ready
```

### Purpose

Confirms all critical dependencies are available and the service can handle requests. Used by load balancers to route traffic.

### Response

**Ready (200 OK):**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "database": "ok",
    "aiProvider": "ok",
    "channels": "ok"
  }
}
```

**Not Ready (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "database": "ok",
    "aiProvider": "error",
    "channels": "ok"
  },
  "message": "AI provider unavailable"
}
```

### Implementation

```typescript
interface ReadinessCheck {
  name: string;
  check: () => Promise<CheckResult>;
  critical: boolean;
}

const READINESS_CHECKS: ReadinessCheck[] = [
  {
    name: 'database',
    check: checkDatabase,
    critical: true,
  },
  {
    name: 'aiProvider',
    check: checkAIProvider,
    critical: true,
  },
  {
    name: 'channels',
    check: checkChannels,
    critical: false,  // Can operate with degraded channels
  },
];

app.get('/health/ready', async (ctx) => {
  const results: Record<string, string> = {};
  let ready = true;
  let message: string | undefined;

  for (const check of READINESS_CHECKS) {
    try {
      const result = await Promise.race([
        check.check(),
        timeout(1000),  // 1 second timeout per check
      ]);
      results[check.name] = result.status;

      if (result.status !== 'ok' && check.critical) {
        ready = false;
        message = message || `${check.name}: ${result.message}`;
      }
    } catch (error) {
      results[check.name] = 'error';
      if (check.critical) {
        ready = false;
        message = message || `${check.name}: ${error.message}`;
      }
    }
  }

  ctx.status = ready ? 200 : 503;
  ctx.body = {
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: results,
    message,
  };
});
```

---

## Detailed Health Check

### Endpoint

```http
GET /health/detailed
Authorization: Bearer {token}
```

### Purpose

Provides comprehensive system status including metrics. Requires authentication. Used by monitoring dashboards and debugging.

### Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.2.3",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "ok",
      "latency": 5,
      "details": {
        "connectionPool": {
          "active": 2,
          "idle": 8,
          "max": 10
        },
        "size": "245 MB",
        "walSize": "12 MB"
      }
    },
    "aiProvider": {
      "status": "ok",
      "latency": 245,
      "details": {
        "provider": "claude",
        "model": "claude-sonnet-4-20250514",
        "rateLimit": {
          "remaining": 950,
          "reset": "2024-01-15T11:00:00Z"
        }
      }
    },
    "channels": {
      "status": "degraded",
      "details": {
        "whatsapp": {
          "status": "ok",
          "latency": 120
        },
        "sms": {
          "status": "ok",
          "latency": 85
        },
        "email": {
          "status": "error",
          "error": "SMTP connection timeout",
          "lastSuccess": "2024-01-15T10:25:00Z"
        },
        "webchat": {
          "status": "ok",
          "activeConnections": 12
        }
      }
    },
    "scheduler": {
      "status": "ok",
      "details": {
        "pendingJobs": 5,
        "runningJobs": 2,
        "failedJobs24h": 3,
        "nextJob": "2024-01-15T10:35:00Z"
      }
    },
    "memory": {
      "status": "ok",
      "details": {
        "heapUsed": "125 MB",
        "heapTotal": "256 MB",
        "external": "12 MB",
        "rss": "310 MB"
      }
    },
    "pmsSync": {
      "status": "ok",
      "details": {
        "lastSync": "2024-01-15T10:28:00Z",
        "nextSync": "2024-01-15T10:33:00Z",
        "recordsSynced": 145,
        "conflicts": 0
      }
    }
  },
  "metrics": {
    "requests": {
      "total": 15420,
      "rate": 12.5,
      "errors": 23,
      "errorRate": 0.15
    },
    "messages": {
      "received24h": 1250,
      "sent24h": 1180,
      "avgResponseTime": 2.3
    },
    "conversations": {
      "active": 45,
      "escalated": 3,
      "resolved24h": 120
    }
  }
}
```

### Implementation

```typescript
app.get('/health/detailed', requireAuth, async (ctx) => {
  const checks: Record<string, DetailedCheckResult> = {};

  // Database check
  checks.database = await checkDatabaseDetailed();

  // AI Provider check
  checks.aiProvider = await checkAIProviderDetailed();

  // Channels check
  checks.channels = await checkChannelsDetailed();

  // Scheduler check
  checks.scheduler = await checkSchedulerDetailed();

  // Memory check
  checks.memory = checkMemory();

  // PMS Sync check
  checks.pmsSync = await checkPMSSyncDetailed();

  // Determine overall status
  const status = determineOverallStatus(checks);

  // Gather metrics
  const metrics = await gatherMetrics();

  ctx.body = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || '0.0.0',
    uptime: process.uptime(),
    checks,
    metrics,
  };
});
```

---

## Individual Check Implementations

### Database Check

```typescript
async function checkDatabase(): Promise<CheckResult> {
  try {
    const start = Date.now();
    await db.prepare('SELECT 1').get();
    const latency = Date.now() - start;

    return {
      status: 'ok',
      latency,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
    };
  }
}

async function checkDatabaseDetailed(): Promise<DetailedCheckResult> {
  const basic = await checkDatabase();

  if (basic.status !== 'ok') {
    return basic;
  }

  // Get additional details
  const stats = await db.prepare(`
    SELECT
      page_count * page_size as size,
      (SELECT page_count * page_size FROM pragma_wal_checkpoint) as wal_size
    FROM pragma_page_count, pragma_page_size
  `).get();

  return {
    status: 'ok',
    latency: basic.latency,
    details: {
      size: formatBytes(stats.size),
      walSize: formatBytes(stats.wal_size),
    },
  };
}
```

### AI Provider Check

```typescript
async function checkAIProvider(): Promise<CheckResult> {
  try {
    const start = Date.now();
    // Light test request
    await aiProvider.complete({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1,
    });
    const latency = Date.now() - start;

    return { status: 'ok', latency };
  } catch (error) {
    // Check if it's a rate limit (still "working")
    if (error.code === 'rate_limited') {
      return {
        status: 'ok',
        message: 'Rate limited but operational',
      };
    }
    return {
      status: 'error',
      message: error.message,
    };
  }
}
```

### Channel Checks

```typescript
async function checkChannels(): Promise<CheckResult> {
  const results = await Promise.all([
    checkWhatsApp(),
    checkSMS(),
    checkEmail(),
    checkWebChat(),
  ]);

  const hasError = results.some(r => r.status === 'error');
  const allOk = results.every(r => r.status === 'ok');

  return {
    status: allOk ? 'ok' : hasError ? 'degraded' : 'ok',
  };
}

async function checkWhatsApp(): Promise<CheckResult> {
  try {
    // Verify token is valid
    const response = await fetch(`${WHATSAPP_API_URL}/me`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (response.ok) {
      return { status: 'ok' };
    }
    return { status: 'error', message: 'Invalid token' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

### Memory Check

```typescript
function checkMemory(): DetailedCheckResult {
  const usage = process.memoryUsage();
  const heapUsedPercent = usage.heapUsed / usage.heapTotal;

  let status: 'ok' | 'warning' | 'error' = 'ok';
  if (heapUsedPercent > 0.9) {
    status = 'error';
  } else if (heapUsedPercent > 0.8) {
    status = 'warning';
  }

  return {
    status,
    details: {
      heapUsed: formatBytes(usage.heapUsed),
      heapTotal: formatBytes(usage.heapTotal),
      external: formatBytes(usage.external),
      rss: formatBytes(usage.rss),
    },
  };
}
```

---

## Kubernetes / Docker Configuration

### Kubernetes Probes

```yaml
# deployment.yaml
spec:
  containers:
    - name: jack
      livenessProbe:
        httpGet:
          path: /health/live
          port: 3000
        initialDelaySeconds: 10
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 3

      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
        timeoutSeconds: 3
        failureThreshold: 2

      startupProbe:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 0
        periodSeconds: 5
        timeoutSeconds: 3
        failureThreshold: 30  # 2.5 minutes max startup
```

### Docker Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1
```

### docker-compose

```yaml
services:
  jack:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/live"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

---

## Monitoring Integration

### Prometheus Metrics

```typescript
// Expose Prometheus metrics
app.get('/metrics', async (ctx) => {
  ctx.set('Content-Type', 'text/plain');
  ctx.body = await prometheus.register.metrics();
});

// Health check metrics
const healthGauge = new prometheus.Gauge({
  name: 'jack_health_status',
  help: 'Health check status (1=ok, 0=error)',
  labelNames: ['check'],
});

// Update on each health check
healthGauge.set({ check: 'database' }, 1);
healthGauge.set({ check: 'aiProvider' }, 1);
```

### Status Page

```typescript
// External status page webhook
async function updateStatusPage(status: HealthStatus): Promise<void> {
  if (!process.env.STATUS_PAGE_API_KEY) return;

  await fetch('https://api.statuspage.io/v1/components/{id}', {
    method: 'PATCH',
    headers: {
      Authorization: `OAuth ${process.env.STATUS_PAGE_API_KEY}`,
    },
    body: JSON.stringify({
      component: {
        status: mapToStatusPageStatus(status),
      },
    }),
  });
}

function mapToStatusPageStatus(status: string): string {
  switch (status) {
    case 'healthy': return 'operational';
    case 'degraded': return 'degraded_performance';
    case 'unhealthy': return 'major_outage';
    default: return 'under_maintenance';
  }
}
```

---

## Configuration

```yaml
health:
  # Timeouts for individual checks
  checkTimeouts:
    database: 1000
    aiProvider: 5000
    channels: 2000
    pmsSync: 1000

  # Thresholds
  thresholds:
    memoryWarning: 0.8
    memoryCritical: 0.9
    latencyWarning: 1000
    latencyCritical: 5000

  # Cache duration for detailed checks
  detailedCacheTTL: 5000

  # Expose metrics endpoint
  metricsEnabled: true
```

---

## Related

- [Gateway API](gateway-api.md) - API specification
- [Error Handling](../../05-operations/error-handling.md) - Error patterns
- [Deployment](../../05-operations/deployment.md) - Container configuration
