/**
 * Email Channel Extension
 *
 * Exports for email channel integrations.
 *
 * @module extensions/channels/email
 */

// SMTP (legacy - will be removed after Phase 16)
export {
  SMTPProvider,
  createSMTPProvider,
  manifest as smtpManifest,
  type SMTPConfig,
  type SendEmailOptions,
  type SendEmailResult,
} from './smtp.js';

// Mailgun (Primary - Recommended)
export {
  MailgunProvider,
  createMailgunProvider,
  mailgunManifest,
  type MailgunConfig,
  type MailgunSendOptions,
  type MailgunSendResult,
} from './mailgun.js';

// SendGrid (Alternative)
export {
  SendGridProvider,
  createSendGridProvider,
  sendgridManifest,
  type SendGridConfig,
  type SendGridSendOptions,
  type SendGridSendResult,
} from './sendgrid.js';

// Gmail SMTP (Free option)
export {
  GmailSMTPProvider,
  createGmailSMTPProvider,
  gmailSmtpManifest,
  type GmailSMTPConfig,
  type GmailSendOptions,
  type GmailSendResult,
} from './gmail-smtp.js';
