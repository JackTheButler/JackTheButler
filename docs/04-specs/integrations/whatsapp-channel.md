# Specification: WhatsApp Channel

WhatsApp Business API integration for guest messaging.

---

## Overview

WhatsApp is the primary messaging channel for Jack, especially for international guests. Integration uses the WhatsApp Business Platform (Cloud API) via Meta.

---

## Prerequisites

1. **Meta Business Account** - Verified business
2. **WhatsApp Business Account** - Connected to Meta Business
3. **Phone Number** - Dedicated number for the hotel
4. **App** - Meta App with WhatsApp product enabled

---

## Configuration

```yaml
whatsapp:
  # Meta App credentials
  appId: ${WA_APP_ID}
  appSecret: ${WA_APP_SECRET}

  # WhatsApp Business Account
  businessAccountId: ${WA_BUSINESS_ACCOUNT_ID}
  phoneNumberId: ${WA_PHONE_NUMBER_ID}
  accessToken: ${WA_ACCESS_TOKEN}

  # Webhook
  webhookVerifyToken: ${WA_WEBHOOK_VERIFY_TOKEN}
  webhookUrl: https://api.jackthebutler.com/webhooks/whatsapp

  # API
  apiVersion: v18.0
  baseUrl: https://graph.facebook.com
```

---

## Message Types

### Inbound (Guest → Jack)

| Type | Description | Example |
|------|-------------|---------|
| `text` | Plain text message | "Can I get extra towels?" |
| `image` | Photo with optional caption | Photo of maintenance issue |
| `document` | PDF, document | — |
| `location` | Shared location | — |
| `contacts` | Shared contact | — |
| `interactive` | Button/list reply | Button click response |

### Outbound (Jack → Guest)

| Type | Use Case | Template Required |
|------|----------|-------------------|
| `text` | General response | No (within 24h window) |
| `image` | Menu, map | No (within 24h window) |
| `interactive/buttons` | Quick replies | No (within 24h window) |
| `interactive/list` | Multiple options | No (within 24h window) |
| `template` | Proactive outreach | Yes |

---

## Message Templates

Templates are required for messages outside the 24-hour conversation window.

### Template Categories

| Category | Use Case | Approval |
|----------|----------|----------|
| `UTILITY` | Transactional updates | Quick |
| `MARKETING` | Promotions | Slower, restrictions |
| `AUTHENTICATION` | OTP codes | Quick |

### Jack Templates

#### Pre-Arrival Welcome

```
Name: pre_arrival_welcome
Category: UTILITY
Language: en

Header: None
Body: Hi {{1}}! This is Jack from {{2}}. We're looking forward to welcoming you on {{3}}.

Is there anything I can help you arrange before your arrival?

Footer: Reply to this message anytime
Buttons: None

Variables:
- {{1}}: Guest first name
- {{2}}: Property name
- {{3}}: Arrival date
```

#### Room Ready Notification

```
Name: room_ready
Category: UTILITY
Language: en

Body: Great news, {{1}}! Your room is ready.

Room {{2}}, {{3}} floor
WiFi: {{4}} | Password: {{5}}

Reply if you need anything as you settle in!

Variables:
- {{1}}: Guest first name
- {{2}}: Room number
- {{3}}: Floor
- {{4}}: WiFi network
- {{5}}: WiFi password
```

#### Checkout Reminder

```
Name: checkout_reminder
Category: UTILITY
Language: en

Body: Good morning, {{1}}! A reminder that checkout is at {{2}} today.

Would you like:
• Express checkout (I'll email your receipt)
• Late checkout (let me check availability)
• Help with luggage storage

Just reply with what you need!
```

---

## API Integration

### Sending Messages

#### Text Message

```typescript
async function sendTextMessage(to: string, text: string): Promise<string> {
  const response = await fetch(
    `${baseUrl}/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: text }
      })
    }
  );

  const data = await response.json();
  return data.messages[0].id;
}
```

#### Interactive Buttons

```typescript
async function sendButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title }
            }))
          }
        }
      })
    }
  );

  const data = await response.json();
  return data.messages[0].id;
}
```

#### Template Message

```typescript
async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: TemplateComponent[]
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components
        }
      })
    }
  );

  const data = await response.json();
  return data.messages[0].id;
}
```

### Webhook Handling

See [Webhook Spec](../api/webhook-spec.md) for detailed webhook handling.

---

## Conversation Windows

### 24-Hour Rule

- **User-initiated**: Guest messages first → 24-hour window opens
- **Business-initiated**: Must use template → 24-hour window opens on reply

### Window Management

```typescript
interface ConversationWindow {
  guestPhone: string;
  windowOpensAt: Date;
  windowClosesAt: Date;
  isOpen: boolean;
}

function canSendFreeformMessage(window: ConversationWindow): boolean {
  return window.isOpen && new Date() < window.windowClosesAt;
}

function mustUseTemplate(window: ConversationWindow): boolean {
  return !window.isOpen || new Date() >= window.windowClosesAt;
}
```

---

## Media Handling

### Receiving Media

```typescript
async function downloadMedia(mediaId: string): Promise<Buffer> {
  // Step 1: Get media URL
  const urlResponse = await fetch(
    `${baseUrl}/${apiVersion}/${mediaId}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const { url } = await urlResponse.json();

  // Step 2: Download media
  const mediaResponse = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  return Buffer.from(await mediaResponse.arrayBuffer());
}
```

### Sending Media

```typescript
async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption
        }
      })
    }
  );

  const data = await response.json();
  return data.messages[0].id;
}
```

---

## Rate Limits

| Limit Type | Value | Notes |
|------------|-------|-------|
| Messages per second | 80 | Per phone number |
| Template messages | 1000/day | New business tier |
| Conversation initiations | Tier-based | Increases with quality |

### Quality Rating

WhatsApp assigns quality ratings based on:
- User blocks
- User reports
- Template rejection rate

Ratings: `GREEN` (good), `YELLOW` (warning), `RED` (restricted)

### Handling Rate Limits

```typescript
class WhatsAppRateLimiter {
  private queue: Message[] = [];
  private processing = false;

  async send(message: Message): Promise<void> {
    this.queue.push(message);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue.shift()!;

      try {
        await this.sendMessage(message);
      } catch (error) {
        if (error.code === 'RATE_LIMITED') {
          this.queue.unshift(message);
          await sleep(1000); // Wait 1 second
        } else {
          throw error;
        }
      }

      await sleep(15); // ~66 messages/second max
    }

    this.processing = false;
  }
}
```

---

## Error Handling

### Common Errors

| Error Code | Meaning | Handling |
|------------|---------|----------|
| `131047` | Re-engagement required | Send template |
| `131051` | Unsupported message type | Fallback to text |
| `130429` | Rate limited | Queue and retry |
| `131026` | Phone not on WhatsApp | Alert, try SMS |
| `132000` | Template not found | Check template name |

### Error Response Format

```json
{
  "error": {
    "message": "Re-engagement message required",
    "type": "OAuthException",
    "code": 131047,
    "error_subcode": 2494055,
    "fbtrace_id": "xxx"
  }
}
```

---

## Monitoring

### Metrics

| Metric | Description |
|--------|-------------|
| `whatsapp.messages.sent` | Messages sent |
| `whatsapp.messages.delivered` | Delivery confirmed |
| `whatsapp.messages.read` | Read receipts |
| `whatsapp.messages.failed` | Send failures |
| `whatsapp.templates.sent` | Template messages |
| `whatsapp.quality.rating` | Current quality rating |

### Alerts

- Quality rating drops to YELLOW
- Delivery failure rate > 5%
- Rate limiting encountered
- Webhook processing delays

---

## Testing

### Test Numbers

Meta provides test phone numbers for development:
- Use sandbox mode for development
- Test templates in sandbox before production

### Phone Number Verification

In sandbox, you must add recipient numbers as test numbers before sending.

---

## Related

- [Channel Adapters](../../03-architecture/c4-components/channel-adapters.md)
- [Webhook Spec](../api/webhook-spec.md)
- [Pre-Arrival Use Case](../../02-use-cases/guest/pre-arrival.md)
