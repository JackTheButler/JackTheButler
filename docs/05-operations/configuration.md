# Configuration Reference

Complete configuration options for Jack The Butler.

---

## Configuration Methods

Jack supports configuration via:
1. **Environment variables** - For secrets and deployment-specific settings
2. **Configuration files** - For application settings (YAML)
3. **Database** - For runtime/property settings (via Admin Console)

Priority: Environment variables > Config files > Database defaults

---

## Environment Variables

### Core

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment: development, production | No | development |
| `PORT` | Gateway HTTP port | No | 3000 |
| `LOG_LEVEL` | Logging level: debug, info, warn, error | No | info |

### Database

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_PATH` | SQLite database file path | No (default: `./data/jack.db`) |

### Security

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | Yes |
| `ENCRYPTION_KEY` | Key for data encryption (32 bytes) | Yes |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | No |

### AI Providers

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | No |

### WhatsApp

| Variable | Description | Required |
|----------|-------------|----------|
| `WHATSAPP_APP_ID` | Meta App ID | If WhatsApp enabled |
| `WHATSAPP_APP_SECRET` | Meta App Secret | If WhatsApp enabled |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID | If WhatsApp enabled |
| `WHATSAPP_ACCESS_TOKEN` | Permanent access token | If WhatsApp enabled |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | If WhatsApp enabled |

### Twilio (SMS)

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | If SMS enabled |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | If SMS enabled |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | If SMS enabled |

### PMS

| Variable | Description | Required |
|----------|-------------|----------|
| `PMS_VENDOR` | PMS type: opera, mews, cloudbeds | If PMS enabled |
| `PMS_API_KEY` | PMS API key/token | If PMS enabled |
| `PMS_HOSTNAME` | PMS API hostname | If PMS enabled |

---

## Configuration File

### Location

- Development: `./config/default.yaml`
- Production: `./config/production.yaml`
- Override: `./config/local.yaml` (gitignored)

### Full Configuration

```yaml
# config/default.yaml

# Server configuration
server:
  port: 3000
  host: 0.0.0.0
  trustProxy: true

# Gateway settings
gateway:
  websocket:
    pingInterval: 30000
    pingTimeout: 5000
    maxConnections: 10000

  session:
    ttl: 3600
    cookieName: jack_session
    secure: true

  rateLimit:
    enabled: true
    windowMs: 60000
    maxRequests: 100

# AI Engine configuration
ai:
  defaultProvider: claude

  providers:
    claude:
      enabled: true
      model: claude-sonnet-4-20250514
      maxTokens: 1024
      temperature: 0.7

    openai:
      enabled: false
      model: gpt-4o
      maxTokens: 1024

  routing:
    confidenceThreshold: 0.7
    intentThresholds:
      complaint: 0.8
      request.dining: 0.75

  rag:
    enabled: true
    topK: 5
    similarityThreshold: 0.75

# Channel configuration
channels:
  enabled:
    - whatsapp
    - sms
    - webchat

  whatsapp:
    apiVersion: v18.0

  sms:
    provider: twilio

  webchat:
    allowAnonymous: true
    sessionTimeout: 1800

  defaults:
    retryAttempts: 3
    retryBackoff: exponential

# Integration settings
integrations:
  pms:
    syncEnabled: true
    syncInterval: 300  # seconds

  sync:
    arrivals:
      enabled: true
      lookAheadDays: 1
    roomStatus:
      enabled: true
      interval: 300

  cache:
    guestTTL: 3600
    reservationTTL: 300

# Task routing
routing:
  escalation:
    confidenceThreshold: 0.7
    alwaysEscalate:
      - cancellation
      - billing_dispute

  assignment:
    strategy: least_busy

  sla:
    urgent:
      response: 5
      resolution: 15
    high:
      response: 10
      resolution: 30
    standard:
      response: 15
      resolution: 60

# Automation
automation:
  proactiveMessaging:
    enabled: true
    preArrivalDays: 3
    checkoutReminderHour: 8
    postStayDelayHours: 24

  suppressionRules:
    minIntervalHours: 4
    respectDnd: true

# Logging
logging:
  level: info
  format: json
  includeTimestamp: true

# Monitoring
monitoring:
  metrics:
    enabled: true
    port: 9090

  healthCheck:
    enabled: true
    path: /health

# Privacy
privacy:
  dataRetentionDays: 730
  anonymizeOnDelete: true
  auditLogging: true
```

---

## Property Configuration

Property-specific settings are stored in the database and managed via Admin Console.

### Property Settings Schema

```typescript
interface PropertySettings {
  // Identity
  name: string;
  code: string;
  timezone: string;
  locale: string;

  // Channels
  channels: {
    whatsapp: {
      enabled: boolean;
      phoneNumberId: string;
    };
    sms: {
      enabled: boolean;
      phoneNumber: string;
    };
    webchat: {
      enabled: boolean;
      widgetColor: string;
    };
    email: {
      enabled: boolean;
      fromAddress: string;
    };
  };

  // Messaging
  messaging: {
    greeting: string;
    signOff: string;
    language: string;
    supportedLanguages: string[];
  };

  // Hours
  hours: {
    frontDesk: { open: string; close: string };
    restaurant: { breakfast: string; dinner: string };
    pool: { open: string; close: string };
    gym: { open: string; close: string };
  };

  // Features
  features: {
    roomService: boolean;
    concierge: boolean;
    spa: boolean;
    parking: boolean;
  };

  // Automation
  automation: {
    preArrivalMessage: boolean;
    roomReadyNotification: boolean;
    checkoutReminder: boolean;
    postStayFollowup: boolean;
  };

  // Escalation
  escalation: {
    confidenceThreshold: number;
    vipAutoEscalate: boolean;
    afterHoursContact: string;
  };
}
```

### Managing via API

```http
GET /api/v1/properties/:id/settings
PUT /api/v1/properties/:id/settings
```

---

## Feature Flags

Feature flags control optional functionality:

```yaml
features:
  # AI Features
  ai.rag: true
  ai.learning: true
  ai.multiLanguage: true

  # Channels
  channel.whatsapp: true
  channel.sms: true
  channel.voice: false  # Coming soon

  # Automation
  automation.proactive: true
  automation.reviews: false

  # Staff Features
  staff.mobileApp: true
  staff.responseAssist: true

  # Analytics
  analytics.advanced: false
```

Access in code:

```typescript
if (featureFlags.isEnabled('ai.rag')) {
  // Use RAG for knowledge retrieval
}
```

---

## Secrets Management

### Development

Use `.env` file (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_PATH=./data/jack.db
```

### Production

Recommended: Use a secrets manager:

- **HashiCorp Vault**
- **AWS Secrets Manager**
- **Google Secret Manager**
- **Azure Key Vault**

Example with Vault:

```yaml
# config/production.yaml
secrets:
  provider: vault
  vault:
    address: https://vault.company.com
    path: secret/data/jack
    authMethod: kubernetes
```

---

## Validation

Configuration is validated on startup:

```bash
# Validate configuration
pnpm config:validate

# Output
✓ Database accessible
✓ AI provider credentials
✓ Channel credentials (if configured)
✓ Required settings present
```

---

## Related

- [Deployment](deployment.md) - Installation guide
- [Architecture](../03-architecture/) - System design
