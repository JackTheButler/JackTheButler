# Phase 8b: Admin Console

**Version:** 0.9.5
**Codename:** Admin Console
**Goal:** Integration management UI and automation management UI

---

## Overview

Phase 8b adds administrative interfaces for managing integrations and automations. This phase also restructures the codebase to cleanly separate domain logic from external service integrations.

After this phase:

1. Codebase restructured with clean integration layer
2. Staff can manage integrations from dashboard
3. Staff can manage automation rules from dashboard
4. All external connections visible and configurable

---

## Prerequisites

- Phase 8 complete (all channels and automation engine working)
- Dashboard operational

---

## Part 1: Integration Layer Restructuring

### Current State

```
src/
├── ai/
│   ├── providers/           # ❌ Mixed: API calls + logic
│   │   ├── claude.ts
│   │   ├── openai.ts
│   │   └── ollama.ts
│   ├── intent/
│   └── knowledge/
│
├── channels/
│   ├── whatsapp/            # ❌ Mixed: Meta API + channel logic
│   ├── sms/                 # ❌ Mixed: Twilio API + channel logic
│   ├── email/               # ❌ Mixed: SMTP/IMAP + channel logic
│   └── webchat/
│
└── integrations/
    └── pms/
        └── providers/       # ✓ Already separated
```

### Target State

```
src/
├── ai/                              # Domain logic only (provider-agnostic)
│   ├── types.ts                     # AIProvider interface
│   ├── intent/                      # Intent classification logic
│   ├── knowledge/                   # RAG, embeddings logic
│   ├── escalation.ts                # Escalation rules
│   └── responder.ts                 # Response generation
│
├── channels/                        # Channel logic only (provider-agnostic)
│   ├── types.ts                     # ChannelAdapter interface
│   ├── processor.ts                 # Message processing pipeline
│   └── webchat/                     # Built-in, no external provider
│       └── index.ts
│
├── integrations/                    # All external service connections
│   ├── types.ts                     # Integration, Provider interfaces
│   ├── registry.ts                  # Integration registry
│   ├── status.ts                    # Connection status tracking
│   │
│   ├── ai/                          # AI provider integrations
│   │   ├── index.ts                 # AI provider factory
│   │   └── providers/
│   │       ├── anthropic.ts         # Claude API
│   │       ├── openai.ts            # OpenAI API
│   │       └── ollama.ts            # Ollama API
│   │
│   ├── channels/                    # Channel provider integrations
│   │   ├── index.ts                 # Channel provider factory
│   │   ├── whatsapp/
│   │   │   └── meta.ts              # Meta Business API
│   │   ├── sms/
│   │   │   ├── index.ts             # SMS provider factory
│   │   │   ├── twilio.ts            # Twilio API
│   │   │   └── vonage.ts            # Vonage API (future)
│   │   └── email/
│   │       ├── index.ts             # Email provider factory
│   │       ├── smtp.ts              # Direct SMTP/IMAP
│   │       ├── mailgun.ts           # Mailgun API (future)
│   │       └── sendgrid.ts          # SendGrid API (future)
│   │
│   └── pms/                         # PMS integrations (already structured)
│       ├── index.ts
│       └── providers/
│           ├── mock.ts
│           ├── mews.ts
│           └── opera.ts
```

### Core Interfaces

```typescript
// src/integrations/types.ts

/**
 * Integration categories
 */
export type IntegrationCategory = 'ai' | 'channels' | 'pms' | 'operations';

/**
 * Integration status
 */
export type IntegrationStatus =
  | 'not_configured'  // No credentials
  | 'configured'      // Has credentials, not tested
  | 'connected'       // Tested and working
  | 'error'           // Connection failed
  | 'disabled';       // Manually disabled

/**
 * Base integration definition
 */
export interface IntegrationDefinition {
  id: string;                        // e.g., 'sms', 'email', 'pms'
  name: string;                      // e.g., 'SMS Messaging'
  category: IntegrationCategory;
  description: string;
  icon?: string;
  providers: ProviderDefinition[];
  multiProvider?: boolean;           // Can have multiple active providers
}

/**
 * Provider definition
 */
export interface ProviderDefinition {
  id: string;                        // e.g., 'twilio', 'mailgun'
  name: string;                      // e.g., 'Twilio'
  description: string;
  configSchema: ConfigField[];       // Fields needed for configuration
  docsUrl?: string;
}

/**
 * Configuration field definition
 */
export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'boolean';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];  // For select type
}

/**
 * Provider instance (configured)
 */
export interface ProviderInstance {
  integrationId: string;
  providerId: string;
  enabled: boolean;
  status: IntegrationStatus;
  config: Record<string, string>;    // Encrypted credentials
  lastChecked?: string;
  lastError?: string;
}
```

### Integration Registry

```typescript
// src/integrations/registry.ts

export const integrationRegistry: IntegrationDefinition[] = [
  // AI Providers
  {
    id: 'ai',
    name: 'AI Provider',
    category: 'ai',
    description: 'AI model for responses and intent classification',
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        description: 'Claude models via Anthropic API',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'model', label: 'Model', type: 'select', required: false,
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
            ]
          },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT models via OpenAI API',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'model', label: 'Model', type: 'text', required: false },
        ],
      },
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        description: 'Local models via Ollama',
        configSchema: [
          { key: 'baseUrl', label: 'Base URL', type: 'text', required: true,
            placeholder: 'http://localhost:11434' },
          { key: 'model', label: 'Model', type: 'text', required: true },
        ],
      },
    ],
  },

  // Communication Channels
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'channels',
    description: 'WhatsApp Business messaging',
    providers: [
      {
        id: 'meta',
        name: 'Meta Business API',
        description: 'Official WhatsApp Business API via Meta',
        configSchema: [
          { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
          { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true },
          { key: 'verifyToken', label: 'Webhook Verify Token', type: 'text', required: true },
          { key: 'appSecret', label: 'App Secret', type: 'password', required: false },
        ],
        docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
      },
    ],
  },
  {
    id: 'sms',
    name: 'SMS',
    category: 'channels',
    description: 'SMS text messaging',
    providers: [
      {
        id: 'twilio',
        name: 'Twilio',
        description: 'SMS via Twilio',
        configSchema: [
          { key: 'accountSid', label: 'Account SID', type: 'text', required: true },
          { key: 'authToken', label: 'Auth Token', type: 'password', required: true },
          { key: 'phoneNumber', label: 'Phone Number', type: 'text', required: true,
            placeholder: '+1234567890' },
        ],
        docsUrl: 'https://www.twilio.com/docs/sms',
      },
      {
        id: 'vonage',
        name: 'Vonage',
        description: 'SMS via Vonage (Nexmo)',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'text', required: true },
          { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
          { key: 'fromNumber', label: 'From Number', type: 'text', required: true },
        ],
        docsUrl: 'https://developer.vonage.com/messaging/sms/overview',
      },
    ],
  },
  {
    id: 'email',
    name: 'Email',
    category: 'channels',
    description: 'Email messaging',
    multiProvider: true,  // Can have SMTP for sending, IMAP for receiving
    providers: [
      {
        id: 'smtp',
        name: 'SMTP (Direct)',
        description: 'Direct SMTP/IMAP connection',
        configSchema: [
          { key: 'smtpHost', label: 'SMTP Host', type: 'text', required: true },
          { key: 'smtpPort', label: 'SMTP Port', type: 'text', required: true },
          { key: 'smtpUser', label: 'SMTP Username', type: 'text', required: true },
          { key: 'smtpPass', label: 'SMTP Password', type: 'password', required: true },
          { key: 'imapHost', label: 'IMAP Host', type: 'text', required: false },
          { key: 'imapPort', label: 'IMAP Port', type: 'text', required: false },
          { key: 'imapUser', label: 'IMAP Username', type: 'text', required: false },
          { key: 'imapPass', label: 'IMAP Password', type: 'password', required: false },
          { key: 'fromAddress', label: 'From Address', type: 'text', required: true },
          { key: 'fromName', label: 'From Name', type: 'text', required: false },
        ],
      },
      {
        id: 'mailgun',
        name: 'Mailgun',
        description: 'Email via Mailgun API',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'domain', label: 'Domain', type: 'text', required: true },
          { key: 'fromAddress', label: 'From Address', type: 'text', required: true },
        ],
        docsUrl: 'https://documentation.mailgun.com/',
      },
      {
        id: 'sendgrid',
        name: 'SendGrid',
        description: 'Email via SendGrid API',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'fromAddress', label: 'From Address', type: 'text', required: true },
          { key: 'fromName', label: 'From Name', type: 'text', required: false },
        ],
        docsUrl: 'https://docs.sendgrid.com/',
      },
    ],
  },
  {
    id: 'webchat',
    name: 'Web Chat',
    category: 'channels',
    description: 'Built-in web chat widget',
    providers: [
      {
        id: 'builtin',
        name: 'Built-in Widget',
        description: 'Jack\'s built-in chat widget',
        configSchema: [
          { key: 'enabled', label: 'Enabled', type: 'boolean', required: true },
          { key: 'primaryColor', label: 'Primary Color', type: 'text', required: false,
            placeholder: '#3B82F6' },
          { key: 'position', label: 'Position', type: 'select', required: false,
            options: [
              { value: 'bottom-right', label: 'Bottom Right' },
              { value: 'bottom-left', label: 'Bottom Left' },
            ]
          },
        ],
      },
    ],
  },

  // Hotel Systems
  {
    id: 'pms',
    name: 'Property Management System',
    category: 'pms',
    description: 'Hotel PMS for guest and reservation data',
    providers: [
      {
        id: 'mock',
        name: 'Mock (Development)',
        description: 'Simulated PMS for development',
        configSchema: [],
      },
      {
        id: 'mews',
        name: 'Mews',
        description: 'Mews PMS integration',
        configSchema: [
          { key: 'apiUrl', label: 'API URL', type: 'text', required: true },
          { key: 'clientToken', label: 'Client Token', type: 'password', required: true },
          { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
        ],
        docsUrl: 'https://mews-systems.gitbook.io/connector-api/',
      },
      {
        id: 'opera',
        name: 'Oracle Opera Cloud',
        description: 'Opera Cloud PMS integration',
        configSchema: [
          { key: 'apiUrl', label: 'API URL', type: 'text', required: true },
          { key: 'clientId', label: 'Client ID', type: 'text', required: true },
          { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
          { key: 'hotelId', label: 'Hotel ID', type: 'text', required: true },
        ],
        docsUrl: 'https://docs.oracle.com/en/industries/hospitality/',
      },
      {
        id: 'cloudbeds',
        name: 'Cloudbeds',
        description: 'Cloudbeds PMS integration',
        configSchema: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'propertyId', label: 'Property ID', type: 'text', required: true },
        ],
        docsUrl: 'https://hotels.cloudbeds.com/api/docs/',
      },
    ],
  },
];
```

### Database Schema Addition

```sql
-- Integration configuration storage
CREATE TABLE IF NOT EXISTS integration_configs (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,          -- e.g., 'sms', 'email'
  provider_id TEXT NOT NULL,             -- e.g., 'twilio', 'mailgun'
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',     -- Encrypted JSON
  status TEXT NOT NULL DEFAULT 'not_configured',
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(integration_id, provider_id)
);

CREATE INDEX idx_integration_configs_integration ON integration_configs(integration_id);
CREATE INDEX idx_integration_configs_status ON integration_configs(status);

-- Integration event log
CREATE TABLE IF NOT EXISTS integration_logs (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  event_type TEXT NOT NULL,              -- 'connection_test', 'sync', 'webhook', 'error'
  status TEXT NOT NULL,                  -- 'success', 'failed'
  details TEXT,                          -- JSON with event details
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_integration_logs_integration ON integration_logs(integration_id, provider_id);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at);
```

### Migration Strategy

The restructuring should be done in steps to avoid breaking changes:

1. **Create new structure** - Add `src/integrations/` with new files
2. **Add adapter layer** - New files call old implementations
3. **Migrate logic** - Move provider-specific code to new location
4. **Update imports** - Change imports across codebase
5. **Remove old files** - Delete deprecated locations
6. **Test thoroughly** - Ensure all integrations still work

---

## Part 2: Integration Management UI

### API Endpoints

```typescript
// GET /api/v1/integrations
// List all available integrations with their status
{
  "integrations": [
    {
      "id": "sms",
      "name": "SMS",
      "category": "channels",
      "description": "SMS text messaging",
      "providers": [
        {
          "id": "twilio",
          "name": "Twilio",
          "status": "connected",
          "enabled": true,
          "lastChecked": "2026-01-28T12:00:00Z"
        },
        {
          "id": "vonage",
          "name": "Vonage",
          "status": "not_configured",
          "enabled": false
        }
      ]
    }
  ]
}

// GET /api/v1/integrations/:integrationId
// Get detailed integration info with config schema

// GET /api/v1/integrations/:integrationId/providers/:providerId
// Get provider config (credentials masked)

// PUT /api/v1/integrations/:integrationId/providers/:providerId
// Update provider config
{
  "enabled": true,
  "config": {
    "accountSid": "AC...",
    "authToken": "***",
    "phoneNumber": "+1234567890"
  }
}

// POST /api/v1/integrations/:integrationId/providers/:providerId/test
// Test provider connection
{
  "success": true,
  "message": "Connection successful",
  "details": {
    "accountName": "My Hotel",
    "phoneNumber": "+1234567890"
  }
}

// GET /api/v1/integrations/:integrationId/logs
// Get integration logs
{
  "logs": [
    {
      "id": "log_123",
      "eventType": "webhook",
      "status": "success",
      "details": { "messageId": "msg_456" },
      "createdAt": "2026-01-28T12:00:00Z"
    }
  ]
}
```

### Dashboard Pages

#### Integrations List Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Integrations                                                    [+ Add New] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌─ AI Provider ──────────────────────────────────────────────────────────┐  │
│ │ 🤖 Anthropic Claude                              ● Connected    [Edit] │  │
│ │    Model: claude-sonnet-4-20250514                                     │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Communication Channels ───────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ 💬 WhatsApp (Meta)                               ● Connected    [Edit] │  │
│ │    Phone: +1 (555) 123-4567                                            │  │
│ │                                                                        │  │
│ │ 📱 SMS (Twilio)                                  ● Connected    [Edit] │  │
│ │    Phone: +1 (555) 987-6543                                            │  │
│ │                                                                        │  │
│ │ 📧 Email (SMTP)                                  ○ Error        [Edit] │  │
│ │    Last error: Connection timeout                                      │  │
│ │                                                                        │  │
│ │ 💻 Web Chat                                      ● Enabled      [Edit] │  │
│ │    Built-in widget                                                     │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Hotel Systems ────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ 🏨 PMS (Mews)                                    ● Connected    [Edit] │  │
│ │    Last sync: 5 minutes ago | 234 reservations                         │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Integration Edit Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Integrations                                                      │
│                                                                             │
│ SMS Integration                                                             │
│ ═══════════════                                                             │
│                                                                             │
│ Provider: [Twilio     ▼]                                                    │
│                                                                             │
│ ┌─ Configuration ────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ Account SID      [ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  ]               │  │
│ │                                                                        │  │
│ │ Auth Token       [••••••••••••••••••••••••••••••••••••]  [Show]       │  │
│ │                                                                        │  │
│ │ Phone Number     [+15551234567                        ]               │  │
│ │                  The Twilio phone number to send from                  │  │
│ │                                                                        │  │
│ │ Webhook URL      https://your-domain.com/webhooks/sms    [Copy]       │  │
│ │                  Configure this URL in your Twilio console             │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Status ───────────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ Status:       ● Connected                                              │  │
│ │ Last checked: 2 minutes ago                                            │  │
│ │ Messages:     1,234 sent / 567 received (last 30 days)                 │  │
│ │                                                                        │  │
│ │ [Test Connection]                                                      │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Recent Activity ──────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ 12:05 PM  Webhook received    msg_abc123    ✓ Success                 │  │
│ │ 12:04 PM  Message sent        msg_xyz789    ✓ Delivered               │  │
│ │ 12:01 PM  Webhook received    msg_def456    ✓ Success                 │  │
│ │ 11:58 AM  Message sent        msg_ghi012    ✓ Delivered               │  │
│ │                                                                        │  │
│ │ [View All Logs]                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                               [Disable]  [Save Changes]                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Automation Management UI

### API Endpoints

```typescript
// GET /api/v1/automation/rules
// List all automation rules
{
  "rules": [
    {
      "id": "rule_abc123",
      "name": "Pre-arrival Welcome",
      "description": "Sends welcome message 3 days before arrival",
      "triggerType": "time_based",
      "actionType": "send_message",
      "enabled": true,
      "lastRunAt": "2026-01-28T10:00:00Z",
      "runCount": 156,
      "lastError": null
    }
  ]
}

// GET /api/v1/automation/rules/:ruleId
// Get rule details with full config

// POST /api/v1/automation/rules
// Create new rule

// PUT /api/v1/automation/rules/:ruleId
// Update rule

// DELETE /api/v1/automation/rules/:ruleId
// Delete rule

// POST /api/v1/automation/rules/:ruleId/toggle
// Enable/disable rule
{ "enabled": true }

// POST /api/v1/automation/rules/:ruleId/test
// Test rule (dry run)
{
  "wouldTrigger": true,
  "matchingRecords": 5,
  "preview": {
    "reservationId": "res_123",
    "guestName": "John Doe",
    "message": "Hello John! We're looking forward..."
  }
}

// GET /api/v1/automation/logs
// Get execution logs
{
  "logs": [
    {
      "id": "alog_123",
      "ruleId": "rule_abc",
      "ruleName": "Pre-arrival Welcome",
      "status": "success",
      "triggerData": { "reservationId": "res_456" },
      "executionTimeMs": 234,
      "createdAt": "2026-01-28T10:00:00Z"
    }
  ]
}

// GET /api/v1/automation/templates
// Get rule templates for quick creation
{
  "templates": [
    {
      "id": "pre_arrival",
      "name": "Pre-arrival Welcome",
      "description": "Send welcome message before guest arrives",
      "triggerType": "time_based",
      "triggerConfig": { "type": "before_arrival", "offsetDays": -3, "time": "10:00" },
      "actionType": "send_message",
      "actionConfig": { "template": "pre_arrival_welcome", "channel": "preferred" }
    }
  ]
}
```

### Dashboard Pages

#### Automation Rules List

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Automation Rules                                               [+ New Rule] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ [All] [Active] [Disabled] [Failed]                    🔍 Search rules...    │
│                                                                             │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ ☑ Pre-arrival Welcome                                                  │  │
│ │   ━━━━━━━━━━━━━━━━━━━                                                  │  │
│ │   📅 3 days before arrival at 10:00 AM                                 │  │
│ │   📤 Send message via preferred channel                                │  │
│ │                                                                        │  │
│ │   Last run: Today at 10:00 AM (5 guests)                   [Edit] [⋮] │  │
│ │   ✓ 156 total runs, 0 failures                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ ☑ Checkout Reminder                                                    │  │
│ │   ━━━━━━━━━━━━━━━━━━                                                   │  │
│ │   📅 Day of departure at 8:00 AM                                       │  │
│ │   📤 Send message via preferred channel                                │  │
│ │                                                                        │  │
│ │   Last run: Today at 8:00 AM (3 guests)                    [Edit] [⋮] │  │
│ │   ✓ 89 total runs, 0 failures                                         │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ ☐ Post-stay Thank You                                      DISABLED    │  │
│ │   ━━━━━━━━━━━━━━━━━━━━                                                 │  │
│ │   📅 1 day after checkout at 2:00 PM                                   │  │
│ │   📤 Send email                                                        │  │
│ │                                                                        │  │
│ │   Never run                                                [Edit] [⋮] │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Execution Logs                                              [View All →]    │
│                                                                             │
│ 10:00 AM  Pre-arrival Welcome      5 guests    ✓ Success    234ms          │
│ 08:00 AM  Checkout Reminder        3 guests    ✓ Success    189ms          │
│ Yesterday Pre-arrival Welcome      4 guests    ✓ Success    256ms          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Rule Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Automation                                                        │
│                                                                             │
│ Edit Rule: Pre-arrival Welcome                                              │
│ ══════════════════════════════                                              │
│                                                                             │
│ ┌─ Basic Info ───────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ Name         [Pre-arrival Welcome                     ]               │  │
│ │                                                                        │  │
│ │ Description  [Sends welcome message 3 days before arrival]            │  │
│ │                                                                        │  │
│ │ Enabled      [✓]                                                       │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Trigger ──────────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ Type         (●) Time-based    ( ) Event-based                        │  │
│ │                                                                        │  │
│ │ ┌─ Time-based Settings ─────────────────────────────────────────────┐ │  │
│ │ │                                                                   │ │  │
│ │ │ Relative to  [Before arrival  ▼]                                  │ │  │
│ │ │                                                                   │ │  │
│ │ │ Days         [3] days before                                      │ │  │
│ │ │                                                                   │ │  │
│ │ │ Time         [10:00 AM       ▼]                                   │ │  │
│ │ │                                                                   │ │  │
│ │ └───────────────────────────────────────────────────────────────────┘ │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Action ───────────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ Type         [Send Message     ▼]                                     │  │
│ │                                                                        │  │
│ │ ┌─ Message Settings ────────────────────────────────────────────────┐ │  │
│ │ │                                                                   │ │  │
│ │ │ Template    [Pre-arrival Welcome  ▼]                              │ │  │
│ │ │                                                                   │ │  │
│ │ │ Channel     [Guest's preferred channel  ▼]                        │ │  │
│ │ │                                                                   │ │  │
│ │ │ Preview:                                                          │ │  │
│ │ │ ┌─────────────────────────────────────────────────────────────┐  │ │  │
│ │ │ │ Hello {{firstName}}!                                        │  │ │  │
│ │ │ │                                                             │  │ │  │
│ │ │ │ We're looking forward to welcoming you on {{arrivalDate}}. │  │ │  │
│ │ │ │ ...                                                         │  │ │  │
│ │ │ └─────────────────────────────────────────────────────────────┘  │ │  │
│ │ │                                                                   │ │  │
│ │ └───────────────────────────────────────────────────────────────────┘ │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ Test ─────────────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │ [Test Rule]                                                            │  │
│ │                                                                        │  │
│ │ Would trigger for 5 reservations:                                      │  │
│ │ • John Doe (arriving Jan 31)                                           │  │
│ │ • Jane Smith (arriving Jan 31)                                         │  │
│ │ • ...                                                                  │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                               [Delete Rule]  [Cancel]  [Save Changes]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Deliverables

### 0.9.5-alpha.1: Integration Layer Restructuring

**Tasks:**
- [ ] Create `src/integrations/types.ts` with core interfaces
- [ ] Create `src/integrations/registry.ts` with integration definitions
- [ ] Migrate AI providers to `src/integrations/ai/providers/`
- [ ] Migrate channel providers to `src/integrations/channels/`
- [ ] Update imports across codebase
- [ ] Add database tables for integration config
- [ ] Ensure all tests pass

### 0.9.5-alpha.2: Integration Management API

**Tasks:**
- [ ] Create `/api/v1/integrations` endpoints
- [ ] Implement secure credential storage (encrypted)
- [ ] Implement connection testing
- [ ] Implement integration logging
- [ ] Add API tests

### 0.9.5-alpha.3: Integration Management UI

**Tasks:**
- [ ] Create Integrations list page
- [ ] Create Integration edit/config page
- [ ] Add provider selection
- [ ] Add connection test UI
- [ ] Add activity logs view

### 0.9.5-alpha.4: Automation Management API

**Tasks:**
- [ ] Create `/api/v1/automation` endpoints
- [ ] Add rule templates endpoint
- [ ] Add dry-run/test endpoint
- [ ] Add execution logs endpoint
- [ ] Add API tests

### 0.9.5-alpha.5: Automation Management UI

**Tasks:**
- [ ] Create Automation rules list page
- [ ] Create Rule editor page
- [ ] Add trigger configuration UI
- [ ] Add action configuration UI
- [ ] Add execution logs view
- [ ] Add rule templates

---

## Testing Checkpoint

### Integration Management Tests

- [ ] Can list all integrations
- [ ] Can configure a provider
- [ ] Credentials are encrypted at rest
- [ ] Connection test works for each provider
- [ ] Integration logs are captured

### Automation Management Tests

- [ ] Can list all rules
- [ ] Can create new rule
- [ ] Can edit existing rule
- [ ] Can enable/disable rule
- [ ] Can test rule (dry run)
- [ ] Execution logs are visible

### Regression Tests

- [ ] All existing channel integrations still work
- [ ] All existing automation rules still execute
- [ ] No breaking changes to existing APIs

---

## Exit Criteria

Phase 8b is complete when:

1. **Integration layer restructured** - Clean separation of concerns
2. **Integration UI working** - Staff can configure all integrations
3. **Automation UI working** - Staff can manage automation rules
4. **All tests passing** - Including new API and UI tests

---

## Related

- [Phase 8: Polish](phase-8-polish.md) - Prerequisite
- [Phase 9: Launch](phase-9-launch.md) - Next phase
- [Integration Specifications](../04-specs/integrations/index.md)
- [Automation Use Cases](../02-use-cases/operations/automation.md)
