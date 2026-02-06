# Webhooks

Inbound webhook endpoints for external services.

---

## Overview

Webhooks receive events from:
- **WhatsApp** — Incoming messages and delivery status
- **SMS (Twilio)** — Incoming messages and delivery status
- **PMS** — Reservation and guest updates

All webhook endpoints are under `/webhooks/`.

---

## WhatsApp

**Base path:** `/webhooks/whatsapp`

### GET /webhooks/whatsapp

Webhook verification for Meta.

**Query parameters:**
| Param | Description |
|-------|-------------|
| `hub.mode` | Must be `subscribe` |
| `hub.verify_token` | Token configured in dashboard |
| `hub.challenge` | Challenge to echo back |

**Response:** Returns challenge string if verification succeeds, 403 if fails.

### POST /webhooks/whatsapp

Receive incoming messages and status updates.

**Headers:**
| Header | Description |
|--------|-------------|
| `x-hub-signature-256` | HMAC-SHA256 signature using app secret |

**Signature verification:** If `appSecret` is configured, validates signature. Otherwise allows (dev mode).

**Response:** Always returns `200 OK` quickly to avoid Meta retries.

**Payload example (message):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "1555123456",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "Guest Name" },
          "wa_id": "1234567890"
        }],
        "messages": [{
          "from": "1234567890",
          "id": "wamid.xxx",
          "timestamp": "1699999999",
          "type": "text",
          "text": { "body": "Hello" }
        }]
      }
    }]
  }]
}
```

---

## SMS (Twilio)

**Base path:** `/webhooks/sms`

### POST /webhooks/sms

Receive incoming SMS messages.

**Headers:**
| Header | Description |
|--------|-------------|
| `x-twilio-signature` | HMAC-SHA1 signature using auth token |

**Body (form-encoded):**
| Field | Description |
|-------|-------------|
| `MessageSid` | Twilio message ID |
| `AccountSid` | Twilio account ID |
| `From` | Sender phone number |
| `To` | Recipient phone number |
| `Body` | Message text |
| `NumMedia` | Number of media attachments |

**Response:** Empty TwiML response.

```xml
<?xml version="1.0" encoding="UTF-8"?><Response></Response>
```

### POST /webhooks/sms/status

Receive message delivery status callbacks.

**Body (form-encoded):**
| Field | Description |
|-------|-------------|
| `MessageSid` | Twilio message ID |
| `MessageStatus` | Status: `queued`, `sending`, `sent`, `delivered`, `undelivered`, `failed` |
| `ErrorCode` | Error code (if failed) |
| `ErrorMessage` | Error message (if failed) |

---

## PMS

**Base path:** `/webhooks/pms`

### Authentication

Include secret in header:
```
X-Webhook-Secret: <secret>
```
Or:
```
Authorization: Bearer <secret>
```

If no secret is configured, requests are allowed (dev mode).

### POST /webhooks/pms/guests

Receive guest updates.

```json
{
  "externalId": "guest-123",
  "source": "mews",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "language": "en",
  "loyaltyTier": "gold",
  "vipStatus": "VIP",
  "preferences": [
    { "category": "room", "value": "high-floor" },
    { "category": "pillow", "value": "firm" }
  ]
}
```

### POST /webhooks/pms/reservations

Receive reservation updates.

```json
{
  "externalId": "res-456",
  "source": "mews",
  "confirmationNumber": "CONF123",
  "guest": {
    "externalId": "guest-123",
    "source": "mews",
    "firstName": "John",
    "lastName": "Doe"
  },
  "roomNumber": "501",
  "roomType": "deluxe-king",
  "arrivalDate": "2024-03-15",
  "departureDate": "2024-03-18",
  "status": "confirmed",
  "adults": 2,
  "children": 0,
  "rateCode": "BAR",
  "totalRate": 599.00,
  "currency": "USD",
  "specialRequests": ["late checkout", "extra pillows"]
}
```

### POST /webhooks/pms/events

Receive generic PMS events.

**Event types:**
- `reservation.created`
- `reservation.updated`
- `reservation.cancelled`
- `guest.checked_in`
- `guest.checked_out`
- `guest.updated`
- `room.status_changed`

```json
{
  "type": "guest.checked_in",
  "source": "mews",
  "timestamp": "2024-03-15T14:00:00Z",
  "data": {
    "reservation": { ... },
    "guest": { ... }
  }
}
```

### POST /webhooks/pms/mews

Mews-specific webhook endpoint. Verifies `x-mews-signature` if adapter supports it.

### POST /webhooks/pms/cloudbeds

Cloudbeds-specific webhook endpoint.

---

## Related

- [REST API](rest-api.md) — HTTP endpoints
- [PMS Integration](../pms/index.md) — PMS adapter details
- [Channels](../channels/whatsapp.md) — Channel configuration
