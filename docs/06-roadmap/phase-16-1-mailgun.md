# Phase 16.1: Mailgun Provider

**Focus:** Create Mailgun email provider extension
**Risk:** Low
**Depends on:** Phase 15 (complete)
**Status:** ✓ Complete (2026-02-01)

---

## Goal

Create Mailgun email provider as the primary recommended option for self-hosted deployments.

---

## Why Mailgun First

- API key based - no OAuth complexity
- Works from any server (no redirect URI needed)
- Webhooks for inbound email
- Great deliverability
- Industry standard for transactional email

---

## Tasks

### 1. Create Mailgun Provider

- [ ] Create `src/extensions/channels/email/mailgun.ts`
- [ ] Implement `MailgunProvider` class with `BaseProvider` interface
- [ ] Add `testConnection()` method
- [ ] Add `sendEmail()` method using Mailgun API
- [ ] Create manifest with config schema

### 2. Create Webhook Handler

- [ ] Create `src/gateway/routes/webhooks/email-mailgun.ts`
- [ ] Handle inbound email webhooks
- [ ] Verify webhook signatures

### 3. Register Extension

- [ ] Update `src/extensions/channels/email/index.ts` to export Mailgun
- [ ] Update `src/extensions/channels/index.ts` to include Mailgun manifest

### 4. Add Dependencies

- [ ] Add `mailgun.js` package

---

## Files to Create

```
src/extensions/channels/email/
├── mailgun.ts              # NEW - Mailgun provider
└── index.ts                # UPDATE - export Mailgun

src/gateway/routes/webhooks/
└── email-mailgun.ts        # NEW - Inbound webhook
```

---

## Config Schema

```typescript
configSchema: [
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Mailgun API key',
    placeholder: 'key-xxxxxxxxxxxxxxxx',
  },
  {
    key: 'domain',
    label: 'Domain',
    type: 'text',
    required: true,
    description: 'Mailgun sending domain',
    placeholder: 'mail.grandhotel.com',
  },
  {
    key: 'fromAddress',
    label: 'From Address',
    type: 'text',
    required: true,
    description: 'Email address to send from',
    placeholder: 'concierge@grandhotel.com',
  },
  {
    key: 'fromName',
    label: 'From Name',
    type: 'text',
    required: false,
    description: 'Display name for outgoing emails',
    default: 'Hotel Concierge',
  },
  {
    key: 'webhookSigningKey',
    label: 'Webhook Signing Key',
    type: 'password',
    required: false,
    description: 'Key for verifying inbound webhooks',
  },
],
```

---

## Verification

```bash
# TypeScript compiles
pnpm typecheck

# Tests pass
pnpm test

# Extension loads
# Check logs for "Registered extension: email-mailgun"
pnpm dev
```

---

## Acceptance Criteria

- [ ] `MailgunProvider` class created
- [ ] `testConnection()` verifies API key
- [ ] `sendEmail()` sends via Mailgun API
- [ ] Manifest registered with config schema
- [ ] TypeScript compiles
- [ ] Tests pass
