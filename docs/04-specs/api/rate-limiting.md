# Rate Limiting Specification

This document defines the rate limiting implementation for Jack The Butler.

---

## Overview

Rate limiting protects Jack from abuse and ensures fair resource usage. The implementation uses a sliding window algorithm with SQLite-backed storage for durability.

---

## Storage Architecture

### Why SQLite (Not In-Memory)

| Factor | In-Memory | SQLite |
|--------|-----------|--------|
| Server restart | Limits reset | Persisted |
| Memory pressure | Grows unbounded | Fixed overhead |
| Multi-process | Not shared | Shared via file |
| Complexity | Simple | Slightly more |

**Decision:** Use SQLite for rate limit storage because:
1. Self-hosted installations may restart frequently
2. Single-tenant means low write volume
3. Consistency across process restarts is valuable

### Schema

```sql
CREATE TABLE rate_limit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,              -- Rate limit key (e.g., "api:staff_123")
  timestamp INTEGER NOT NULL,      -- Unix timestamp (seconds)
  created_at TEXT DEFAULT (datetime('now')),

  -- Index for efficient queries
  UNIQUE(key, timestamp)
);

-- Cleanup old entries
CREATE INDEX idx_rate_limit_timestamp ON rate_limit_entries(timestamp);

-- Fast lookups by key
CREATE INDEX idx_rate_limit_key ON rate_limit_entries(key);
```

### Cleanup Job

```typescript
// Scheduled job to clean old entries
async function cleanupRateLimitEntries(): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

  const result = await db.prepare(`
    DELETE FROM rate_limit_entries WHERE timestamp < ?
  `).run(cutoff);

  logger.debug('Rate limit cleanup', { deletedRows: result.changes });
}

// Run every 15 minutes
scheduler.schedule('rate_limit_cleanup', '*/15 * * * *', cleanupRateLimitEntries);
```

---

## Rate Limiter Implementation

### Sliding Window Counter

```typescript
interface RateLimitConfig {
  windowMs: number;              // Window size in milliseconds
  maxRequests: number;           // Max requests per window
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;           // Seconds until retry (if blocked)
}

class SlidingWindowRateLimiter {
  constructor(private db: Database) {}

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - Math.floor(config.windowMs / 1000);

    // Count requests in current window
    const count = await this.getRequestCount(key, windowStart, now);

    if (count >= config.maxRequests) {
      // Find when oldest request expires
      const oldestInWindow = await this.getOldestTimestamp(key, windowStart);
      const retryAfter = oldestInWindow
        ? oldestInWindow + Math.floor(config.windowMs / 1000) - now
        : Math.floor(config.windowMs / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date((now + retryAfter) * 1000),
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - count,
      resetAt: new Date((windowStart + Math.floor(config.windowMs / 1000)) * 1000),
    };
  }

  async record(key: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await this.db.prepare(`
      INSERT OR REPLACE INTO rate_limit_entries (key, timestamp)
      VALUES (?, ?)
    `).run(key, now);
  }

  async checkAndRecord(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const result = await this.check(key, config);

    if (result.allowed) {
      await this.record(key);
      result.remaining--;
    }

    return result;
  }

  private async getRequestCount(key: string, start: number, end: number): Promise<number> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count
      FROM rate_limit_entries
      WHERE key = ? AND timestamp >= ? AND timestamp <= ?
    `).get(key, start, end);

    return result?.count || 0;
  }

  private async getOldestTimestamp(key: string, start: number): Promise<number | null> {
    const result = await this.db.prepare(`
      SELECT MIN(timestamp) as oldest
      FROM rate_limit_entries
      WHERE key = ? AND timestamp >= ?
    `).get(key, start);

    return result?.oldest || null;
  }
}
```

---

## Rate Limit Tiers

### API Rate Limits

| Endpoint Category | Window | Limit | Key |
|-------------------|--------|-------|-----|
| Authentication | 15 min | 5 | IP address |
| General API | 1 min | 100 | Staff ID |
| Message Send | 1 min | 60 | Staff ID |
| Search | 1 min | 30 | Staff ID |
| Bulk Operations | 1 hour | 10 | Staff ID |
| Webhooks | 1 min | 1000 | Source IP |

### Configuration

```typescript
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Authentication endpoints
  'auth:login': {
    windowMs: 15 * 60 * 1000,    // 15 minutes
    maxRequests: 5,
  },
  'auth:refresh': {
    windowMs: 5 * 60 * 1000,     // 5 minutes
    maxRequests: 10,
  },

  // General API
  'api:default': {
    windowMs: 60 * 1000,         // 1 minute
    maxRequests: 100,
  },

  // Message operations
  'api:messages': {
    windowMs: 60 * 1000,         // 1 minute
    maxRequests: 60,
  },

  // Search (more expensive)
  'api:search': {
    windowMs: 60 * 1000,         // 1 minute
    maxRequests: 30,
  },

  // Bulk operations
  'api:bulk': {
    windowMs: 60 * 60 * 1000,    // 1 hour
    maxRequests: 10,
  },

  // Webhooks (high volume expected)
  'webhook:inbound': {
    windowMs: 60 * 1000,         // 1 minute
    maxRequests: 1000,
  },
};
```

---

## Middleware Implementation

### HTTP Middleware

```typescript
function rateLimitMiddleware(category: string) {
  return async (ctx: Context, next: Next) => {
    const config = RATE_LIMIT_CONFIGS[category] || RATE_LIMIT_CONFIGS['api:default'];
    const key = getRateLimitKey(category, ctx);

    const result = await rateLimiter.checkAndRecord(key, config);

    // Set rate limit headers
    ctx.set('X-RateLimit-Limit', config.maxRequests.toString());
    ctx.set('X-RateLimit-Remaining', result.remaining.toString());
    ctx.set('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString());

    if (!result.allowed) {
      ctx.set('Retry-After', result.retryAfter!.toString());
      ctx.status = 429;
      ctx.body = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          retryAfter: result.retryAfter,
        },
      };
      return;
    }

    await next();
  };
}

function getRateLimitKey(category: string, ctx: Context): string {
  // Authentication uses IP
  if (category.startsWith('auth:')) {
    return `${category}:${ctx.ip}`;
  }

  // Webhooks use source IP
  if (category.startsWith('webhook:')) {
    return `${category}:${ctx.ip}`;
  }

  // Authenticated API uses staff ID
  const staffId = ctx.state.user?.id;
  if (staffId) {
    return `${category}:${staffId}`;
  }

  // Fallback to IP
  return `${category}:${ctx.ip}`;
}
```

### Route Configuration

```typescript
// Apply different limits to different routes
router.post('/auth/login', rateLimitMiddleware('auth:login'), loginHandler);
router.post('/auth/refresh', rateLimitMiddleware('auth:refresh'), refreshHandler);

router.get('/conversations', rateLimitMiddleware('api:default'), listConversations);
router.post('/messages', rateLimitMiddleware('api:messages'), sendMessage);
router.get('/search', rateLimitMiddleware('api:search'), searchHandler);
router.post('/bulk/*', rateLimitMiddleware('api:bulk'), bulkHandler);

router.post('/webhooks/*', rateLimitMiddleware('webhook:inbound'), webhookHandler);
```

---

## Channel-Specific Rate Limits

### WhatsApp Rate Limits

WhatsApp has its own rate limits we must respect:

```typescript
const WHATSAPP_LIMITS = {
  // Conversation-initiated messages
  businessInitiated: {
    tier1: 1000,    // New business
    tier2: 10000,   // Established
    tier3: 100000,  // High volume
  },
  // Template messages per phone per day
  templatesPerPhone: 250,
  // Messages per second
  messagesPerSecond: 80,
};

class WhatsAppRateLimiter {
  async canSend(phoneNumber: string): Promise<boolean> {
    // Check daily template limit per phone
    const dailyCount = await this.getDailyCount(phoneNumber);
    if (dailyCount >= WHATSAPP_LIMITS.templatesPerPhone) {
      return false;
    }

    // Check messages per second (global)
    const recentCount = await this.getRecentCount(1000); // Last second
    if (recentCount >= WHATSAPP_LIMITS.messagesPerSecond) {
      return false;
    }

    return true;
  }
}
```

### Twilio Rate Limits

```typescript
const TWILIO_LIMITS = {
  // Messages per second per phone number
  messagesPerSecond: 1,
  // Concurrent API calls
  concurrentCalls: 100,
};
```

---

## Memory Management

### Preventing Unbounded Growth

```typescript
// SQLite storage prevents memory issues, but we still monitor

interface RateLimitStats {
  totalEntries: number;
  entriesPerKey: Record<string, number>;
  oldestEntry: Date;
}

async function getRateLimitStats(): Promise<RateLimitStats> {
  const total = await db.prepare(`
    SELECT COUNT(*) as count FROM rate_limit_entries
  `).get();

  const byKey = await db.prepare(`
    SELECT key, COUNT(*) as count
    FROM rate_limit_entries
    GROUP BY key
    ORDER BY count DESC
    LIMIT 10
  `).all();

  const oldest = await db.prepare(`
    SELECT MIN(timestamp) as oldest FROM rate_limit_entries
  `).get();

  return {
    totalEntries: total.count,
    entriesPerKey: Object.fromEntries(byKey.map(r => [r.key, r.count])),
    oldestEntry: new Date(oldest.oldest * 1000),
  };
}

// Alert if table grows too large
async function checkRateLimitHealth(): Promise<void> {
  const stats = await getRateLimitStats();

  if (stats.totalEntries > 100000) {
    logger.warn('Rate limit table large', stats);
    // Force cleanup
    await cleanupRateLimitEntries();
  }
}
```

---

## Response Headers

All rate-limited responses include standard headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312860

HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705312860
Retry-After: 45

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 45
  }
}
```

---

## Bypass and Exceptions

### Admin Bypass

```typescript
const RATE_LIMIT_BYPASS_ROLES = ['admin', 'system'];

function rateLimitMiddleware(category: string) {
  return async (ctx: Context, next: Next) => {
    // Skip for admin/system roles
    if (RATE_LIMIT_BYPASS_ROLES.includes(ctx.state.user?.role)) {
      await next();
      return;
    }

    // Normal rate limiting...
  };
}
```

### Webhook Allowlist

```typescript
const WEBHOOK_IP_ALLOWLIST = [
  // Meta/WhatsApp IPs
  '157.240.0.0/16',
  // Twilio IPs (from their docs)
  '54.0.0.0/8',
];

function webhookRateLimitMiddleware() {
  return async (ctx: Context, next: Next) => {
    // Check if IP is in allowlist
    if (isIPInAllowlist(ctx.ip, WEBHOOK_IP_ALLOWLIST)) {
      // Higher limit for trusted sources
      const config = { windowMs: 60000, maxRequests: 10000 };
      // ...
    }
    // ...
  };
}
```

---

## Configuration Summary

```yaml
rateLimiting:
  # Storage
  storage: sqlite                # sqlite | memory
  cleanupIntervalMinutes: 15

  # Default limits
  defaults:
    windowMs: 60000
    maxRequests: 100

  # Endpoint-specific limits
  endpoints:
    auth:login:
      windowMs: 900000           # 15 minutes
      maxRequests: 5

    auth:refresh:
      windowMs: 300000           # 5 minutes
      maxRequests: 10

    api:messages:
      windowMs: 60000
      maxRequests: 60

    api:search:
      windowMs: 60000
      maxRequests: 30

    webhook:inbound:
      windowMs: 60000
      maxRequests: 1000

  # Bypass roles
  bypassRoles:
    - admin
    - system

  # Response headers
  headers:
    limit: X-RateLimit-Limit
    remaining: X-RateLimit-Remaining
    reset: X-RateLimit-Reset
```

---

## Related

- [Gateway API](gateway-api.md) - API endpoints
- [Authentication](authentication.md) - Auth rate limits
- [Database Schema](../database/schema.ts) - rate_limit_entries table
