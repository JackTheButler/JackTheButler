# SMS Channel

Twilio SMS integration.

---

## Provider

**App ID:** `sms-twilio`

SMS messaging via Twilio.

---

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountSid` | text | Yes | Twilio Account SID |
| `authToken` | password | Yes | Twilio Auth Token |
| `phoneNumber` | text | Yes | Twilio phone number (E.164 format) |

---

## Features

| Feature | Supported |
|---------|-----------|
| Inbound messages | Yes |
| Outbound messages | Yes |
| Media (MMS) | Yes |
| Delivery status | Yes |

---

## Webhook Setup

Configure webhook URLs in Twilio Console:

**Incoming messages:**
```
POST https://your-domain.com/webhooks/sms
```

**Status callbacks:**
```
POST https://your-domain.com/webhooks/sms/status
```

---

## Message Flow

**Sending:**
```typescript
await provider.sendMessage('+1234567890', 'Hello from the hotel!');
```

**Response format:**
```json
{
  "sid": "SM1234...",
  "to": "+1234567890",
  "from": "+1987654321",
  "status": "queued"
}
```

---

## Status Updates

Status values from Twilio:
- `queued` — Message queued
- `sending` — Message being sent
- `sent` — Message sent to carrier
- `delivered` — Message delivered
- `undelivered` — Delivery failed
- `failed` — Message failed

---

## Limitations

- SMS segment limit (160 chars per segment)
- MMS only available in US/Canada
- International SMS costs vary by destination

---

## Related

- [Webhooks](../api/webhooks.md) — Webhook payload format
- [REST API](../api/rest-api.md) — Conversation endpoints
