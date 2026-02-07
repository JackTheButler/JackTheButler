# AI Assistant Framework

> Phase: In Progress
> Status: Phase 1 & 2 Complete
> Priority: High

## Overview

A modular AI assistant framework that guides users through setup, configuration, and ongoing tasks. The assistant bootstraps itself using the Local AI model and can be extended with modules for any guided workflow (integrations, troubleshooting, data import, etc.).

## Goals

1. **Zero-friction onboarding** - New users get a working system without reading docs
2. **Self-bootstrapping** - Works immediately using Local AI, no external API needed
3. **Ongoing assistance** - Not just setup, but continuous help with configuration
4. **Minimal but friendly** - Concise responses, warm tone, no fluff
5. **Extensible** - Modular architecture for adding new guided workflows

## User Experience

### Entry Point

The Setup Assistant appears **before login** on fresh installations.

**Step 0: Bootstrap Message**

First, show that Local AI is being enabled for the setup process:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              JACK THE BUTLER                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │  Setting up Jack...                              │  │
│  │                                                   │  │
│  │  ✓ Enabling Local AI for setup                   │  │
│  │    • Llama 3.2 (conversation)                    │  │
│  │    • MiniLM-L12 (search)                         │  │
│  │                                                   │  │
│  │  This runs entirely on your server.              │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│                    [Continue]                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Step 1: Welcome**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              JACK THE BUTLER                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │  Hi! I'm Jack, your AI assistant.                │  │
│  │                                                   │  │
│  │  I'll help you get set up. What's your           │  │
│  │  hotel or property called?                       │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  [The Grand Hotel_________________________] [Send]      │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Already set up? [Skip to Login]                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Setup Flow

| Step | Assistant Action | User Input |
|------|------------------|------------|
| 0. Bootstrap | Show Local AI enabling (Llama + MiniLM-L12) | Click Continue |
| 1. Welcome | Greet and ask property name + type | Property name, type |
| 2. AI Setup | Strongly recommend Claude/OpenAI, offer help links | API key or "keep local" |
| 3. Knowledge Gathering | Ask for website URL, scrape, ask for more if needed | URLs |
| 4. Gap Filling | Ask for any missing required info | Manual answers |
| 5. Admin Account | Create first staff account | Email, password |
| 6. Channels | Guide through WhatsApp/SMS/Email setup | Credentials |
| 7. Complete | Hand off to dashboard | - |

### AI Setup (Step 2)

The assistant strongly recommends cloud AI for better capabilities:

```
Jack: Now let's set up my brain.

       For the best experience, I recommend using Claude or OpenAI.
       They handle complex guest requests much better.

       [Enter Anthropic Claude Key] (Recommended)
       [Enter OpenAI Key]

       ───────────────────────────────────────

       Or continue with Local AI (currently active).
       It works offline but has limited capabilities.

       [Keep Using Local AI]

       ───────────────────────────────────────

       Need help getting an API key? [Show me how]
```

**If user clicks "Show me how":**

```
Jack: Here's how to get an API key:

       Anthropic Claude (Recommended):
       1. Go to console.anthropic.com
       2. Sign up or log in
       3. Go to API Keys
       4. Create a new key
       → https://console.anthropic.com/settings/keys

       OpenAI:
       1. Go to platform.openai.com
       2. Sign up or log in
       3. Go to API Keys
       4. Create a new key
       → https://platform.openai.com/api-keys

       Both offer free credits to start.

       [Enter Anthropic Key]  [Enter OpenAI Key]  [Keep Local AI]
```

**If user provides API key:**
- Validates the key with a test call
- Shows success/error message
- Uses MiniLM-L12 for embeddings (local, fast)
- Uses cloud AI for completions

**If user chooses Local AI:**
- Already running (Llama 3.2 1B + MiniLM-L12)
- Warn: "Local AI works but may struggle with complex requests"
- Can upgrade later in Settings > Apps

### Knowledge Gathering (Step 3)

The assistant actively collects information until it has enough:

```
Jack: Let's learn about The Grand Hotel.

       What's your website URL?

User: grandhotel.com

Jack: Got it. Let me take a look...

       [Scraping grandhotel.com...]

       Found some good info:
       ✓ Property description
       ✓ Room types (3 found)
       ✓ Location and contact
       ✗ Restaurant/dining info
       ✗ Check-in/check-out times
       ✗ Amenities list

       Do you have a page with restaurant or amenities info?

User: Try grandhotel.com/amenities

Jack: [Scraping...]

       ✓ Amenities list (Pool, Spa, Gym, Restaurant)
       ✓ Restaurant hours

       Still missing check-in/check-out times.
       Any page for that, or should I ask you directly?

User: Check-in is 3pm, checkout 11am

Jack: Got it.

       ✓ Check-in: 3:00 PM
       ✓ Check-out: 11:00 AM

       I now have enough to help your guests. Ready to continue?
```

### Required Information Checklist

The assistant tracks a **minimal target list** and stops asking once complete:

| Category | Required | Nice to Have |
|----------|----------|--------------|
| **Property** | Name, Type (hotel/B&B/etc) | Description |
| **Location** | Address or City | Full address, Map link |
| **Contact** | One contact method | Phone, Email, Website |
| **Timing** | Check-in, Check-out | Early check-in policy |
| **Rooms** | At least 1 room type | All room types, rates |
| **Policies** | - | Cancellation, Pets, Smoking |
| **Amenities** | - | Full list |
| **Dining** | - | Restaurant name, hours |

**Minimum viable**: Property name, type, location, contact, check-in/out times, 1 room type

The assistant aims to get these 6 items. Everything else is bonus.

### Conversation Examples

**Bootstrap + Welcome:**

```
[System]: Setting up Jack...
          ✓ Enabling Local AI for setup
            • Llama 3.2 (conversation)
            • MiniLM-L12 (search)
          This runs entirely on your server.

          [Continue]

Jack: Hi! I'm Jack. What's your hotel or property called?

User: The Grand Hotel

Jack: Got it. Is The Grand Hotel a:
       [Hotel]  [B&B]  [Vacation Rental]  [Other]

User: Hotel
```

**AI Setup - Choosing cloud AI:**

```
Jack: Great. Now let's set up my brain.

       For the best experience, I recommend Claude or OpenAI.

       [Enter Anthropic Key] (Recommended)
       [Enter OpenAI Key]
       [Keep Using Local AI]

       Need help? [Show me how]

User: [Enter Anthropic Key]

Jack: Paste your Anthropic API key:

User: sk-ant-api03-xxxxx

Jack: ✓ Connected to Claude!
       I can now handle complex guest requests.

       What's your website URL?
```

**AI Setup - Needing help:**

```
User: [Show me how]

Jack: Anthropic Claude (Recommended):
       → console.anthropic.com/settings/keys
       1. Sign up → API Keys → Create key

       OpenAI:
       → platform.openai.com/api-keys
       1. Sign up → API Keys → Create key

       Both offer free credits to start.

       [Enter Anthropic Key]  [Enter OpenAI Key]  [Keep Local AI]
```

**AI Setup - Choosing local:**

```
User: [Keep Using Local AI]

Jack: Okay, staying with Local AI.

       Note: Local AI works for basic requests but may
       struggle with complex questions. You can upgrade
       anytime in Settings > Apps.

       What's your website URL?
```

**Iterative scraping:**

```
User: grandhotel.com

Jack: [Scraping...]

       Found:
       ✓ Description
       ✓ 3 room types
       ✓ Address
       ✗ Check-in/out times
       ✗ Amenities

       Have a page with more details? Or I can ask you.

User: grandhotel.com/rooms

Jack: [Scraping...]

       ✓ Check-in: 3pm, Check-out: 11am
       ✓ 5 room types now

       Still need amenities. Another URL or tell me directly?

User: We have pool, spa, gym, restaurant

Jack: ✓ Amenities saved.

       All set. Ready to create your admin account?
```

### Hybrid UI: Chat + Cards

The assistant uses **smart cards** for structured input:

```
Jack: Let's connect WhatsApp.

┌─────────────────────────────────────────┐
│ WhatsApp Business Setup                 │
│                                         │
│ Phone Number ID                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Access Token                            │
│ ┌─────────────────────────────────────┐ │
│ │ ••••••••••••••••••••               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Need help?]         [Skip] [Connect]   │
└─────────────────────────────────────────┘
```

## Ongoing Help

After setup, the assistant remains available:

### Access Points

1. **Help button** in dashboard header
2. **"Ask Jack"** option in settings pages
3. **Error recovery** - appears when something fails

### Capabilities

| Category | Examples |
|----------|----------|
| **Configuration** | "How do I add SMS?" "Change the AI model" |
| **Troubleshooting** | "WhatsApp isn't working" "Messages aren't sending" |
| **Knowledge** | "How do I add restaurant hours?" "Import from PDF" |
| **Operations** | "Show me today's conversations" "Export guest data" |

### Context Awareness

The assistant knows the current state:

```
User: WhatsApp isn't working

Jack: I see WhatsApp is configured but the webhook
       hasn't received any messages yet.

       Have you set the webhook URL in Meta?
       It should be: https://your-domain.com/webhooks/whatsapp

       [Show Setup Guide] [Test Webhook]
```

## Technical Architecture

### Self-Bootstrapping

```
Fresh Install
     │
     ▼
┌─────────────────────┐
│ Detect: No AI set   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Temporary Local AI  │
│ (Llama + MiniLM-L12)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Ask: Property name  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Ask: API key or     │
│ Local AI?           │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│ Cloud   │ │ Local AI│
│ API key │ │         │
└────┬────┘ └────┬────┘
     │           │
     │           │
     │           │
     │           │
     │           │
     │           │
     │           │
     │           │
     │           │
     └────┬──────┘
          │
          ▼
┌─────────────────────┐
│ Knowledge gathering │
│ (scrape + ask)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Continue setup      │
└─────────────────────┘
```

### Implemented Components (Phase 1 & 2)

```
src/
├── services/
│   └── setup.ts               # Setup state management service
├── gateway/
│   └── routes/
│       └── setup.ts           # Setup API endpoints (public, no auth)
│
apps/dashboard/src/
├── pages/
│   └── Setup.tsx              # Main setup page orchestrator
├── hooks/
│   └── useChatFlow.ts         # Reusable chat flow hook
├── components/setup/
│   ├── index.ts               # Exports all setup components
│   ├── BootstrapScreen.tsx    # "Getting Ready" screen with Continue
│   ├── ChatInterface.tsx      # Chat container with messages + input
│   ├── ChatMessage.tsx        # Message bubble with typewriter effect
│   ├── ChoiceButtons.tsx      # Horizontal button choices (property type)
│   ├── ChoiceCards.tsx        # Vertical card choices (AI provider)
│   ├── FormCard.tsx           # Form card for structured input (API key)
│   └── SetupHeader.tsx        # Sticky header with progress + skip
└── locales/en/
    └── setup.json             # English translations
```

### Future Components (Phase 3+)

```
src/
├── core/
│   └── setup-assistant/
│       ├── index.ts           # Main assistant logic (AI-driven)
│       ├── prompts.ts         # System prompts for each step
│       ├── steps/
│       │   ├── scraper.ts     # Website import
│       │   ├── channels.ts    # Channel setup
│       │   └── admin.ts       # Account creation
│       └── tools/
│           ├── configure-channel.ts
│           ├── scrape-website.ts
│           └── create-user.ts
```

### Database

New table to track setup state:

```sql
CREATE TABLE setup_state (
  id TEXT PRIMARY KEY DEFAULT 'setup',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed
  current_step TEXT,
  completed_steps TEXT,  -- JSON array
  context TEXT,          -- JSON conversation context
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### API Endpoints

```
POST /api/v1/setup/start     # Begin setup (no auth required)
POST /api/v1/setup/message   # Send message to assistant
GET  /api/v1/setup/state     # Get current setup state
POST /api/v1/setup/skip      # Skip to manual login
POST /api/v1/setup/reset     # Reset setup (admin only)
```

## Local AI Requirements

The assistant must work with the Local AI model (Llama 3.2 1B):

### Constraints

- **1B parameters** - Limited reasoning capability
- **4096 context** - Must keep prompts concise
- **Slower inference** - 2-5 seconds per response on CPU

### Strategies

1. **Structured prompts** - Clear instructions, limited options
2. **Step isolation** - Each step is independent, small context
3. **Fallback responses** - Pre-written responses for common failures
4. **Tool-based actions** - AI decides what to do, tools execute

### Example Prompt

```
You are Jack, a setup assistant. Be minimal but friendly.

Current step: ai_provider
User has completed: welcome, website_import

Available actions:
- configure_anthropic(api_key): Set up Anthropic Claude
- configure_openai(api_key): Set up OpenAI
- use_local_ai(): Keep using local AI
- explain(topic): Explain something to user

User message: "I have a Claude key"

Respond briefly, then call configure_anthropic if they provide the key,
or ask for it if they haven't.
```

## Website Scraping

### Iterative Knowledge Gathering

The assistant scrapes, evaluates what's missing, and asks for more:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Scrape    │───▶│  Evaluate   │───▶│  Complete?  │  │
│  │    URL      │    │   Checklist │    │             │  │
│  └─────────────┘    └─────────────┘    └──────┬──────┘  │
│        ▲                                      │         │
│        │                              ┌───────┴───────┐ │
│        │                              ▼               ▼ │
│        │                         ┌────────┐    ┌───────┐│
│        └─────────────────────────│Ask for │    │ Done  ││
│           User provides          │more URL│    │       ││
│           another URL            │or ask  │    └───────┘│
│                                  │manually│             │
│                                  └────────┘             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### What We Extract

| Data | Source | Priority |
|------|--------|----------|
| Property name | Title, headers | Required |
| Property type | About page | Required |
| Location | Contact, footer | Required |
| Contact info | Contact page, footer | Required |
| Check-in/out | Policies, FAQ, rooms | Required |
| Room types | Rooms page | Required (at least 1) |
| Description | Meta, about page | Optional |
| Amenities | Features, amenities page | Optional |
| Policies | Terms, FAQ | Optional |
| Dining | Restaurant page | Optional |

### Scraping Strategy

1. **Start with homepage** - Get basic info, find links to key pages
2. **Auto-discover pages** - Look for /rooms, /amenities, /contact, /about
3. **Evaluate against checklist** - What's still missing?
4. **Ask for help** - "Do you have a page for X?" or "What's your X?"
5. **Stop when minimum met** - Don't over-ask

### Example Flow

```
Scrape: grandhotel.com
  └─▶ Found: name, description, contact
  └─▶ Missing: rooms, check-in/out, amenities

Auto-discover: grandhotel.com/rooms
  └─▶ Found: 3 room types, check-in 3pm, check-out 11am
  └─▶ Missing: amenities

Ask user: "Have a page listing amenities?"

User: "grandhotel.com/facilities"

Scrape: grandhotel.com/facilities
  └─▶ Found: Pool, Spa, Gym, Restaurant

Checklist complete ✓ → Proceed to next step
```

### Content Processing

```
Raw HTML
    │
    ▼
┌─────────────────┐
│ Extract text    │
│ (remove nav,    │
│  ads, scripts)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AI extracts     │
│ structured data │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Map to schema:  │
│ - rooms[]       │
│ - amenities[]   │
│ - policies{}    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Save to         │
│ Knowledge Base  │
└─────────────────┘
```

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User abandons mid-setup | Save state, resume on return |
| Invalid API key | AI helps troubleshoot, offers retry |
| Website scrape fails | Graceful fallback to manual entry |
| Local AI gives bad response | Fallback to scripted response |
| No internet | Full local mode, skip cloud options |
| Setup already complete | Show "Skip to Login" prominently |

## Success Metrics

| Metric | Target |
|--------|--------|
| Setup completion rate | >80% |
| Time to first message | <10 minutes |
| Support tickets during setup | <5% of installs |
| Users who configure cloud AI | >60% |
| Users who import from website | >40% |

## Implementation Phases

### Phase 1: Core Setup Flow (English only) ✅ COMPLETE
- [x] Setup state management (database table, API endpoints)
- [x] Setup chat UI (before login screen)
  - [x] Chat message bubbles with typewriter effect
  - [x] Text input field (always visible, disabled when not in text mode)
  - [x] Button options (ChoiceButtons for property type)
  - [x] Card options (ChoiceCards for AI provider selection)
  - [x] Form cards (for structured input like API key)
  - [x] Progress indicator in header
  - [x] "Skip to Login" link
  - [x] Sticky header with backdrop blur
- [x] Bootstrap screen (Local AI enabling message)
- [x] Welcome step (property name + type)
- [x] Detect fresh install vs returning user
- [x] Resume from correct step on page refresh ("Welcome back!" message)
- [x] All strings in English (i18n structure in `locales/en/setup.json`)
- [x] Reusable `useChatFlow` hook for chat flow management

### Phase 2: AI Provider Setup ✅ COMPLETE
- [x] AI choice screen (Anthropic Claude recommended, OpenAI, Local AI)
- [x] "How do I get a key?" help with step-by-step instructions
- [x] API key input with password field + visibility toggle
- [x] API key validation via backend
- [x] Success/error feedback in chat
- [x] Skip to Local AI option from API key form
- [x] Masked API key display in chat (sk-ant-...xxxx)

**Note:** Local AI auto-start and seamless provider switching are handled by the existing app config system. The setup wizard configures the provider via `/api/v1/setup/ai-provider` which saves to the database.

### Phase 3: Knowledge Gathering
- [ ] URL input and validation
- [ ] Single page scraping
- [ ] AI extraction to structured data
- [ ] Checklist evaluation (what's missing?)
- [ ] Ask for more URLs or manual input
- [ ] Auto-discover linked pages (/rooms, /amenities, etc.)
- [ ] Knowledge base population
- [ ] Stop when minimum requirements met

### Phase 4: Account & Channels
- [ ] Admin account creation
- [ ] WhatsApp guided setup
- [ ] SMS (Twilio) guided setup
- [ ] Email setup
- [ ] Webhook URL display

### Phase 5: Ongoing Help
- [ ] Help button in dashboard
- [ ] Context-aware assistance
- [ ] Error recovery suggestions
- [ ] "Ask Jack" in settings pages

### Phase 6: Multi-language Support
- [ ] i18n framework for assistant strings
- [ ] Language detection from browser
- [ ] Language selection in setup
- [ ] Translate all assistant messages
- [ ] AI responses in user's language
- [ ] RTL support (Arabic, Hebrew)

## Extensibility

The assistant is built as a **modular framework** that can handle any guided workflow, not just initial setup.

### Module Architecture

Each feature is a self-contained module:

```
src/core/assistant/
├── index.ts              # Core assistant engine
├── modules/
│   ├── base.ts           # Base module interface
│   ├── setup/            # Initial setup module
│   │   ├── index.ts
│   │   ├── steps.ts
│   │   └── forms.ts
│   ├── integrations/     # Integration setup modules
│   │   ├── whatsapp.ts
│   │   ├── twilio.ts
│   │   ├── email.ts
│   │   ├── mews-pms.ts
│   │   ├── cloudbeds.ts
│   │   └── stripe.ts
│   ├── knowledge/        # Knowledge management
│   │   ├── import-url.ts
│   │   ├── import-pdf.ts
│   │   └── bulk-edit.ts
│   └── troubleshoot/     # Troubleshooting modules
│       ├── webhook-debug.ts
│       └── message-logs.ts
└── forms/
    └── registry.ts       # Form schema registry
```

### Module Interface

Every module implements this interface:

```typescript
interface AssistantModule {
  id: string;
  name: string;
  description: string;

  // When should this module activate?
  triggers: {
    keywords?: string[];      // "setup whatsapp", "connect twilio"
    contexts?: string[];      // "settings.channels", "integration.pms"
    conditions?: () => boolean; // e.g., () => !hasConfiguredAI()
  };

  // What data does this module collect?
  schema: FormSchema;

  // Module lifecycle
  onStart: (context: AssistantContext) => Promise<void>;
  onMessage: (message: string, context: AssistantContext) => Promise<Response>;
  onFormSubmit: (data: Record<string, any>) => Promise<Result>;
  onComplete: (context: AssistantContext) => Promise<void>;
}
```

### Form Schema System

Forms are defined declaratively and rendered as chat cards:

```typescript
const whatsappForm: FormSchema = {
  id: 'whatsapp-setup',
  title: 'WhatsApp Business Setup',
  fields: [
    {
      key: 'phoneNumberId',
      type: 'text',
      label: 'Phone Number ID',
      required: true,
      help: 'Found in Meta Business Suite under WhatsApp > API Setup',
      validation: { pattern: /^\d+$/, message: 'Must be numeric' }
    },
    {
      key: 'accessToken',
      type: 'password',
      label: 'Access Token',
      required: true,
      help: 'Temporary or permanent token from Meta'
    },
    {
      key: 'verifyToken',
      type: 'text',
      label: 'Webhook Verify Token',
      required: true,
      default: () => generateRandomToken(),
      help: 'Used to verify webhook requests'
    }
  ],
  onHelp: async (field, context) => {
    // AI explains how to get this specific field
    return await context.ai.explain(`How to get ${field.label} for WhatsApp`);
  }
};
```

### Adding New Integrations

To add a new integration (e.g., Stripe for payments):

```typescript
// src/core/assistant/modules/integrations/stripe.ts

export const stripeModule: AssistantModule = {
  id: 'stripe-setup',
  name: 'Stripe Payments',
  description: 'Accept payments from guests',

  triggers: {
    keywords: ['stripe', 'payments', 'billing', 'accept payments'],
    contexts: ['settings.integrations', 'dashboard.payments']
  },

  schema: {
    id: 'stripe-setup',
    title: 'Connect Stripe',
    fields: [
      { key: 'publishableKey', type: 'text', label: 'Publishable Key', required: true },
      { key: 'secretKey', type: 'password', label: 'Secret Key', required: true },
      { key: 'webhookSecret', type: 'password', label: 'Webhook Secret', required: true }
    ]
  },

  async onStart(context) {
    await context.send("Let's connect Stripe for guest payments.");
    await context.showForm(this.schema);
  },

  async onMessage(message, context) {
    // Handle questions like "where do I find my API key?"
    if (message.includes('where') || message.includes('how')) {
      return context.ai.helpWith(this.schema, message);
    }
  },

  async onFormSubmit(data) {
    // Validate keys work
    const valid = await validateStripeKeys(data);
    if (!valid) return { success: false, error: 'Invalid API keys' };

    // Save configuration
    await saveAppConfig('stripe', data);
    return { success: true };
  },

  async onComplete(context) {
    await context.send("Stripe connected! Guests can now pay online.");
  }
};
```

### Module Registration

Modules are auto-discovered or manually registered:

```typescript
// src/core/assistant/modules/index.ts

import { setupModule } from './setup';
import { whatsappModule } from './integrations/whatsapp';
import { twilioModule } from './integrations/twilio';
import { stripeModule } from './integrations/stripe';
import { mewsModule } from './integrations/mews-pms';
// ... more modules

export const modules: AssistantModule[] = [
  setupModule,
  whatsappModule,
  twilioModule,
  stripeModule,
  mewsModule,
  // Auto-register from directory:
  ...discoverModules('./modules/integrations'),
  ...discoverModules('./modules/knowledge'),
];
```

### Context-Aware Activation

The assistant knows when to suggest modules:

```typescript
// User is on WhatsApp settings page but it's not configured
if (context.page === 'settings.channels.whatsapp' && !isConfigured('whatsapp')) {
  assistant.suggest(whatsappModule);
  // "I can help you set up WhatsApp. Want me to guide you?"
}

// User mentions something related
if (userMessage.includes('accept payments')) {
  assistant.activate(stripeModule);
}

// Error occurred
if (error.code === 'WHATSAPP_WEBHOOK_FAILED') {
  assistant.activate(webhookDebugModule, { error });
}
```

### Future Module Ideas

| Module | Trigger | Purpose |
|--------|---------|---------|
| **PMS Integrations** | "connect mews", "sync reservations" | Setup Mews, Cloudbeds, Opera |
| **Payment Gateways** | "accept payments", "stripe" | Setup Stripe, PayPal |
| **Automation Builder** | "create automation", "when guest..." | Build automation rules |
| **Bulk Import** | "import guests", "upload CSV" | Import data from files |
| **Report Generator** | "show me stats", "monthly report" | Generate reports |
| **Staff Onboarding** | "add staff", "new employee" | Create staff accounts |
| **Troubleshooter** | "not working", "error", "help" | Diagnose issues |

### Benefits

1. **Consistent UX** - All integrations use same chat + form pattern
2. **AI-assisted** - Help available for every field
3. **Validation** - Built-in validation before saving
4. **Extensible** - New modules without core changes
5. **Context-aware** - Right help at the right time

## Open Questions

1. **Persistence**: Should setup conversations be saved for support debugging?
2. **Templates**: Offer property type templates (hotel, B&B, vacation rental)?
3. **Demo mode**: Let users try without creating account?
4. **Marketplace**: Allow third-party assistant modules?

---

## Related Documents

- [Local AI Provider](../03-architecture/index.md)
- [Knowledge Base](../02-use-cases/staff/knowledge-base.md)
- [Channel Configuration](../05-operations/local-development.md)
