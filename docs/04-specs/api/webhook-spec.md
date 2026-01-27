# Specification: Webhooks

Inbound webhook handling for external services.

---

## Overview

Jack receives webhooks from:
- Messaging platforms (WhatsApp, Twilio)
- Hotel systems (PMS events)
- Payment processors

All webhooks are received at: `https://api.jackthebutler.com/webhooks/`

---

## Webhook Security

### Signature Verification

All webhooks must be verified before processing.

#### WhatsApp (Meta)

```typescript
function verifyWhatsAppSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}
```

Header: `X-Hub-Signature-256`

#### Twilio

```typescript
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  const validator = new twilio.validateRequest(
    authToken,
    signature,
    url,
    params
  );
  return validator;
}
```

Header: `X-Twilio-Signature`

### IP Allowlisting

For additional security, webhook sources can be IP-restricted:

| Provider | IP Ranges |
|----------|-----------|
| WhatsApp/Meta | [Meta IP Ranges](https://developers.facebook.com/docs/whatsapp/api/webhooks/meta-ip-addresses) |
| Twilio | [Twilio IP Ranges](https://www.twilio.com/docs/usage/webhooks/ip-addresses) |

```typescript
// IP allowlisting middleware
const ALLOWED_IPS: Record<string, string[]> = {
  whatsapp: ['157.240.0.0/16', '173.252.64.0/18', /* ... Meta ranges */],
  twilio: ['54.172.60.0/23', '54.244.51.0/24', /* ... Twilio ranges */]
};

function ipAllowlistMiddleware(provider: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const allowed = ALLOWED_IPS[provider] || [];

    // Check if IP is in any allowed range
    const isAllowed = allowed.some(range => isIpInRange(clientIp, range));

    if (!isAllowed && config.webhooks.enforceIpAllowlist) {
      return res.status(403).json({ error: 'IP not allowed' });
    }

    next();
  };
}
```

### Replay Attack Prevention

Prevent attackers from replaying captured webhook requests:

```typescript
const REPLAY_WINDOW_MS = 300000; // 5 minutes

function validateTimestamp(timestamp: number | string): boolean {
  const webhookTime = typeof timestamp === 'string'
    ? parseInt(timestamp) * 1000  // WhatsApp uses seconds
    : timestamp;

  const now = Date.now();
  const age = now - webhookTime;

  // Reject if too old
  if (age > REPLAY_WINDOW_MS) {
    throw new ReplayAttackError('Webhook timestamp too old');
  }

  // Reject if in future (clock skew tolerance: 60s)
  if (age < -60000) {
    throw new ReplayAttackError('Webhook timestamp in future');
  }

  return true;
}

// Combined validation
async function validateWebhook(
  req: Request,
  provider: string
): Promise<void> {
  // 1. Verify signature
  const signature = req.headers[SIGNATURE_HEADERS[provider]];
  if (!verifySignature(provider, req.body, signature)) {
    throw new SignatureError('Invalid webhook signature');
  }

  // 2. Check timestamp (replay prevention)
  const timestamp = extractTimestamp(req.body, provider);
  validateTimestamp(timestamp);

  // 3. Check idempotency (duplicate prevention)
  const messageId = extractMessageId(req.body, provider);
  if (await isDuplicate(messageId)) {
    throw new DuplicateError('Webhook already processed');
  }
}
```

### Email Inbound Authentication

Email webhooks (from services like SendGrid, Mailgun) require authentication:

```typescript
// SendGrid Inbound Parse
function verifySendGridWebhook(req: Request): boolean {
  // SendGrid uses basic auth or signed events
  if (config.email.provider === 'sendgrid') {
    // Option 1: Basic Auth on the endpoint
    const auth = req.headers.authorization;
    if (!auth || !isValidBasicAuth(auth, config.email.webhookAuth)) {
      return false;
    }
  }
  return true;
}

// Mailgun
function verifyMailgunWebhook(
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const hmac = crypto.createHmac('sha256', config.email.mailgunApiKey);
  hmac.update(timestamp + token);
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Direct IMAP (no webhook - polling)
// Email via IMAP doesn't use webhooks; Jack polls the mailbox
// See: IMAP configuration in channel-adapters.md
```

---

## WhatsApp Webhooks

### Endpoint

```
POST /webhooks/whatsapp
GET  /webhooks/whatsapp  (verification)
```

### Verification (GET)

Meta verifies webhook URL during setup:

```http
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SECRET&hub.challenge=CHALLENGE
```

Response: Return `hub.challenge` value if `hub.verify_token` matches.

### Message Webhook (POST)

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": { "name": "Sarah" },
                "wa_id": "15559876543"
              }
            ],
            "messages": [
              {
                "from": "15559876543",
                "id": "wamid.XXX",
                "timestamp": "1705315200",
                "type": "text",
                "text": { "body": "Hi, can I get extra towels?" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

### Status Webhook

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "statuses": [
              {
                "id": "wamid.XXX",
                "status": "delivered",
                "timestamp": "1705315300",
                "recipient_id": "15559876543"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Status values: `sent`, `delivered`, `read`, `failed`

### Processing Flow

```
Webhook Received
      │
      ▼
┌─────────────┐
│ Verify      │──► 401 if invalid
│ Signature   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Parse       │
│ Message     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Normalize   │
│ to Internal │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Route to    │
│ Gateway     │
└──────┬──────┘
       │
       ▼
  Return 200
```

---

## Twilio (SMS) Webhooks

### Endpoint

```
POST /webhooks/twilio/sms
```

### Inbound Message

```
POST /webhooks/twilio/sms
Content-Type: application/x-www-form-urlencoded

MessageSid=SM123...
From=+15559876543
To=+15551234567
Body=Hi, can I get extra towels?
NumMedia=0
```

### With Media (MMS)

```
MessageSid=SM123...
From=+15559876543
To=+15551234567
Body=Here's a photo of the issue
NumMedia=1
MediaUrl0=https://api.twilio.com/xxx/Media/ME123
MediaContentType0=image/jpeg
```

### Status Callback

```
POST /webhooks/twilio/status
Content-Type: application/x-www-form-urlencoded

MessageSid=SM123...
MessageStatus=delivered
To=+15559876543
```

Status values: `queued`, `sent`, `delivered`, `undelivered`, `failed`

### Response

Twilio expects TwiML response (empty for async processing):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

---

## PMS Webhooks

### Endpoint

```
POST /webhooks/pms/:vendor
```

### Mews Events

```json
{
  "Action": "ReservationUpdated",
  "Data": {
    "ReservationId": "res_123",
    "State": "Started",
    "AssignedResourceId": "room_412",
    "CustomerId": "cust_456"
  },
  "Timestamp": "2024-01-15T14:00:00Z"
}
```

Supported events:
- `ReservationCreated`
- `ReservationUpdated`
- `ReservationCanceled`
- `CustomerCreated`
- `CustomerUpdated`

### Opera Cloud Events

```json
{
  "eventType": "RESERVATION_CHECK_IN",
  "hotelId": "HOTEL01",
  "data": {
    "confirmationNumber": "ABC123",
    "roomNumber": "412",
    "guestProfileId": "12345"
  },
  "timestamp": "2024-01-15T14:00:00Z"
}
```

---

## Webhook Processing

### Idempotency

All webhooks are processed idempotently using message IDs:

```typescript
import { LRUCache } from 'lru-cache';

// In-memory cache for processed webhooks (24h TTL)
const processedWebhooks = new LRUCache<string, boolean>({
  max: 10000,
  ttl: 86400000  // 24 hours
});

async function processWebhook(messageId: string, handler: () => Promise<void>) {
  const key = `webhook:processed:${messageId}`;

  // Check if already processed
  if (processedWebhooks.has(key)) {
    return { status: 'duplicate', processed: false };
  }

  // Process
  await handler();

  // Mark as processed
  processedWebhooks.set(key, true);

  return { status: 'success', processed: true };
}
```

### Retry Handling

If webhook processing fails:

1. Return 500 status
2. Provider will retry (varies by provider)
3. After retries exhausted, alert operations

Retry schedules:
| Provider | Retries | Schedule |
|----------|---------|----------|
| WhatsApp | 3 | Exponential backoff |
| Twilio | 3 | 1 min, 5 min, 30 min |

### Error Response

```json
{
  "error": "Processing failed",
  "retryable": true
}
```

HTTP Status:
- `200` - Successfully processed
- `400` - Bad request (don't retry)
- `500` - Processing error (retry)

---

## Configuration

```yaml
webhooks:
  whatsapp:
    verifyToken: ${WA_VERIFY_TOKEN}
    appSecret: ${WA_APP_SECRET}
    path: /webhooks/whatsapp

  twilio:
    authToken: ${TWILIO_AUTH_TOKEN}
    path: /webhooks/twilio

  pms:
    mews:
      clientToken: ${MEWS_CLIENT_TOKEN}
      path: /webhooks/pms/mews

  security:
    validateSignatures: true
    ipAllowlist: true

  processing:
    timeout: 5000
    idempotencyTTL: 86400
```

---

## Monitoring

### Metrics

| Metric | Description |
|--------|-------------|
| `webhook.received` | Webhooks received by provider |
| `webhook.processed` | Successfully processed |
| `webhook.failed` | Processing failures |
| `webhook.duplicate` | Duplicate webhooks (idempotent skip) |
| `webhook.latency` | Processing latency |

### Alerts

- Webhook processing errors > 5% in 5 minutes
- Webhook latency > 2 seconds
- No webhooks from provider in 30 minutes

---

## Related

- [Gateway API](gateway-api.md)
- [Channel Adapters](../../03-architecture/c4-components/channel-adapters.md)
- [WhatsApp Integration](../integrations/whatsapp-channel.md)
