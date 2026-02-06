# WhatsApp Channel

WhatsApp Business Cloud API integration.

---

## Provider

**App ID:** `whatsapp-meta`

WhatsApp Business Cloud API by Meta.

---

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | password | Yes | Permanent access token from Meta Business |
| `phoneNumberId` | text | Yes | WhatsApp Business phone number ID |
| `verifyToken` | text | No | Token for webhook verification |
| `appSecret` | password | No | App secret for signature verification |

---

## Features

| Feature | Supported |
|---------|-----------|
| Inbound messages | Yes |
| Outbound messages | Yes |
| Media (images, documents) | Yes |
| Message templates | Yes |
| Read receipts | Yes |
| Delivery status | Yes |

---

## Webhook Setup

1. Configure webhook URL in Meta Business Manager:
   ```
   https://your-domain.com/webhooks/whatsapp
   ```

2. Set verify token to match `verifyToken` in config

3. Subscribe to:
   - `messages` field

---

## Message Types

**Text message:**
```json
{
  "to": "+1234567890",
  "type": "text",
  "text": {
    "body": "Hello, how can I help?",
    "preview_url": false
  }
}
```

**Template message:**
```json
{
  "to": "+1234567890",
  "type": "template",
  "template": {
    "name": "check_in_reminder",
    "language": { "code": "en" },
    "components": []
  }
}
```

---

## Status Updates

Delivery status values:
- `sent` — Message sent to WhatsApp servers
- `delivered` — Message delivered to device
- `read` — Message read by recipient
- `failed` — Delivery failed

---

## Limitations

- 24-hour messaging window for non-template messages
- Template messages require pre-approval
- Media files must be hosted on accessible URLs or uploaded to Meta

---

## Related

- [Webhooks](../api/webhooks.md) — Webhook payload format
- [REST API](../api/rest-api.md) — Conversation endpoints
