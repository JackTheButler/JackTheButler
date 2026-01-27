# Logging Specification

This document defines the structured logging standard for Jack The Butler.

---

## Overview

Jack uses structured JSON logging for all components. Logs are designed to be:
- Machine-parseable (JSON format)
- Human-readable (formatted in development)
- Searchable (consistent field names)
- Privacy-aware (automatic PII redaction)

---

## Log Format

### JSON Structure

```typescript
interface LogEntry {
  // Required fields
  timestamp: string;             // ISO 8601 format
  level: LogLevel;               // Log severity
  message: string;               // Human-readable message
  service: string;               // Component name

  // Context fields (optional)
  requestId?: string;            // Request correlation ID
  conversationId?: string;       // Conversation context
  guestId?: string;              // Guest context (redacted)
  staffId?: string;              // Staff context
  channel?: string;              // Channel type

  // Error fields (when applicable)
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };

  // Additional context
  metadata?: Record<string, any>;

  // Performance
  duration?: number;             // Operation duration in ms
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
```

### Example Log Entries

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Message received from guest",
  "service": "gateway",
  "requestId": "req_abc123",
  "conversationId": "conv_xyz789",
  "guestId": "guest_***",
  "channel": "whatsapp",
  "metadata": {
    "messageType": "text",
    "contentLength": 45
  }
}

{
  "timestamp": "2024-01-15T10:30:45.456Z",
  "level": "error",
  "message": "Failed to send message to WhatsApp",
  "service": "channels",
  "requestId": "req_abc123",
  "conversationId": "conv_xyz789",
  "channel": "whatsapp",
  "error": {
    "name": "WhatsAppAPIError",
    "message": "Rate limit exceeded",
    "code": "RATE_LIMITED"
  },
  "metadata": {
    "retryAfter": 60,
    "attemptNumber": 3
  }
}
```

---

## Log Levels

### Level Definitions

| Level | Code | Usage | Examples |
|-------|------|-------|----------|
| `debug` | 10 | Detailed debugging info | Variable values, SQL queries, API payloads |
| `info` | 20 | Normal operations | Request received, task completed, sync finished |
| `warn` | 30 | Potential issues | Retry attempt, deprecated usage, slow query |
| `error` | 40 | Errors that need attention | API failure, invalid input, timeout |
| `fatal` | 50 | System cannot continue | Database connection lost, out of memory |

### Level Guidelines

```typescript
// DEBUG: Development-only details
logger.debug('Processing message', {
  rawPayload: payload,
  parsedEntities: entities,
});

// INFO: Normal business events
logger.info('Guest check-in processed', {
  guestId,
  reservationId,
  roomNumber,
});

// WARN: Recoverable issues
logger.warn('AI response slow, using cache', {
  latencyMs: 5200,
  threshold: 3000,
});

// ERROR: Failures requiring attention
logger.error('Failed to send notification', {
  error,
  guestId,
  notificationType,
});

// FATAL: System-level failures
logger.fatal('Database connection lost', {
  error,
  lastSuccessfulQuery: timestamp,
});
```

### Production Log Levels

```yaml
logging:
  level:
    default: info
    components:
      gateway: info
      ai-engine: info
      channels: info
      scheduler: warn        # Less verbose
      database: warn         # Only log issues

  # Development overrides
  development:
    level:
      default: debug
```

---

## Logger Implementation

### Logger Factory

```typescript
import pino from 'pino';

interface LoggerOptions {
  service: string;
  level?: LogLevel;
  redact?: string[];
}

export function createLogger(options: LoggerOptions): Logger {
  const { service, level = 'info', redact = [] } = options;

  return pino({
    level,
    base: {
      service,
      pid: process.pid,
      hostname: os.hostname(),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'password',
        'token',
        'apiKey',
        'secret',
        '*.password',
        '*.token',
        ...redact,
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

// Usage
const logger = createLogger({ service: 'gateway' });
```

### Child Loggers

Create context-specific loggers:

```typescript
// Add request context
const requestLogger = logger.child({
  requestId: req.id,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

// Add conversation context
const conversationLogger = requestLogger.child({
  conversationId: conv.id,
  guestId: redactId(conv.guestId),
  channel: conv.channel,
});

conversationLogger.info('Processing message');
// Output includes all parent context
```

---

## Sensitive Data Redaction

### Automatic Redaction

```typescript
const REDACTED_FIELDS = [
  // Authentication
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',

  // PII
  'email',
  'phone',
  'phoneNumber',
  'creditCard',
  'ssn',
  'passport',

  // Nested paths
  '*.password',
  '*.token',
  'headers.authorization',
  'body.password',
];

const REDACTED_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                         // Phone
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,           // Credit card
];
```

### ID Redaction

Guest IDs are partially redacted in logs:

```typescript
function redactId(id: string): string {
  if (!id) return id;
  // guest_abc123def456 -> guest_***
  const prefix = id.split('_')[0];
  return `${prefix}_***`;
}

// Staff IDs are NOT redacted (internal users)
// Conversation IDs are NOT redacted (needed for debugging)
```

### Message Content

Message content is never logged in full:

```typescript
function redactMessageContent(content: string): string {
  if (content.length <= 20) {
    return '[content hidden]';
  }
  return `[${content.length} chars]`;
}

logger.info('Message received', {
  content: redactMessageContent(message.content),
  contentType: message.type,
});
```

---

## Request Logging

### HTTP Request/Response

```typescript
// Request logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  const requestId = ctx.get('X-Request-ID') || generateId('req');

  ctx.set('X-Request-ID', requestId);

  const requestLogger = logger.child({ requestId });

  // Log request
  requestLogger.info('Request received', {
    method: ctx.method,
    path: ctx.path,
    query: ctx.query,
    ip: ctx.ip,
    userAgent: ctx.get('User-Agent'),
  });

  try {
    await next();

    // Log response
    requestLogger.info('Request completed', {
      status: ctx.status,
      duration: Date.now() - start,
    });
  } catch (error) {
    requestLogger.error('Request failed', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      status: ctx.status || 500,
      duration: Date.now() - start,
    });
    throw error;
  }
});
```

### WebSocket Events

```typescript
// WebSocket connection logging
ws.on('connection', (socket, req) => {
  const connectionId = generateId('ws');
  const wsLogger = logger.child({ connectionId });

  wsLogger.info('WebSocket connected', {
    ip: req.socket.remoteAddress,
  });

  socket.on('message', (data) => {
    wsLogger.debug('WebSocket message received', {
      size: data.length,
      type: typeof data,
    });
  });

  socket.on('close', (code, reason) => {
    wsLogger.info('WebSocket disconnected', {
      code,
      reason: reason.toString(),
    });
  });
});
```

---

## Component-Specific Logging

### AI Engine

```typescript
// Intent classification
logger.info('Intent classified', {
  conversationId,
  messageId,
  intent: classification.intent,
  confidence: classification.confidence,
  latencyMs: endTime - startTime,
});

// Response generation
logger.info('Response generated', {
  conversationId,
  responseType,
  tokensUsed: { input, output },
  provider: aiProvider,
  latencyMs,
});

// Skill execution
logger.info('Skill executed', {
  conversationId,
  skillId,
  success: result.success,
  latencyMs,
});
```

### Channel Adapters

```typescript
// Outbound message
logger.info('Message sent', {
  channel,
  conversationId,
  messageId,
  providerMessageId,
  latencyMs,
});

// Delivery status
logger.info('Delivery status received', {
  channel,
  messageId,
  status: 'delivered' | 'read' | 'failed',
});

// Rate limiting
logger.warn('Rate limited by provider', {
  channel,
  limit,
  remaining,
  resetAt,
  queuedMessages,
});
```

### Job Scheduler

```typescript
// Job scheduled
logger.info('Job scheduled', {
  jobId,
  jobType,
  scheduledFor,
  dedupeKey,
});

// Job execution
logger.info('Job completed', {
  jobId,
  jobType,
  duration,
  result: 'success' | 'failed',
});

// Job failure
logger.error('Job failed', {
  jobId,
  jobType,
  attempt,
  maxAttempts,
  error,
  willRetry,
});
```

---

## Log Rotation

### Configuration

```yaml
logging:
  output:
    type: file                   # file | stdout | both
    path: /var/log/jack
    filename: jack.log

  rotation:
    enabled: true
    maxSize: 100MB               # Rotate when file reaches size
    maxFiles: 14                 # Keep 14 days of logs
    compress: true               # Gzip rotated files
    datePattern: YYYY-MM-DD      # Daily rotation

  # Separate files by level
  errorLog:
    enabled: true
    path: /var/log/jack/error.log
    level: error
```

### Implementation

```typescript
import pino from 'pino';
import { createWriteStream } from 'pino-http-send';
import rotating from 'rotating-file-stream';

// Create rotating write stream
const logStream = rotating.createStream('jack.log', {
  size: '100M',
  interval: '1d',
  compress: 'gzip',
  maxFiles: 14,
  path: '/var/log/jack',
});

const logger = pino({
  level: 'info',
}, logStream);
```

---

## Log Aggregation

### Structured Output for Aggregators

Logs are compatible with common log aggregators:

```typescript
// Format for ELK Stack / Loki / CloudWatch
{
  "@timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Request completed",
  "service": "gateway",
  "environment": "production",
  "version": "1.2.3",
  // ... additional fields
}
```

### Correlation IDs

All related logs share correlation IDs:

```typescript
// Request ID flows through all components
logger.info('Message received', { requestId: 'req_abc123' });
logger.info('Intent classified', { requestId: 'req_abc123' });
logger.info('Response sent', { requestId: 'req_abc123' });

// Query logs by request ID to see full flow
```

---

## Development vs Production

### Development

```typescript
// Pretty-printed, colorized output
const devLogger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});
```

### Production

```typescript
// JSON output, no pretty printing
const prodLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

---

## Configuration Summary

```yaml
logging:
  # General settings
  level: info
  format: json                   # json | pretty
  timestamp: iso                 # iso | unix | none

  # Output
  output:
    stdout: true
    file:
      enabled: true
      path: /var/log/jack/jack.log

  # Rotation
  rotation:
    maxSize: 100MB
    maxFiles: 14
    compress: true

  # Redaction
  redact:
    fields:
      - password
      - token
      - email
      - phone
    patterns:
      - email
      - phone
      - creditCard

  # Component overrides
  components:
    gateway: info
    ai-engine: info
    channels: info
    scheduler: warn
    database: warn

  # Development overrides
  development:
    level: debug
    format: pretty
    file:
      enabled: false
```

---

## Related

- [Error Handling](error-handling.md) - Error logging patterns
- [Health Checks](../04-specs/api/gateway-api.md#health-checks) - Health check logging
- [Deployment](deployment.md) - Log aggregation setup
