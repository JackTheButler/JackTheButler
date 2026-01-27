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
async function processWebhook(messageId: string, handler: () => Promise<void>) {
  const key = `webhook:processed:${messageId}`;

  // Check if already processed
  const exists = await redis.exists(key);
  if (exists) {
    return { status: 'duplicate', processed: false };
  }

  // Process
  await handler();

  // Mark as processed (24h TTL)
  await redis.set(key, '1', 'EX', 86400);

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
