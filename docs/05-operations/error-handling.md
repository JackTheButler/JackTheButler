# Error Handling Specification

This document defines error handling and recovery strategies for Jack The Butler.

---

## Overview

Jack implements graceful degradation and automatic recovery for all failure scenarios. The goal is to:
- Never leave guests without a response
- Automatically recover from transient failures
- Alert staff to persistent issues
- Maintain data consistency

---

## Error Classification

### Error Categories

```typescript
type ErrorCategory =
  | 'transient'      // Temporary, retry will likely succeed
  | 'client'         // Invalid input, don't retry
  | 'dependency'     // External service issue
  | 'internal'       // Bug or unexpected state
  | 'fatal';         // System cannot continue

interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  userMessage: string;       // Safe to show to guest/staff
  internalMessage: string;   // For logging
  code: string;              // Error code
  statusCode: number;        // HTTP status
}
```

### Error Codes

| Code | Category | HTTP | Description |
|------|----------|------|-------------|
| `RATE_LIMITED` | transient | 429 | Too many requests |
| `TIMEOUT` | transient | 504 | Operation timed out |
| `SERVICE_UNAVAILABLE` | transient | 503 | Dependency down |
| `VALIDATION_ERROR` | client | 400 | Invalid input |
| `NOT_FOUND` | client | 404 | Resource not found |
| `UNAUTHORIZED` | client | 401 | Auth required |
| `FORBIDDEN` | client | 403 | Not permitted |
| `PROVIDER_ERROR` | dependency | 502 | External API failed |
| `DATABASE_ERROR` | internal | 500 | Database operation failed |
| `INTERNAL_ERROR` | internal | 500 | Unexpected error |

---

## Channel Error Handling

### WhatsApp API Errors

```typescript
interface WhatsAppErrorHandler {
  handle(error: WhatsAppAPIError, message: OutboundMessage): Promise<ErrorResult>;
}

const WHATSAPP_ERROR_HANDLERS: Record<number, ErrorStrategy> = {
  // Rate limiting
  429: {
    action: 'queue',
    retryAfter: (headers) => parseInt(headers['retry-after']) || 60,
    maxRetries: 5,
    alertAfter: 3,
  },

  // Server errors (500, 502, 503, 504)
  500: {
    action: 'retry',
    backoff: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    maxRetries: 3,
  },
  502: { /* same as 500 */ },
  503: { /* same as 500 */ },
  504: { /* same as 500 */ },

  // Invalid recipient
  400: {
    action: 'fail',
    createTask: true,
    taskMessage: 'Unable to deliver message - invalid recipient',
  },

  // Expired session
  401: {
    action: 'fail',
    alert: 'critical',
    alertMessage: 'WhatsApp token expired - immediate attention required',
  },
};

async function handleWhatsAppError(
  error: WhatsAppAPIError,
  message: OutboundMessage
): Promise<void> {
  const strategy = WHATSAPP_ERROR_HANDLERS[error.statusCode];

  switch (strategy.action) {
    case 'retry':
      await queueRetry(message, strategy);
      break;

    case 'queue':
      await queueWithDelay(message, strategy.retryAfter(error.headers));
      break;

    case 'fail':
      await handleFailedMessage(message, error, strategy);
      break;
  }

  // Log the error
  logger.error('WhatsApp API error', {
    statusCode: error.statusCode,
    errorCode: error.code,
    messageId: message.id,
    conversationId: message.conversationId,
    action: strategy.action,
  });
}
```

### Twilio SMS Errors

```typescript
const TWILIO_ERROR_HANDLERS: Record<number, ErrorStrategy> = {
  // Rate limiting
  20429: {
    action: 'queue',
    retryAfter: 60,
    maxRetries: 5,
  },

  // Invalid number
  21211: {
    action: 'fail',
    createTask: true,
    taskMessage: 'Invalid phone number',
  },

  // Unreachable
  21612: {
    action: 'retry',
    maxRetries: 2,
    fallbackChannel: 'email',  // Try alternate channel
  },

  // Account suspended
  20003: {
    action: 'fail',
    alert: 'critical',
    alertMessage: 'Twilio account issue - check credentials',
  },
};
```

### Email Errors

```typescript
const EMAIL_ERROR_HANDLERS: Record<string, ErrorStrategy> = {
  // Temporary failures
  ETIMEDOUT: {
    action: 'retry',
    maxRetries: 3,
    backoff: 'exponential',
  },

  // Mailbox full
  MAILBOX_FULL: {
    action: 'queue',
    retryAfter: 3600,  // Try again in 1 hour
    maxRetries: 24,    // Try for 24 hours
  },

  // Invalid recipient
  INVALID_RECIPIENT: {
    action: 'fail',
    createTask: true,
  },

  // Spam rejection
  SPAM_REJECTED: {
    action: 'fail',
    alert: 'warning',
    alertMessage: 'Email rejected as spam - review content',
  },
};
```

---

## AI Provider Error Handling

### Provider Errors

```typescript
interface AIProviderErrorHandler {
  provider: string;
  handle(error: AIError): Promise<AIErrorResult>;
}

const AI_ERROR_STRATEGIES: Record<string, ErrorStrategy> = {
  // Rate limiting
  rate_limit: {
    action: 'fallback',
    fallbackProvider: 'openai',  // Try alternate provider
    retryOriginal: true,
    retryAfter: 60,
  },

  // Timeout
  timeout: {
    action: 'retry',
    maxRetries: 2,
    reduceComplexity: true,      // Reduce context on retry
  },

  // Context too long
  context_length: {
    action: 'retry',
    truncateContext: true,
    maxRetries: 1,
  },

  // Model overloaded
  overloaded: {
    action: 'fallback',
    fallbackProvider: 'local',   // Use local Ollama
  },

  // API key invalid
  authentication: {
    action: 'fail',
    alert: 'critical',
    alertMessage: 'AI provider authentication failed',
  },
};

async function handleAIError(
  error: AIError,
  request: AIRequest
): Promise<AIResponse> {
  const strategy = AI_ERROR_STRATEGIES[error.type] || AI_ERROR_STRATEGIES.default;

  // Try fallback provider
  if (strategy.fallbackProvider) {
    try {
      const fallback = getProvider(strategy.fallbackProvider);
      return await fallback.complete(request);
    } catch (fallbackError) {
      logger.warn('Fallback provider also failed', {
        original: error.type,
        fallback: strategy.fallbackProvider,
      });
    }
  }

  // Generate fallback response
  return generateFallbackResponse(request, error);
}

function generateFallbackResponse(
  request: AIRequest,
  error: AIError
): AIResponse {
  // Don't leave guest hanging - provide graceful degradation
  return {
    content: "I'm having trouble processing your request right now. " +
             "I've notified our team who will follow up with you shortly.",
    intent: 'other.error',
    confidence: 0,
    fallback: true,
    error: error.type,
  };
}
```

### Timeout Handling

```typescript
const AI_TIMEOUT_MS = 30000;  // 30 seconds

async function callAIWithTimeout(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await provider.complete(request, {
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      // Timeout - create task for staff
      await createFollowUpTask({
        conversationId: request.conversationId,
        reason: 'AI response timeout',
        guestMessage: request.messages[request.messages.length - 1].content,
      });

      throw new AITimeoutError('AI response timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Database Error Handling

### SQLite Errors

```typescript
const DATABASE_ERROR_HANDLERS: Record<string, ErrorStrategy> = {
  // Database locked (concurrent access)
  SQLITE_BUSY: {
    action: 'retry',
    maxRetries: 5,
    backoff: 'linear',
    initialDelayMs: 100,
    maxDelayMs: 1000,
  },

  // Database locked (long transaction)
  SQLITE_LOCKED: {
    action: 'retry',
    maxRetries: 3,
    backoff: 'exponential',
    initialDelayMs: 500,
  },

  // Disk full
  SQLITE_FULL: {
    action: 'fail',
    alert: 'critical',
    alertMessage: 'Database disk full - immediate attention required',
  },

  // Corruption
  SQLITE_CORRUPT: {
    action: 'fail',
    alert: 'critical',
    alertMessage: 'Database corruption detected',
  },

  // Constraint violation
  SQLITE_CONSTRAINT: {
    action: 'fail',
    // Usually a bug - log for investigation
  },
};

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error;
  let attempt = 0;

  while (attempt < 5) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const strategy = DATABASE_ERROR_HANDLERS[error.code];

      if (!strategy || strategy.action !== 'retry') {
        throw error;
      }

      attempt++;
      const delay = calculateBackoff(strategy, attempt);

      logger.warn('Database operation retry', {
        context,
        attempt,
        error: error.code,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
```

---

## Webhook Error Handling

### Invalid Signatures

```typescript
async function handleWebhookError(
  error: WebhookError,
  request: Request
): Promise<void> {
  if (error.type === 'INVALID_SIGNATURE') {
    // Log for security monitoring
    logger.warn('Invalid webhook signature', {
      source: request.headers['user-agent'],
      ip: request.ip,
      path: request.path,
    });

    // Rate limit by IP after multiple failures
    const failures = await incrementSignatureFailures(request.ip);
    if (failures >= 5) {
      await blockIP(request.ip, 3600);  // Block for 1 hour
      logger.error('IP blocked due to webhook signature failures', {
        ip: request.ip,
        failures,
      });
    }

    // Don't reveal details to potential attacker
    throw new UnauthorizedError('Unauthorized');
  }

  if (error.type === 'INVALID_PAYLOAD') {
    logger.warn('Invalid webhook payload', {
      source: request.headers['user-agent'],
      error: error.message,
    });

    throw new BadRequestError('Invalid payload');
  }
}
```

---

## Task Assignment Errors

### Offline Staff Handling

```typescript
async function handleOfflineStaffAssignment(
  task: Task,
  staffId: string
): Promise<void> {
  // Check if staff is online
  const staff = await getStaffStatus(staffId);

  if (staff.status === 'offline') {
    logger.info('Assigned staff is offline, reassigning', {
      taskId: task.id,
      originalStaffId: staffId,
    });

    // Find available staff
    const available = await findAvailableStaff({
      skills: task.requiredSkills,
      excludeIds: [staffId],
    });

    if (available.length > 0) {
      // Reassign to available staff
      await assignTask(task.id, available[0].id);

      // Notify about reassignment
      eventBus.emit(EventType.TASK_ASSIGNED, {
        taskId: task.id,
        staffId: available[0].id,
        previousStaffId: staffId,
        reason: 'original_assignee_offline',
      });
    } else {
      // No one available - escalate
      await escalateTask(task.id, {
        reason: 'no_available_staff',
        priority: 'high',
      });

      // Alert manager
      await notifyManagers({
        type: 'unassigned_task',
        task,
        message: 'No available staff for task assignment',
      });
    }
  }
}
```

---

## Retry Strategies

### Exponential Backoff

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

function calculateBackoff(config: RetryConfig, attempt: number): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    // Add +/- 20% jitter to prevent thundering herd
    const jitterRange = delay * 0.2;
    delay += (Math.random() * jitterRange * 2) - jitterRange;
  }

  return Math.round(delay);
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === config.maxAttempts) {
        break;
      }

      const delay = calculateBackoff(config, attempt);
      logger.debug('Retrying operation', { attempt, delay, error: error.message });
      await sleep(delay);
    }
  }

  throw lastError;
}
```

### Circuit Breaker

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening
  resetTimeoutMs: number;        // Time before attempting reset
  halfOpenRequests: number;      // Requests allowed in half-open state
}

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailure?: Date;
  private halfOpenAttempts = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts > this.config.halfOpenRequests) {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened', {
        name: this.name,
        failures: this.failures,
      });
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true;
    const elapsed = Date.now() - this.lastFailure.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }
}

// Usage
const whatsappCircuit = new CircuitBreaker('whatsapp', {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 2,
});

await whatsappCircuit.execute(() => sendWhatsAppMessage(message));
```

---

## Fallback Responses

### Guest-Facing Fallbacks

```typescript
const FALLBACK_RESPONSES: Record<string, string> = {
  ai_unavailable:
    "I'm having trouble processing your request right now. " +
    "I've notified our team who will assist you shortly.",

  channel_error:
    "There was an issue sending my response. " +
    "Please try again in a moment, or call the front desk at extension 0.",

  timeout:
    "I apologize for the delay. Our team is looking into your request " +
    "and will respond as soon as possible.",

  general:
    "I encountered an issue while helping you. " +
    "Our staff has been notified and will follow up with you.",
};

async function sendFallbackResponse(
  conversationId: string,
  errorType: string
): Promise<void> {
  const message = FALLBACK_RESPONSES[errorType] || FALLBACK_RESPONSES.general;

  // Send fallback message
  await sendMessage({
    conversationId,
    content: message,
    sender: 'system',
    metadata: {
      fallback: true,
      errorType,
    },
  });

  // Create follow-up task
  await createTask({
    type: 'follow_up',
    conversationId,
    title: 'Follow up on error',
    description: `Automated response sent due to ${errorType}. Please review and respond.`,
    priority: 'high',
  });
}
```

---

## Error Monitoring

### Alerting Thresholds

```yaml
monitoring:
  alerts:
    # Error rate thresholds
    errorRate:
      warning: 5%           # Warn at 5% error rate
      critical: 10%         # Alert at 10% error rate
      window: 5m            # Over 5 minute window

    # Specific error counts
    errors:
      - code: PROVIDER_ERROR
        threshold: 10
        window: 5m
        level: warning

      - code: DATABASE_ERROR
        threshold: 3
        window: 1m
        level: critical

    # Channel health
    channels:
      - name: whatsapp
        failureThreshold: 5
        window: 5m
        level: critical

      - name: email
        failureThreshold: 10
        window: 15m
        level: warning
```

### Error Aggregation

```typescript
interface ErrorMetrics {
  total: number;
  byCode: Record<string, number>;
  byCategory: Record<ErrorCategory, number>;
  rate: number;                  // Errors per minute
}

async function recordError(error: ClassifiedError): Promise<void> {
  // Increment counters
  await metrics.increment('errors.total');
  await metrics.increment(`errors.code.${error.code}`);
  await metrics.increment(`errors.category.${error.category}`);

  // Check alert thresholds
  const errorRate = await calculateErrorRate('5m');
  if (errorRate > 0.10) {
    await sendAlert({
      level: 'critical',
      title: 'High Error Rate',
      message: `Error rate is ${(errorRate * 100).toFixed(1)}%`,
    });
  }
}
```

---

## Configuration Summary

```yaml
errorHandling:
  # Retry defaults
  retry:
    maxAttempts: 3
    initialDelayMs: 1000
    maxDelayMs: 30000
    backoffMultiplier: 2
    jitter: true

  # Circuit breaker
  circuitBreaker:
    failureThreshold: 5
    resetTimeoutMs: 60000
    halfOpenRequests: 2

  # Fallback behavior
  fallback:
    sendFallbackMessage: true
    createFollowUpTask: true
    notifyStaff: true

  # Alerting
  alerts:
    channels: ["slack", "email"]
    errorRateThreshold: 0.05
    consecutiveFailures: 5
```

---

## Related

- [Logging Specification](logging.md) - Error logging patterns
- [Health Checks](../04-specs/api/gateway-api.md#health-checks) - System health
- [Event Bus](../04-specs/api/events.md) - Error events
