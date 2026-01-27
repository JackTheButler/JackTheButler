# Webhook Security Specification

This document defines security measures for webhook endpoints in Jack The Butler.

---

## Overview

Webhook endpoints receive callbacks from external services (WhatsApp, Twilio, PMS systems). These endpoints require careful security configuration to:

- Prevent unauthorized access
- Protect against common web attacks
- Ensure data integrity
- Maintain compliance

---

## Security Headers

### Response Headers

All webhook endpoints return these security headers:

```typescript
const WEBHOOK_SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking (webhooks should never be framed)
  'X-Frame-Options': 'DENY',

  // XSS protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',

  // No caching of webhook responses
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',

  // Content Security Policy
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",

  // Referrer policy
  'Referrer-Policy': 'no-referrer',

  // Permissions policy (disable all features)
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};
```

### Header Middleware

```typescript
function webhookSecurityHeaders() {
  return async (ctx: Context, next: Next) => {
    // Set security headers
    for (const [header, value] of Object.entries(WEBHOOK_SECURITY_HEADERS)) {
      ctx.header(header, value);
    }

    // Remove server identification
    ctx.res.headers.delete('X-Powered-By');
    ctx.res.headers.delete('Server');

    await next();
  };
}

// Apply to webhook routes
webhookRouter.use('/*', webhookSecurityHeaders());
```

---

## CORS Configuration

### Webhook CORS Policy

Webhooks should generally not allow cross-origin requests:

```typescript
interface WebhookCorsConfig {
  // Webhooks don't need CORS - they're server-to-server
  enabled: false;

  // If needed for testing, very restrictive
  testMode?: {
    allowedOrigins: string[];
    allowedMethods: ['POST'];
    maxAge: 0;
  };
}

function webhookCorsMiddleware(config: WebhookCorsConfig) {
  return async (ctx: Context, next: Next) => {
    const origin = ctx.req.header('Origin');

    // No CORS headers for server-to-server webhooks
    if (!config.enabled) {
      // If browser makes request, deny it
      if (origin) {
        ctx.status = 403;
        ctx.body = { error: 'CORS not allowed for webhooks' };
        return;
      }
      return next();
    }

    // Test mode: very restrictive CORS
    if (config.testMode && origin) {
      if (!config.testMode.allowedOrigins.includes(origin)) {
        ctx.status = 403;
        ctx.body = { error: 'Origin not allowed' };
        return;
      }

      ctx.header('Access-Control-Allow-Origin', origin);
      ctx.header('Access-Control-Allow-Methods', 'POST');
      ctx.header('Access-Control-Max-Age', '0');
      ctx.header('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature');
    }

    await next();
  };
}
```

### Public API CORS (Contrast)

For comparison, the public API uses more permissive CORS:

```typescript
const PUBLIC_API_CORS = {
  // Allow specific origins (configured per deployment)
  origin: (origin: string) => {
    const allowed = config.cors.allowedOrigins;
    return allowed.includes(origin) || allowed.includes('*');
  },

  // Allowed methods
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allowed headers
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Timezone',
  ],

  // Expose headers to client
  exposeHeaders: [
    'X-API-Version',
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
  ],

  // Credentials (cookies, auth headers)
  credentials: true,

  // Preflight cache
  maxAge: 86400, // 24 hours
};
```

---

## Request Validation

### IP Allowlisting

Restrict webhooks to known sender IPs:

```typescript
interface IpAllowlist {
  provider: string;
  ips: string[];              // Individual IPs
  cidrs: string[];            // CIDR ranges
  refreshUrl?: string;        // URL to fetch updated IPs
  refreshInterval?: number;   // Refresh interval in ms
}

const WEBHOOK_IP_ALLOWLISTS: Record<string, IpAllowlist> = {
  whatsapp: {
    provider: 'whatsapp',
    ips: [],
    cidrs: [
      '157.240.0.0/16',       // Meta/Facebook
      '69.63.176.0/20',
      '66.220.144.0/20',
    ],
    refreshUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/ip-addresses',
  },

  twilio: {
    provider: 'twilio',
    ips: [],
    cidrs: [
      '54.172.60.0/23',
      '54.244.51.0/24',
      '34.203.90.0/24',
      '35.153.0.0/16',
      // ... more Twilio ranges
    ],
    refreshUrl: 'https://www.twilio.com/docs/sip-trunking/ip-addresses',
  },

  // Allow all IPs for PMS (private network)
  pms: {
    provider: 'pms',
    ips: [],
    cidrs: [
      '10.0.0.0/8',           // Private networks
      '172.16.0.0/12',
      '192.168.0.0/16',
    ],
  },
};

function ipAllowlistMiddleware(provider: string) {
  return async (ctx: Context, next: Next) => {
    const allowlist = WEBHOOK_IP_ALLOWLISTS[provider];
    if (!allowlist) {
      return next(); // No allowlist, allow all
    }

    const clientIp = getClientIp(ctx);

    // Check individual IPs
    if (allowlist.ips.includes(clientIp)) {
      return next();
    }

    // Check CIDR ranges
    for (const cidr of allowlist.cidrs) {
      if (isIpInCidr(clientIp, cidr)) {
        return next();
      }
    }

    logger.warn('Webhook request from unauthorized IP', {
      provider,
      clientIp,
      path: ctx.req.path,
    });

    ctx.status = 403;
    ctx.body = { error: 'IP not authorized' };
  };
}

function getClientIp(ctx: Context): string {
  // Check X-Forwarded-For if behind proxy
  const forwarded = ctx.req.header('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Direct connection
  return ctx.req.raw.socket.remoteAddress || '';
}
```

### Signature Verification

Verify webhook signatures:

```typescript
interface SignatureConfig {
  header: string;              // Header containing signature
  algorithm: string;           // 'sha256', 'sha1', etc.
  encoding: 'hex' | 'base64';
  secret: string;              // Shared secret
  timestampHeader?: string;    // Header with timestamp
  timestampTolerance?: number; // Max age in seconds
}

const SIGNATURE_CONFIGS: Record<string, SignatureConfig> = {
  whatsapp: {
    header: 'X-Hub-Signature-256',
    algorithm: 'sha256',
    encoding: 'hex',
    secret: process.env.WHATSAPP_WEBHOOK_SECRET!,
  },

  twilio: {
    header: 'X-Twilio-Signature',
    algorithm: 'sha1',
    encoding: 'base64',
    secret: process.env.TWILIO_AUTH_TOKEN!,
  },

  stripe: {
    header: 'Stripe-Signature',
    algorithm: 'sha256',
    encoding: 'hex',
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    timestampHeader: 'Stripe-Signature', // Embedded in signature header
    timestampTolerance: 300, // 5 minutes
  },
};

async function verifyWebhookSignature(
  provider: string,
  ctx: Context
): Promise<boolean> {
  const config = SIGNATURE_CONFIGS[provider];
  if (!config) {
    logger.warn('No signature config for provider', { provider });
    return false;
  }

  const signature = ctx.req.header(config.header);
  if (!signature) {
    logger.warn('Missing webhook signature', { provider });
    return false;
  }

  // Get raw body
  const rawBody = await ctx.req.raw.text();

  // Provider-specific verification
  switch (provider) {
    case 'whatsapp':
      return verifyWhatsAppSignature(rawBody, signature, config);

    case 'twilio':
      return verifyTwilioSignature(ctx.req.url, rawBody, signature, config);

    case 'stripe':
      return verifyStripeSignature(rawBody, signature, config);

    default:
      return verifyGenericSignature(rawBody, signature, config);
  }
}

function verifyGenericSignature(
  body: string,
  signature: string,
  config: SignatureConfig
): boolean {
  const expected = crypto
    .createHmac(config.algorithm, config.secret)
    .update(body)
    .digest(config.encoding);

  // Remove algorithm prefix if present (e.g., "sha256=")
  const providedSig = signature.replace(/^sha\d+=/, '');

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(providedSig)
  );
}
```

---

## Request Timeouts

### Timeout Configuration

```typescript
interface WebhookTimeoutConfig {
  // Maximum time to wait for request body
  bodyTimeout: number;        // ms

  // Maximum time to process webhook
  processingTimeout: number;  // ms

  // Maximum request body size
  maxBodySize: number;        // bytes
}

const WEBHOOK_TIMEOUTS: WebhookTimeoutConfig = {
  bodyTimeout: 5000,          // 5 seconds
  processingTimeout: 30000,   // 30 seconds
  maxBodySize: 1024 * 1024,   // 1 MB
};

function webhookTimeoutMiddleware(config: WebhookTimeoutConfig) {
  return async (ctx: Context, next: Next) => {
    // Set body size limit
    const contentLength = parseInt(ctx.req.header('Content-Length') || '0');
    if (contentLength > config.maxBodySize) {
      ctx.status = 413; // Payload Too Large
      ctx.body = { error: 'Request body too large' };
      return;
    }

    // Set processing timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Webhook processing timeout'));
      }, config.processingTimeout);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } catch (error) {
      if (error.message === 'Webhook processing timeout') {
        logger.error('Webhook processing timed out', {
          path: ctx.req.path,
          timeout: config.processingTimeout,
        });
        ctx.status = 504; // Gateway Timeout
        ctx.body = { error: 'Processing timeout' };
      } else {
        throw error;
      }
    }
  };
}
```

---

## Rate Limiting

### Webhook-Specific Rate Limits

```typescript
const WEBHOOK_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // WhatsApp: High volume expected
  whatsapp: {
    windowMs: 60000,           // 1 minute
    max: 1000,                 // 1000 requests per minute
    keyGenerator: (ctx) => `webhook:whatsapp:${getClientIp(ctx)}`,
  },

  // Twilio: Medium volume
  twilio: {
    windowMs: 60000,
    max: 500,
    keyGenerator: (ctx) => `webhook:twilio:${getClientIp(ctx)}`,
  },

  // PMS: Lower volume
  pms: {
    windowMs: 60000,
    max: 100,
    keyGenerator: (ctx) => `webhook:pms:${getClientIp(ctx)}`,
  },

  // Generic webhook
  default: {
    windowMs: 60000,
    max: 60,
    keyGenerator: (ctx) => `webhook:default:${getClientIp(ctx)}`,
  },
};
```

---

## Error Responses

### Standardized Error Format

```typescript
interface WebhookErrorResponse {
  error: string;               // Error code
  message?: string;            // Human-readable message (only in dev)
  requestId?: string;          // For debugging
}

// Error codes
const WEBHOOK_ERROR_CODES = {
  INVALID_SIGNATURE: 'Invalid webhook signature',
  IP_NOT_AUTHORIZED: 'IP address not authorized',
  RATE_LIMITED: 'Too many requests',
  INVALID_PAYLOAD: 'Invalid request payload',
  PROCESSING_ERROR: 'Error processing webhook',
  TIMEOUT: 'Processing timeout',
} as const;

function webhookErrorHandler() {
  return async (ctx: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      const requestId = ctx.get('requestId');

      logger.error('Webhook error', {
        error,
        requestId,
        path: ctx.req.path,
        method: ctx.req.method,
      });

      // Don't expose internal errors
      const response: WebhookErrorResponse = {
        error: 'PROCESSING_ERROR',
        requestId,
      };

      // Only include message in development
      if (process.env.NODE_ENV === 'development') {
        response.message = error.message;
      }

      ctx.status = 500;
      ctx.body = response;
    }
  };
}
```

---

## Idempotency

### Duplicate Detection

```typescript
interface IdempotencyConfig {
  headerName: string;
  ttlSeconds: number;
}

const IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  headerName: 'X-Webhook-ID',
  ttlSeconds: 86400, // 24 hours
};

async function idempotencyMiddleware(ctx: Context, next: Next) {
  const webhookId = ctx.req.header(IDEMPOTENCY_CONFIG.headerName);

  if (!webhookId) {
    // Generate one if not provided
    const generatedId = generateId('whk');
    ctx.set('webhookId', generatedId);
    return next();
  }

  // Check if already processed
  const existing = await cache.get(`webhook:${webhookId}`);

  if (existing) {
    logger.info('Duplicate webhook detected', { webhookId });

    // Return cached response
    ctx.status = existing.status;
    ctx.body = existing.body;
    return;
  }

  ctx.set('webhookId', webhookId);
  await next();

  // Cache response for idempotency
  if (ctx.status < 500) {
    await cache.set(
      `webhook:${webhookId}`,
      { status: ctx.status, body: ctx.body },
      IDEMPOTENCY_CONFIG.ttlSeconds
    );
  }
}
```

---

## Logging

### Security Event Logging

```typescript
interface WebhookSecurityLog {
  eventType: 'webhook_received' | 'webhook_rejected' | 'webhook_processed';
  provider: string;
  clientIp: string;
  webhookId?: string;
  signatureValid?: boolean;
  ipAuthorized?: boolean;
  processingTimeMs?: number;
  errorCode?: string;
  timestamp: Date;
}

async function logWebhookSecurity(log: WebhookSecurityLog): Promise<void> {
  // Structured log
  logger.info('Webhook security event', log);

  // Store in audit table for compliance
  if (log.eventType === 'webhook_rejected') {
    await db.securityEvents.create({
      id: generateId('sec'),
      type: 'webhook_rejected',
      severity: 'warning',
      details: log,
      createdAt: new Date(),
    });
  }
}
```

---

## Complete Webhook Router

### Combined Middleware Stack

```typescript
import { Hono } from 'hono';

export function createWebhookRouter(): Hono {
  const router = new Hono();

  // Global webhook middleware
  router.use('/*', webhookSecurityHeaders());
  router.use('/*', webhookErrorHandler());
  router.use('/*', webhookTimeoutMiddleware(WEBHOOK_TIMEOUTS));

  // WhatsApp webhook
  router.post(
    '/whatsapp',
    ipAllowlistMiddleware('whatsapp'),
    rateLimitMiddleware(WEBHOOK_RATE_LIMITS.whatsapp),
    idempotencyMiddleware,
    async (ctx) => {
      // Verify signature
      if (!await verifyWebhookSignature('whatsapp', ctx)) {
        await logWebhookSecurity({
          eventType: 'webhook_rejected',
          provider: 'whatsapp',
          clientIp: getClientIp(ctx),
          signatureValid: false,
          timestamp: new Date(),
        });

        ctx.status = 401;
        ctx.body = { error: 'INVALID_SIGNATURE' };
        return;
      }

      // Process webhook
      await whatsappHandler.handleWebhook(ctx);
    }
  );

  // Twilio webhook
  router.post(
    '/twilio',
    ipAllowlistMiddleware('twilio'),
    rateLimitMiddleware(WEBHOOK_RATE_LIMITS.twilio),
    async (ctx) => {
      if (!await verifyWebhookSignature('twilio', ctx)) {
        ctx.status = 401;
        ctx.body = { error: 'INVALID_SIGNATURE' };
        return;
      }

      await twilioHandler.handleWebhook(ctx);
    }
  );

  // PMS webhook
  router.post(
    '/pms',
    ipAllowlistMiddleware('pms'),
    rateLimitMiddleware(WEBHOOK_RATE_LIMITS.pms),
    async (ctx) => {
      await pmsHandler.handleWebhook(ctx);
    }
  );

  // Verification endpoint (GET) for WhatsApp
  router.get('/whatsapp', (ctx) => {
    const mode = ctx.req.query('hub.mode');
    const token = ctx.req.query('hub.verify_token');
    const challenge = ctx.req.query('hub.challenge');

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      ctx.body = challenge;
      return;
    }

    ctx.status = 403;
  });

  return router;
}
```

---

## Configuration

```yaml
webhooks:
  security:
    # IP allowlisting
    ipAllowlist:
      enabled: true
      refreshInterval: 86400000    # Refresh IPs daily

    # Signature verification
    signatureVerification:
      enabled: true
      strictMode: true             # Reject if signature missing

    # Rate limiting
    rateLimiting:
      enabled: true

    # Idempotency
    idempotency:
      enabled: true
      ttlSeconds: 86400            # 24 hours

  # Timeouts
  timeouts:
    body: 5000                     # 5 seconds
    processing: 30000              # 30 seconds

  # Body limits
  maxBodySize: 1048576             # 1 MB

  # CORS (usually disabled for webhooks)
  cors:
    enabled: false

  # Logging
  logging:
    logAllRequests: true
    logRejections: true
    includeBody: false             # Don't log body (may contain PII)
```

---

## Related

- [Webhook Spec](webhook-spec.md) - Webhook event types
- [Rate Limiting](rate-limiting.md) - Rate limit implementation
- [Authentication](authentication.md) - API key verification
- [Logging](../../05-operations/logging.md) - Log format
