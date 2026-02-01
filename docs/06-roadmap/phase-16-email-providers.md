# Phase 16: Email Provider Simplification

**Version:** 1.7.0
**Codename:** Easy Mail
**Focus:** Replace complex SMTP/IMAP with simple, self-hosted-friendly email providers
**Depends on:** Phase 15 (Architecture Simplification)
**Status:** ✓ COMPLETE (2026-02-01)

---

## Goal

Make email setup simple for self-hosted deployments:
1. **Mailgun/SendGrid** - API key based, works anywhere (primary)
2. **Gmail SMTP** - Free option using App Password (secondary)
3. **Gmail OAuth** - For hotels with IT support (advanced)

Remove the current SMTP/IMAP implementation that requires server configuration.

---

## Self-Hosted Constraints

OAuth doesn't work well for self-hosted apps:

| Challenge | Why It's a Problem |
|-----------|-------------------|
| Redirect URI | Each hotel has different URL, can't pre-register all |
| Google Cloud project | Who owns it? Verification needed for >100 users |
| Firewall/NAT | Hotels may not have public URLs |

**Solution:** Prioritize API key and SMTP-based options that work regardless of deployment URL.

---

## Provider Priority

### 1. Mailgun (Primary - Recommended)

Best balance of simplicity and reliability for self-hosted.

**Setup:**
```
API Key:      [key-xxxxxxxxxxxxxxxx________]
Domain:       [mail.grandhotel.com_________]
From Address: [concierge@grandhotel.com____]
              [ Test Connection ]
```

**Why Primary:**
- API key based - no OAuth complexity
- Works from any server (no redirect URI needed)
- Webhooks for inbound email
- Great deliverability
- ~$15-35/month for hotel volume

### 2. SendGrid (Alternative)

Similar to Mailgun, widely used.

**Setup:**
```
API Key:      [SG.xxxxxxxxxxxxxxxx_________]
From Address: [concierge@grandhotel.com____]
              [ Test Connection ]
```

**Features:**
- API key based
- Inbound Parse webhook
- Good free tier (100 emails/day)

### 3. Gmail SMTP + App Password (Free Option)

For hotels that want free email using existing Gmail/Google Workspace.

**Setup:**
```
Email:        [concierge@grandhotel.com____]
App Password: [xxxx-xxxx-xxxx-xxxx_________]  (16 characters)
              [ Test Connection ]

ℹ️  Generate App Password: Google Account → Security → 2FA → App Passwords
```

**Why Secondary:**
- Free (uses hotel's existing Google Workspace)
- Simple setup (no OAuth redirect issues)
- Works self-hosted
- Requires 2FA enabled on Google account
- Google may deprecate App Passwords in future

### 4. Gmail OAuth (Advanced)

For hotels with IT support who want full OAuth security.

**Setup:**
```
┌─────────────────────────────────────────────────────────┐
│  Gmail OAuth (Advanced)                                 │
│  ─────────────────────────────────────────────────────  │
│  Requires your own Google Cloud project.                │
│                                                         │
│  Client ID:     [xxxxx.apps.googleusercontent.com_____] │
│  Client Secret: [xxxxxxxxxxxxxxxxxxxxxxxx______________] │
│  Redirect URI:  https://your-jack-url.com/oauth/callback│
│                                                         │
│  [ Connect with Google ]                                │
│                                                         │
│  📖 Setup Guide: docs.jackthebutler.com/gmail-oauth     │
└─────────────────────────────────────────────────────────┘
```

**Why Advanced:**
- Hotel must create their own Google Cloud project
- Hotel must configure OAuth consent screen
- Hotel must add their redirect URI
- Requires IT knowledge
- But provides best security

---

## Dashboard UI

```
┌─────────────────────────────────────────────────────────┐
│  Settings > Integrations > Email                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Choose your email provider:                            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⭐ Mailgun (Recommended)                        │   │
│  │    Reliable transactional email service         │   │
│  │    [ Configure ]                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📧 SendGrid                                     │   │
│  │    Popular email API with free tier             │   │
│  │    [ Configure ]                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🆓 Gmail SMTP (Free)                            │   │
│  │    Use your Google Workspace email              │   │
│  │    [ Configure ]                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔐 Gmail OAuth (Advanced)                       │   │
│  │    Requires own Google Cloud project            │   │
│  │    [ Configure ]                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Sub-Phases

| Sub-Phase | Focus | Status |
|-----------|-------|--------|
| [16.1: Mailgun](phase-16-1-mailgun.md) | Primary recommended provider | ✓ Complete |
| [16.2: SendGrid](phase-16-2-sendgrid.md) | Alternative API-based provider | ✓ Complete |
| [16.3: Gmail SMTP](phase-16-3-gmail-smtp.md) | Free option with App Password | ✓ Complete |
| 16.4: Cleanup | Delete old implementation | ✓ Complete |

> **Note:** Gmail OAuth (provider 4) is deferred - only implementing 1, 2, and 3 for now.

---

## Tasks

### Phase 16.1: Create Mailgun Provider (Primary)

- [ ] Create `src/extensions/channels/email/mailgun.ts`
- [ ] Implement send via Mailgun API
- [ ] Set up inbound webhook endpoint `/webhooks/email/mailgun`
- [ ] Create manifest with config schema

### Phase 16.2: Create SendGrid Provider

- [ ] Create `src/extensions/channels/email/sendgrid.ts`
- [ ] Implement send via SendGrid API
- [ ] Set up Inbound Parse webhook `/webhooks/email/sendgrid`
- [ ] Create manifest with config schema

### Phase 16.3: Create Gmail SMTP Provider

- [ ] Create `src/extensions/channels/email/gmail-smtp.ts`
- [ ] Implement send via nodemailer with Gmail SMTP
- [ ] Create manifest with config schema
- [ ] Add App Password setup instructions in manifest

### Phase 16.4: Cleanup

- [ ] Remove `src/channels/email/` folder
- [ ] Update any imports referencing old folder
- [ ] Remove unused IMAP dependencies (imap, mailparser)
- [ ] Verify all tests pass

### Future: Gmail OAuth Provider (Advanced)

- [ ] Create `src/extensions/channels/email/gmail-oauth.ts`
- [ ] Implement OAuth flow (hotel provides credentials)
- [ ] Store tokens securely
- [ ] Send/receive via Gmail API
- [ ] Create setup documentation

### Future: Update Dashboard

- [ ] Create email provider selection UI
- [ ] Add configuration forms for each provider
- [ ] Show "Recommended" badge on Mailgun
- [ ] Add help links for setup guides

---

## Final Folder Structure

```
src/extensions/channels/email/
├── index.ts           # Exports all email providers
├── smtp.ts            # Generic SMTP (legacy, kept for compatibility)
├── mailgun.ts         # Mailgun provider (PRIMARY) ✓
├── sendgrid.ts        # SendGrid provider ✓
└── gmail-smtp.ts      # Gmail SMTP + App Password ✓
```

Deleted:
```
src/channels/email/    # Entire folder (IMAP receiver, templates, parser) ✓
```

Removed dependencies:
```
imap, mailparser, @types/imap, @types/mailparser
```

---

## Webhook Endpoints

```
POST /webhooks/email/mailgun   # Mailgun inbound
POST /webhooks/email/sendgrid  # SendGrid Inbound Parse
GET  /oauth/gmail/callback     # Gmail OAuth callback (advanced)
```

---

## Dependencies

Add:
```json
{
  "mailgun.js": "^12.0.0",
  "@sendgrid/mail": "^8.0.0"
}
```

Keep (for Gmail SMTP):
```json
{
  "nodemailer": "^6.9.0"
}
```

Remove:
```json
{
  "imap": "...",        # No longer needed
  "mailparser": "..."   # No longer needed
}
```

---

## Acceptance Criteria

- [ ] Mailgun: Enter API key → email works
- [ ] SendGrid: Enter API key → email works
- [ ] Gmail SMTP: Enter email + App Password → email works
- [ ] Gmail OAuth: Enter own credentials → OAuth flow → email works
- [ ] Old SMTP/IMAP code deleted
- [ ] Dashboard shows provider selection
- [ ] All providers have "Test Connection" button
- [ ] All tests pass

---

## Success Demo

> "Hotel manager opens Settings > Email, selects Mailgun, enters API key,
> clicks Test Connection, sees green checkmark. Done in 2 minutes.
> No IT department, no server configuration."

---

## Cost Comparison

| Provider | Cost | Best For |
|----------|------|----------|
| Gmail SMTP | Free | Small hotels, budget-conscious |
| SendGrid | Free tier (100/day) | Low volume |
| Mailgun | ~$15-35/mo | Production use (recommended) |
| Gmail OAuth | Free | Hotels with IT support |

---

## Related

- [Phase 15: Architecture Simplification](phase-15-simplification.md)
- [Extension Architecture](../03-architecture/decisions/006-extension-architecture.md)
