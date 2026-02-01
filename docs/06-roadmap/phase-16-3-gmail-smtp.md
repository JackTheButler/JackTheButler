# Phase 16.3: Gmail SMTP Provider

**Focus:** Create Gmail SMTP provider with App Password support
**Risk:** Low
**Depends on:** Phase 16.2
**Status:** ✓ Complete (2026-02-01)

---

## Goal

Create Gmail SMTP provider as a free option for hotels using Google Workspace.

---

## Why Gmail SMTP

- Free (uses hotel's existing Google Workspace)
- Simple setup (no OAuth redirect issues)
- Works self-hosted
- Uses App Password (16-character code)

---

## Constraints

- Requires 2FA enabled on Google account
- Google may deprecate App Passwords in future
- Lower daily sending limits than dedicated services
- Best for small hotels with low volume

---

## Tasks

### 1. Create Gmail SMTP Provider

- [ ] Create `src/extensions/channels/email/gmail-smtp.ts`
- [ ] Implement `GmailSMTPProvider` class
- [ ] Pre-configure Gmail SMTP settings (smtp.gmail.com:587)
- [ ] Use nodemailer (already a dependency)

### 2. Register Extension

- [ ] Update exports in index files

---

## Config Schema

```typescript
configSchema: [
  {
    key: 'email',
    label: 'Gmail Address',
    type: 'text',
    required: true,
    description: 'Your Gmail or Google Workspace email',
    placeholder: 'concierge@grandhotel.com',
  },
  {
    key: 'appPassword',
    label: 'App Password',
    type: 'password',
    required: true,
    description: 'Google App Password (16 characters, no spaces)',
    placeholder: 'xxxx xxxx xxxx xxxx',
  },
  {
    key: 'fromName',
    label: 'From Name',
    type: 'text',
    required: false,
    description: 'Display name for outgoing emails',
    default: 'Hotel Concierge',
  },
],
```

---

## Pre-configured Settings

These are hardcoded for Gmail:

```typescript
const GMAIL_SMTP_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS
};
```

---

## Setup Instructions (for Dashboard UI)

```
1. Go to Google Account → Security → 2-Step Verification
2. Scroll to "App passwords" at the bottom
3. Select app: "Mail", Select device: "Other (Custom name)"
4. Name it "Jack The Butler" and click Generate
5. Copy the 16-character password (with or without spaces)
6. Paste it in the App Password field above
```

---

## Acceptance Criteria

- [ ] `GmailSMTPProvider` class created
- [ ] `testConnection()` verifies credentials
- [ ] `sendEmail()` sends via Gmail SMTP
- [ ] Manifest includes setup instructions
- [ ] TypeScript compiles
- [ ] Tests pass
