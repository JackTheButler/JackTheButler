# Component: Channel Adapters

Channel Adapters translate between external messaging platforms and Jack's internal message format, enabling guests to communicate through their preferred channels.

---

## Purpose

Provide a unified abstraction over diverse messaging platforms, handling the complexities of each platform's API while presenting a consistent interface to the Gateway.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHANNEL SERVICE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      ADAPTER MANAGER                                 │   │
│  │                                                                      │   │
│  │  • Adapter lifecycle management                                     │   │
│  │  • Health monitoring                                                │   │
│  │  • Rate limiting coordination                                       │   │
│  │  • Delivery tracking                                                │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         ADAPTERS                                     │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   WhatsApp   │  │     SMS      │  │    Email     │               │   │
│  │  │   Adapter    │  │   Adapter    │  │   Adapter    │               │   │
│  │  │              │  │              │  │              │               │   │
│  │  │ • Cloud API  │  │ • Twilio     │  │ • SMTP send  │               │   │
│  │  │ • Webhooks   │  │ • Webhooks   │  │ • IMAP recv  │               │   │
│  │  │ • Media      │  │ • MMS        │  │ • Threading  │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                                 │   │
│  │  │   WebChat    │  │    Voice     │                                 │   │
│  │  │   Adapter    │  │   Adapter    │                                 │   │
│  │  │              │  │   (Future)   │                                 │   │
│  │  │ • WebSocket  │  │              │                                 │   │
│  │  │ • Widget SDK │  │ • Twilio     │                                 │   │
│  │  └──────────────┘  └──────────────┘                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MESSAGE NORMALIZER                               │   │
│  │                                                                      │   │
│  │  • Convert platform-specific → internal format                      │   │
│  │  • Convert internal format → platform-specific                      │   │
│  │  • Handle media attachments                                         │   │
│  │  • Sanitize content                                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Adapter Interface

All adapters implement a common interface:

```typescript
interface ChannelAdapter {
  // Identity
  channelType: ChannelType;

  // Lifecycle
  initialize(config: ChannelConfig): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Messaging
  sendMessage(message: OutboundMessage): Promise<DeliveryResult>;
  handleInbound(raw: any): Promise<InboundMessage>;

  // Capabilities
  getCapabilities(): ChannelCapabilities;
}

interface ChannelCapabilities {
  supportsMedia: boolean;
  supportsButtons: boolean;
  supportsLists: boolean;
  supportsLocation: boolean;
  maxMessageLength: number;
  supportedMediaTypes: string[];
}
```

---

## Message Format

### Internal Message Format

```typescript
interface InboundMessage {
  id: string;
  channelType: ChannelType;
  channelMessageId: string;

  // Sender
  senderId: string;           // Channel-specific ID
  senderPhone?: string;
  senderEmail?: string;

  // Content
  content: string;
  contentType: 'text' | 'media' | 'location' | 'interactive';
  media?: MediaAttachment[];
  location?: Location;

  // Metadata
  timestamp: Date;
  replyTo?: string;
  metadata: Record<string, any>;
}

interface OutboundMessage {
  conversationId: string;
  channelType: ChannelType;
  recipientId: string;

  // Content
  content: string;
  media?: MediaAttachment[];
  buttons?: Button[];

  // Options
  replyTo?: string;
  scheduling?: {
    sendAt: Date;
  };
}

interface DeliveryResult {
  success: boolean;
  channelMessageId?: string;
  error?: string;
  timestamp: Date;
}
```

---

## WhatsApp Adapter

### Configuration

```yaml
whatsapp:
  businessAccountId: ${WA_BUSINESS_ID}
  phoneNumberId: ${WA_PHONE_NUMBER_ID}
  accessToken: ${WA_ACCESS_TOKEN}
  webhookVerifyToken: ${WA_WEBHOOK_TOKEN}
  apiVersion: v18.0
```

### Webhook Handling

```typescript
// Incoming webhook from Meta
app.post('/webhook/whatsapp', async (req, res) => {
  const { entry } = req.body;

  for (const e of entry) {
    for (const change of e.changes) {
      if (change.value.messages) {
        for (const msg of change.value.messages) {
          const normalized = await whatsappAdapter.handleInbound(msg);
          await gateway.routeInbound(normalized);
        }
      }

      // Handle status updates
      if (change.value.statuses) {
        for (const status of change.value.statuses) {
          await deliveryTracker.update(status);
        }
      }
    }
  }

  res.sendStatus(200);
});
```

### Message Templates

WhatsApp requires pre-approved templates for initiating conversations:

```typescript
interface WhatsAppTemplate {
  name: string;
  language: string;
  components: TemplateComponent[];
}

// Example: Pre-arrival welcome
const welcomeTemplate: WhatsAppTemplate = {
  name: 'pre_arrival_welcome',
  language: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: '{{guest_name}}' },
        { type: 'text', text: '{{arrival_date}}' },
        { type: 'text', text: '{{property_name}}' }
      ]
    }
  ]
};
```

---

## SMS Adapter (Twilio)

### Configuration

```yaml
sms:
  provider: twilio
  accountSid: ${TWILIO_ACCOUNT_SID}
  authToken: ${TWILIO_AUTH_TOKEN}
  phoneNumber: ${TWILIO_PHONE_NUMBER}
  messagingServiceSid: ${TWILIO_MESSAGING_SERVICE_SID}  # Optional
```

### Features

| Feature | Support |
|---------|---------|
| Text messages | ✓ |
| MMS (media) | ✓ (US/Canada) |
| Long messages | Auto-segmented |
| International | ✓ |
| Two-way | ✓ |

### Webhook Handling

```typescript
app.post('/webhook/sms', async (req, res) => {
  const { From, Body, MessageSid, NumMedia } = req.body;

  const message: InboundMessage = {
    id: uuidv4(),
    channelType: 'sms',
    channelMessageId: MessageSid,
    senderId: From,
    senderPhone: From,
    content: Body,
    contentType: NumMedia > 0 ? 'media' : 'text',
    timestamp: new Date()
  };

  // Handle media if present
  if (NumMedia > 0) {
    message.media = await extractTwilioMedia(req.body);
  }

  await gateway.routeInbound(message);

  // Twilio expects TwiML response (empty for async processing)
  res.type('text/xml').send('<Response></Response>');
});
```

---

## Email Adapter

### Configuration

```yaml
email:
  smtp:
    host: smtp.hotel.com
    port: 587
    secure: true
    user: ${SMTP_USER}
    password: ${SMTP_PASSWORD}
    from: jack@hotel.com

  imap:
    host: imap.hotel.com
    port: 993
    user: ${IMAP_USER}
    password: ${IMAP_PASSWORD}
    mailbox: INBOX
    pollInterval: 30000
```

### Email Threading

```typescript
// Maintain conversation threading via headers
interface EmailHeaders {
  'Message-ID': string;
  'In-Reply-To'?: string;
  'References'?: string;
  'X-Jack-Conversation-ID': string;
}

// Extract conversation ID from reply
function extractConversationId(email: ParsedEmail): string | null {
  // Check custom header first
  if (email.headers['x-jack-conversation-id']) {
    return email.headers['x-jack-conversation-id'];
  }

  // Fall back to References header
  if (email.headers['references']) {
    // Parse and lookup original message
  }

  return null;
}
```

---

## WebChat Adapter

### Widget Integration

```html
<!-- Hotel website -->
<script src="https://cdn.jackthebutler.com/widget.js"></script>
<script>
  JackChat.init({
    propertyId: 'hotel-123',
    position: 'bottom-right',
    theme: {
      primaryColor: '#1a365d',
      fontFamily: 'inherit'
    },
    greeting: 'Hi! I\'m Jack, your virtual concierge. How can I help?'
  });
</script>
```

### WebSocket Protocol

```typescript
// Client → Server
interface ChatClientMessage {
  type: 'message' | 'typing' | 'read';
  payload: {
    content?: string;
    conversationId?: string;
  };
}

// Server → Client
interface ChatServerMessage {
  type: 'message' | 'typing' | 'connected' | 'history';
  payload: {
    message?: Message;
    conversationId?: string;
    history?: Message[];
  };
}
```

---

## Rate Limiting

Each channel has platform-specific rate limits:

| Channel | Limit | Window | Strategy |
|---------|-------|--------|----------|
| WhatsApp | 80 msg/sec | Per phone | Queue + backoff |
| SMS (Twilio) | 1 msg/sec | Per number | Queue |
| Email | 100/hour | Per sender | Queue + throttle |
| WebChat | No limit | — | — |

### Rate Limiter Implementation

```typescript
class ChannelRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  async acquireSlot(channelType: ChannelType): Promise<void> {
    const limiter = this.getLimiter(channelType);
    await limiter.acquire();
  }

  private getLimiter(channelType: ChannelType): RateLimiter {
    if (!this.limiters.has(channelType)) {
      const config = RATE_LIMITS[channelType];
      this.limiters.set(channelType, new RateLimiter(config));
    }
    return this.limiters.get(channelType)!;
  }
}
```

---

## Delivery Tracking

```typescript
interface DeliveryStatus {
  messageId: string;
  channelMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  error?: string;
}

// Status webhooks update delivery tracking
async function handleStatusUpdate(status: DeliveryStatus): Promise<void> {
  await db.messageDelivery.upsert({
    where: { messageId: status.messageId },
    update: { status: status.status, updatedAt: status.timestamp },
    create: status
  });

  // Notify if failed
  if (status.status === 'failed') {
    await alerting.notifyDeliveryFailure(status);
  }
}
```

---

## Configuration

```yaml
channels:
  enabled:
    - whatsapp
    - sms
    - email
    - webchat

  defaults:
    retryAttempts: 3
    retryBackoff: exponential
    deliveryTimeout: 30000

  whatsapp:
    # ... WhatsApp specific config

  sms:
    # ... SMS specific config

  email:
    # ... Email specific config

  webchat:
    # ... WebChat specific config
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| `channel.messages.inbound` | Messages received by channel |
| `channel.messages.outbound` | Messages sent by channel |
| `channel.delivery.success` | Successful deliveries |
| `channel.delivery.failed` | Failed deliveries |
| `channel.latency` | Send latency by channel |
| `channel.rate_limit.hits` | Rate limit encounters |

---

## Related

- [Gateway](gateway.md) - Message routing
- [Webhook Spec](../../04-specs/api/webhook-spec.md) - Webhook details
- [WhatsApp Integration](../../04-specs/integrations/whatsapp-channel.md)
