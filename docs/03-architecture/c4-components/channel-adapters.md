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

All channel adapters implement a common interface ensuring interchangeability and consistent behavior across messaging platforms.

### Core Interface

```typescript
// =============================================================================
// CHANNEL TYPES
// =============================================================================

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

/**
 * Base interface for all channel adapters.
 * Each adapter handles platform-specific communication while
 * presenting a unified interface to the Gateway.
 */
interface ChannelAdapter {
  /** Channel type identifier */
  readonly channelType: ChannelType;

  /** Human-readable adapter name */
  readonly name: string;

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the adapter with configuration.
   * Called once at startup.
   */
  initialize(config: ChannelConfig): Promise<void>;

  /**
   * Gracefully shutdown the adapter.
   * Flush pending messages, close connections.
   */
  shutdown(): Promise<void>;

  /**
   * Validate configuration before initialization.
   * Returns validation errors if config is invalid.
   */
  validateConfiguration(config: ChannelConfig): Promise<ConfigValidationResult>;

  /**
   * Check adapter health and connectivity.
   * Used by health check endpoints.
   */
  healthCheck(): Promise<HealthCheckResult>;

  // ─────────────────────────────────────────────────────────────────────────
  // INBOUND MESSAGES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse raw webhook payload into normalized message.
   * Handles platform-specific format conversion.
   */
  parseInbound(raw: unknown): Promise<ParsedInbound>;

  /**
   * Verify webhook signature/authenticity.
   * Returns false if signature is invalid.
   */
  verifyWebhook(request: WebhookRequest): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────────────
  // OUTBOUND MESSAGES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send a message to a recipient.
   * Handles rate limiting, retries, and delivery tracking.
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * Send a templated message (for WhatsApp Business API, etc.).
   * Templates must be pre-approved by the platform.
   */
  sendTemplate?(template: TemplateMessage): Promise<SendResult>;

  /**
   * Send typing indicator (if supported).
   */
  sendTypingIndicator?(recipientId: string, isTyping: boolean): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get current delivery status of a message.
   * May query the platform API or return cached status.
   */
  getDeliveryStatus(channelMessageId: string): Promise<DeliveryStatus>;

  /**
   * Parse delivery status webhook into normalized status.
   */
  parseDeliveryStatus(raw: unknown): Promise<DeliveryStatusUpdate | null>;

  // ─────────────────────────────────────────────────────────────────────────
  // CAPABILITIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get channel capabilities for feature detection.
   */
  getCapabilities(): ChannelCapabilities;

  /**
   * Check if a specific feature is supported.
   */
  supports(feature: ChannelFeature): boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ChannelConfig {
  /** Channel-specific settings */
  [key: string]: unknown;

  /** Common settings */
  enabled: boolean;
  rateLimits?: RateLimitConfig;
  retryConfig?: RetryConfig;
  timeout?: number;
}

interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

interface ConfigValidationError {
  field: string;
  message: string;
  code: 'MISSING' | 'INVALID' | 'UNAUTHORIZED';
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  details: {
    apiConnectivity: boolean;
    webhookConfigured: boolean;
    rateLimitStatus: 'ok' | 'near_limit' | 'limited';
    lastSuccessfulSend?: Date;
    lastError?: string;
  };
  checkedAt: Date;
}

// =============================================================================
// CAPABILITIES
// =============================================================================

interface ChannelCapabilities {
  /** Basic capabilities */
  supportsMedia: boolean;
  supportsButtons: boolean;
  supportsLists: boolean;
  supportsLocation: boolean;
  supportsReactions: boolean;
  supportsTypingIndicator: boolean;
  supportsReadReceipts: boolean;

  /** Message limits */
  maxMessageLength: number;
  maxButtonCount: number;
  maxListItems: number;

  /** Media support */
  supportedMediaTypes: MediaType[];
  maxMediaSize: number;  // bytes

  /** Template support (WhatsApp) */
  requiresTemplateForInitiation: boolean;
  supportsTemplateButtons: boolean;

  /** Threading */
  supportsThreading: boolean;
  supportsReplyTo: boolean;
}

type ChannelFeature =
  | 'media'
  | 'buttons'
  | 'lists'
  | 'location'
  | 'reactions'
  | 'typing'
  | 'read_receipts'
  | 'templates'
  | 'threading';

type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

// =============================================================================
// INBOUND MESSAGES
// =============================================================================

interface WebhookRequest {
  headers: Record<string, string>;
  body: unknown;
  signature?: string;
  timestamp?: number;
}

interface ParsedInbound {
  /** Message type */
  type: 'message' | 'status' | 'reaction' | 'unknown';

  /** Normalized message (if type is 'message') */
  message?: InboundMessage;

  /** Status update (if type is 'status') */
  status?: DeliveryStatusUpdate;

  /** Reaction (if type is 'reaction') */
  reaction?: InboundReaction;

  /** Raw payload for debugging */
  raw: unknown;
}

interface InboundMessage {
  /** Internal ID (generated) */
  id: string;

  /** Channel info */
  channelType: ChannelType;
  channelMessageId: string;

  /** Sender identification */
  senderId: string;           // Channel-specific ID (phone, email, session)
  senderPhone?: string;       // E.164 format
  senderEmail?: string;
  senderName?: string;        // If available

  /** Content */
  content: string;
  contentType: ContentType;
  media?: MediaAttachment[];
  location?: LocationData;
  contacts?: ContactData[];

  /** Interactive response (button click, list selection) */
  interactiveReply?: InteractiveReply;

  /** Threading */
  replyToMessageId?: string;
  threadId?: string;

  /** Context */
  timestamp: Date;
  metadata: Record<string, unknown>;
}

type ContentType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'sticker'
  | 'reaction';

interface InteractiveReply {
  type: 'button' | 'list';
  buttonId?: string;
  buttonText?: string;
  listItemId?: string;
  listItemTitle?: string;
}

interface InboundReaction {
  messageId: string;
  emoji: string;
  senderId: string;
  action: 'add' | 'remove';
}

// =============================================================================
// OUTBOUND MESSAGES
// =============================================================================

interface OutboundMessage {
  /** Conversation reference */
  conversationId: string;

  /** Recipient */
  recipientId: string;        // Phone, email, or session ID

  /** Content (at least one required) */
  content?: string;
  media?: OutboundMedia[];
  buttons?: MessageButton[];
  list?: MessageList;
  location?: LocationData;

  /** Threading */
  replyToMessageId?: string;

  /** Options */
  previewUrl?: boolean;       // Show link preview
  scheduling?: {
    sendAt: Date;
  };

  /** Idempotency */
  idempotencyKey?: string;

  /** Metadata for tracking */
  metadata?: Record<string, unknown>;
}

interface OutboundMedia {
  type: MediaType;
  url?: string;               // Public URL
  data?: Buffer;              // Raw data (will be uploaded)
  filename?: string;
  caption?: string;
  mimeType?: string;
}

interface MessageButton {
  id: string;
  text: string;
  type: 'reply' | 'url' | 'phone';
  url?: string;
  phoneNumber?: string;
}

interface MessageList {
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttonText: string;
  sections: ListSection[];
}

interface ListSection {
  title?: string;
  items: ListItem[];
}

interface ListItem {
  id: string;
  title: string;
  description?: string;
}

// =============================================================================
// TEMPLATE MESSAGES
// =============================================================================

interface TemplateMessage {
  /** Recipient */
  recipientId: string;

  /** Template identification */
  templateName: string;
  templateLanguage: string;

  /** Template components */
  components: TemplateComponent[];

  /** Conversation reference */
  conversationId?: string;
}

interface TemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button';
  parameters?: TemplateParameter[];
  buttonIndex?: number;       // For button components
}

type TemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; code: string; amount: number }
  | { type: 'date_time'; timestamp: number }
  | { type: 'image'; url: string }
  | { type: 'document'; url: string; filename: string }
  | { type: 'video'; url: string };

// =============================================================================
// SEND RESULTS
// =============================================================================

interface SendResult {
  success: boolean;

  /** Channel-assigned message ID (for tracking) */
  channelMessageId?: string;

  /** Timestamp of send */
  timestamp: Date;

  /** Error details if failed */
  error?: SendError;

  /** Rate limit info */
  rateLimitInfo?: {
    remaining: number;
    resetAt: Date;
  };
}

interface SendError {
  code: SendErrorCode;
  message: string;
  retryable: boolean;
  retryAfter?: number;        // Seconds until retry
  details?: Record<string, unknown>;
}

type SendErrorCode =
  | 'RATE_LIMITED'            // Platform rate limit hit
  | 'INVALID_RECIPIENT'       // Bad phone/email
  | 'RECIPIENT_BLOCKED'       // User blocked the sender
  | 'TEMPLATE_NOT_FOUND'      // Template doesn't exist
  | 'TEMPLATE_PAUSED'         // Template paused by platform
  | 'MEDIA_TOO_LARGE'         // Media exceeds size limit
  | 'MEDIA_TYPE_UNSUPPORTED'  // Media type not supported
  | 'INSUFFICIENT_FUNDS'      // Account balance issue
  | 'AUTHENTICATION_ERROR'    // API key/token issue
  | 'NETWORK_ERROR'           // Connection failed
  | 'PLATFORM_ERROR'          // Platform internal error
  | 'UNKNOWN';

// =============================================================================
// DELIVERY STATUS
// =============================================================================

interface DeliveryStatus {
  channelMessageId: string;
  status: DeliveryStatusValue;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
}

interface DeliveryStatusUpdate extends DeliveryStatus {
  recipientId: string;
  conversationId?: string;
}

type DeliveryStatusValue =
  | 'pending'      // Queued for send
  | 'sent'         // Sent to platform
  | 'delivered'    // Delivered to device
  | 'read'         // Read by recipient
  | 'failed'       // Delivery failed
  | 'undeliverable'; // Permanently undeliverable

// =============================================================================
// SHARED TYPES
// =============================================================================

interface MediaAttachment {
  id: string;
  type: MediaType;
  mimeType: string;
  url?: string;               // Download URL
  storagePath?: string;       // Local storage path
  size?: number;
  filename?: string;
  caption?: string;
  thumbnailUrl?: string;
}

interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

interface ContactData {
  name: string;
  phones?: string[];
  emails?: string[];
}

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstSize: number;
}

interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}
```

### Channel Capabilities Summary

| Capability | WhatsApp | SMS | Email | WebChat |
|------------|----------|-----|-------|---------|
| Media | ✓ | ✓ (MMS) | ✓ | ✓ |
| Buttons | ✓ (3 max) | ✗ | ✗ | ✓ |
| Lists | ✓ (10 items) | ✗ | ✗ | ✓ |
| Location | ✓ | ✗ | ✗ | ✓ |
| Typing indicator | ✓ | ✗ | ✗ | ✓ |
| Read receipts | ✓ | ✗ | ✗ | ✓ |
| Templates required | ✓ (initiate) | ✗ | ✗ | ✗ |
| Threading | ✓ | ✗ | ✓ | ✓ |
| Max message length | 4096 | 1600 | Unlimited | Unlimited |
| Max media size | 16 MB | 5 MB | 25 MB | 10 MB |

### Adapter Implementation Example

```typescript
class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = 'whatsapp';
  readonly name = 'WhatsApp Business Cloud API';

  private client: WhatsAppCloudClient;
  private config: WhatsAppConfig;
  private rateLimiter: RateLimiter;

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config as WhatsAppConfig;
    this.client = new WhatsAppCloudClient({
      phoneNumberId: this.config.phoneNumberId,
      accessToken: this.config.accessToken,
      apiVersion: this.config.apiVersion || 'v18.0',
    });
    this.rateLimiter = new RateLimiter(config.rateLimits || {
      requestsPerSecond: 60,
      requestsPerMinute: 1000,
      burstSize: 80,
    });
  }

  async validateConfiguration(config: ChannelConfig): Promise<ConfigValidationResult> {
    const errors: ConfigValidationError[] = [];
    const warnings: string[] = [];
    const waConfig = config as WhatsAppConfig;

    if (!waConfig.phoneNumberId) {
      errors.push({ field: 'phoneNumberId', message: 'Required', code: 'MISSING' });
    }
    if (!waConfig.accessToken) {
      errors.push({ field: 'accessToken', message: 'Required', code: 'MISSING' });
    }
    if (!waConfig.webhookVerifyToken) {
      warnings.push('webhookVerifyToken not set - webhook verification disabled');
    }

    // Test API connectivity
    if (errors.length === 0) {
      try {
        await this.testConnection(waConfig);
      } catch (error) {
        errors.push({
          field: 'accessToken',
          message: `API connection failed: ${error.message}`,
          code: 'UNAUTHORIZED',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async verifyWebhook(request: WebhookRequest): Promise<boolean> {
    const signature = request.headers['x-hub-signature-256'];
    if (!signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(JSON.stringify(request.body))
      .digest('hex');

    return `sha256=${expectedSignature}` === signature;
  }

  async parseInbound(raw: unknown): Promise<ParsedInbound> {
    const payload = raw as WhatsAppWebhookPayload;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        // Handle incoming messages
        if (change.value.messages?.length) {
          const msg = change.value.messages[0];
          return {
            type: 'message',
            message: this.normalizeMessage(msg, change.value),
            raw,
          };
        }

        // Handle status updates
        if (change.value.statuses?.length) {
          const status = change.value.statuses[0];
          return {
            type: 'status',
            status: this.normalizeStatus(status),
            raw,
          };
        }
      }
    }

    return { type: 'unknown', raw };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    await this.rateLimiter.acquire();

    try {
      const waMessage = this.buildWhatsAppMessage(message);
      const response = await this.client.messages.send(waMessage);

      return {
        success: true,
        channelMessageId: response.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        timestamp: new Date(),
        error: this.normalizeError(error),
      };
    }
  }

  async sendTemplate(template: TemplateMessage): Promise<SendResult> {
    await this.rateLimiter.acquire();

    try {
      const response = await this.client.messages.send({
        messaging_product: 'whatsapp',
        to: template.recipientId,
        type: 'template',
        template: {
          name: template.templateName,
          language: { code: template.templateLanguage },
          components: template.components,
        },
      });

      return {
        success: true,
        channelMessageId: response.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        timestamp: new Date(),
        error: this.normalizeError(error),
      };
    }
  }

  async getDeliveryStatus(channelMessageId: string): Promise<DeliveryStatus> {
    // WhatsApp doesn't have a status query API
    // Return cached status from database
    const cached = await db.messageDelivery.findByChannelId(channelMessageId);
    if (cached) {
      return cached;
    }
    return {
      channelMessageId,
      status: 'pending',
      timestamp: new Date(),
    };
  }

  async parseDeliveryStatus(raw: unknown): Promise<DeliveryStatusUpdate | null> {
    const payload = raw as WhatsAppStatusPayload;
    if (!payload.id || !payload.status) return null;

    return {
      channelMessageId: payload.id,
      recipientId: payload.recipient_id,
      status: this.mapStatus(payload.status),
      timestamp: new Date(parseInt(payload.timestamp) * 1000),
      errorCode: payload.errors?.[0]?.code?.toString(),
      errorMessage: payload.errors?.[0]?.message,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      supportsMedia: true,
      supportsButtons: true,
      supportsLists: true,
      supportsLocation: true,
      supportsReactions: true,
      supportsTypingIndicator: true,
      supportsReadReceipts: true,
      maxMessageLength: 4096,
      maxButtonCount: 3,
      maxListItems: 10,
      supportedMediaTypes: ['image', 'audio', 'video', 'document', 'sticker'],
      maxMediaSize: 16 * 1024 * 1024, // 16 MB
      requiresTemplateForInitiation: true,
      supportsTemplateButtons: true,
      supportsThreading: true,
      supportsReplyTo: true,
    };
  }

  supports(feature: ChannelFeature): boolean {
    const caps = this.getCapabilities();
    const featureMap: Record<ChannelFeature, boolean> = {
      media: caps.supportsMedia,
      buttons: caps.supportsButtons,
      lists: caps.supportsLists,
      location: caps.supportsLocation,
      reactions: caps.supportsReactions,
      typing: caps.supportsTypingIndicator,
      read_receipts: caps.supportsReadReceipts,
      templates: caps.requiresTemplateForInitiation,
      threading: caps.supportsThreading,
    };
    return featureMap[feature] ?? false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Test API with a lightweight call
      await this.client.phoneNumbers.get(this.config.phoneNumberId);

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          apiConnectivity: true,
          webhookConfigured: !!this.config.webhookVerifyToken,
          rateLimitStatus: this.rateLimiter.getStatus(),
          lastSuccessfulSend: this.lastSuccessfulSend,
        },
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: {
          apiConnectivity: false,
          webhookConfigured: !!this.config.webhookVerifyToken,
          rateLimitStatus: 'ok',
          lastError: error.message,
        },
        checkedAt: new Date(),
      };
    }
  }

  private normalizeError(error: WhatsAppAPIError): SendError {
    const errorMap: Record<number, SendErrorCode> = {
      130429: 'RATE_LIMITED',
      131051: 'INVALID_RECIPIENT',
      131026: 'RECIPIENT_BLOCKED',
      132000: 'TEMPLATE_NOT_FOUND',
      132015: 'TEMPLATE_PAUSED',
      131053: 'MEDIA_TOO_LARGE',
      131052: 'MEDIA_TYPE_UNSUPPORTED',
    };

    const code = errorMap[error.code] || 'PLATFORM_ERROR';
    const retryable = ['RATE_LIMITED', 'NETWORK_ERROR', 'PLATFORM_ERROR'].includes(code);

    return {
      code,
      message: error.message,
      retryable,
      retryAfter: error.code === 130429 ? 60 : undefined,
      details: error.details,
    };
  }
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
    apiUrl: 'https://jack.yourhotel.com',  // Your Jack instance URL
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

## Failure Modes

### Out-of-Order Status Updates

Webhooks can arrive out of order (delivered before sent):

```typescript
const STATUS_PRIORITY: Record<DeliveryStatus['status'], number> = {
  'sent': 1,
  'delivered': 2,
  'read': 3,
  'failed': 0  // Failed can happen at any point
};

async function handleStatusUpdate(status: DeliveryStatus): Promise<void> {
  const existing = await getDeliveryStatus(status.messageId);

  // Only update if new status is "later" in lifecycle
  // Exception: 'failed' always overwrites
  if (existing && status.status !== 'failed') {
    if (STATUS_PRIORITY[status.status] <= STATUS_PRIORITY[existing.status]) {
      // Stale status update - ignore
      return;
    }
  }

  await updateDeliveryStatus(status);
}
```

### Duplicate Message Delivery (Idempotency)

```typescript
import { LRUCache } from 'lru-cache';

// Track processed message IDs
const processedMessages = new LRUCache<string, boolean>({
  max: 50000,
  ttl: 86400000 // 24 hours
});

async function handleInboundMessage(raw: RawMessage): Promise<boolean> {
  const messageId = extractMessageId(raw);

  // Check if already processed
  if (processedMessages.has(messageId)) {
    console.log(`Duplicate message ignored: ${messageId}`);
    return false;
  }

  // Mark as processing
  processedMessages.set(messageId, true);

  try {
    await processMessage(raw);
    return true;
  } catch (error) {
    // Remove from cache so retry can work
    processedMessages.delete(messageId);
    throw error;
  }
}
```

### Stale Webhook Handling

Webhooks can be delayed for hours due to provider issues:

```typescript
const MAX_WEBHOOK_AGE_MS = 3600000; // 1 hour

async function validateWebhookTimestamp(timestamp: Date): Promise<void> {
  const age = Date.now() - timestamp.getTime();

  if (age > MAX_WEBHOOK_AGE_MS) {
    // Log but still process - guest message shouldn't be lost
    console.warn(`Stale webhook: ${age}ms old`);
    metrics.increment('webhook.stale');
  }

  if (age < 0) {
    // Future timestamp - likely clock skew
    console.warn(`Future webhook timestamp: ${timestamp}`);
    // Process anyway but flag
  }
}
```

### Rate Limit Coordination

Jack enforces its own limits below provider limits to ensure headroom:

| Channel | Provider Limit | Jack Limit | Headroom |
|---------|---------------|------------|----------|
| WhatsApp | 80 msg/sec | 60 msg/sec | 25% |
| SMS (Twilio) | 1 msg/sec | 0.8 msg/sec | 20% |
| Email | 100/hour | 80/hour | 20% |

```typescript
class AdaptiveRateLimiter {
  private currentLimit: number;
  private baseLimit: number;
  private backoffMultiplier: number = 0.5;

  async checkLimit(): Promise<void> {
    if (this.recentlyRateLimited) {
      // Provider hit - reduce Jack's limit temporarily
      this.currentLimit = Math.floor(this.baseLimit * this.backoffMultiplier);
      setTimeout(() => this.resetLimit(), 60000); // Reset after 1 min
    }
  }

  recordProviderRateLimit(): void {
    this.recentlyRateLimited = true;
    metrics.increment('channel.provider_rate_limit');
  }

  private resetLimit(): void {
    this.currentLimit = this.baseLimit;
    this.recentlyRateLimited = false;
  }
}
```

---

## Media Handling

### Storage

Media attachments are stored on the file system, with metadata in SQLite:

```typescript
interface MediaAttachment {
  id: string;
  messageId: string;
  type: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  size: number;
  storagePath: string;  // data/media/{date}/{id}.{ext}
  thumbnailPath?: string;
  createdAt: Date;
}

const MEDIA_STORAGE_PATH = 'data/media';

async function storeMedia(file: Buffer, metadata: MediaMetadata): Promise<string> {
  const date = format(new Date(), 'yyyy-MM-dd');
  const dir = path.join(MEDIA_STORAGE_PATH, date);
  await fs.mkdir(dir, { recursive: true });

  const id = nanoid();
  const ext = getExtension(metadata.mimeType);
  const filePath = path.join(dir, `${id}.${ext}`);

  await fs.writeFile(filePath, file);

  return filePath;
}
```

### Size Limits

| Channel | Max Size | Supported Types |
|---------|----------|-----------------|
| WhatsApp | 16 MB | image, audio, video, document |
| SMS (MMS) | 5 MB | image, audio, video |
| Email | 25 MB | any |
| WebChat | 10 MB | image, document |

```typescript
function validateMedia(file: Buffer, channel: ChannelType): void {
  const limits = MEDIA_LIMITS[channel];

  if (file.length > limits.maxSize) {
    throw new MediaTooLargeError(channel, file.length, limits.maxSize);
  }
}
```

### Outbound Media

Jack can send images for certain responses (e.g., maps, menus):

```typescript
const CHANNELS_WITH_IMAGE_SUPPORT = ['whatsapp', 'email', 'webchat'];

async function sendWithMedia(
  conversationId: string,
  message: string,
  media?: MediaAttachment
): Promise<void> {
  const conversation = await getConversation(conversationId);

  if (media && !CHANNELS_WITH_IMAGE_SUPPORT.includes(conversation.channel)) {
    // Channel doesn't support media - send text only with link
    const url = await getPublicUrl(media);
    message = `${message}\n\nView attachment: ${url}`;
    media = undefined;
  }

  await channelAdapter.send(conversation.channel, {
    recipientId: conversation.channelId,
    content: message,
    media
  });
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
