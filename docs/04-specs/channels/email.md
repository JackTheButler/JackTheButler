# Email Channel

Email integration via SMTP and transactional email services.

---

## Providers

### SMTP (Generic)

**App ID:** `email-smtp`

Direct SMTP connection to your mail server.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `smtpHost` | text | Yes | SMTP server hostname |
| `smtpPort` | number | No | SMTP port (default: 587) |
| `smtpSecure` | boolean | No | Use TLS (for port 465) |
| `smtpUser` | text | No | Authentication username |
| `smtpPass` | password | No | Authentication password |
| `fromAddress` | text | Yes | Email address to send from |
| `fromName` | text | No | Display name for outgoing emails |

### Gmail SMTP

**App ID:** `email-gmail-smtp`

Simplified Gmail configuration using app passwords.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | text | Yes | Gmail address |
| `appPassword` | password | Yes | Gmail app password (not regular password) |
| `fromName` | text | No | Display name |

### SendGrid

**App ID:** `email-sendgrid`

Transactional email via SendGrid.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | password | Yes | SendGrid API key |
| `fromEmail` | text | Yes | Verified sender email |
| `fromName` | text | No | Sender display name |

### Mailgun

**App ID:** `email-mailgun`

Transactional email via Mailgun.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | password | Yes | Mailgun API key |
| `domain` | text | Yes | Verified Mailgun domain |
| `fromEmail` | text | Yes | From email address |
| `fromName` | text | No | Sender display name |
| `region` | select | No | API region (US or EU) |

---

## Features

| Feature | SMTP | Gmail | SendGrid | Mailgun |
|---------|------|-------|----------|---------|
| Inbound | Yes | No | Yes | Yes |
| Outbound | Yes | Yes | Yes | Yes |
| Templates | Yes | No | Yes | Yes |
| Tracking | No | No | Yes | Yes |

---

## Email Format

**Sending email:**
```typescript
await provider.sendEmail({
  to: 'guest@example.com',
  subject: 'Your reservation is confirmed',
  text: 'Plain text version',
  html: '<p>HTML version</p>',
  inReplyTo: 'original-message-id',
  references: ['thread-message-ids'],
});
```

**Response:**
```json
{
  "messageId": "<abc123@hotel.com>",
  "accepted": ["guest@example.com"],
  "rejected": []
}
```

---

## Threading

Email threads are maintained using:
- `In-Reply-To` header — References the message being replied to
- `References` header — Full thread chain

This ensures replies appear in the same thread in guest's inbox.

---

## Inbound Email

For inbound email support, configure:
1. MX records pointing to email service
2. Webhook URL for incoming email events

(Implementation varies by provider)

---

## Related

- [REST API](../api/rest-api.md) — Conversation endpoints
