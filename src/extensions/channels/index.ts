/**
 * Channel Extensions
 *
 * Exports for all channel provider extensions.
 *
 * @module extensions/channels
 */

import type { ChannelExtensionManifest } from '../types.js';

// WhatsApp
export {
  MetaWhatsAppProvider,
  createMetaWhatsAppProvider,
  metaWhatsAppManifest,
  type MetaWhatsAppConfig,
} from './whatsapp/index.js';

// SMS
export {
  TwilioProvider,
  createTwilioProvider,
  twilioManifest,
  type TwilioConfig,
} from './sms/index.js';

// Email
export {
  // SMTP (legacy)
  SMTPProvider,
  createSMTPProvider,
  smtpManifest,
  type SMTPConfig,
  type SendEmailOptions,
  type SendEmailResult,
  // Mailgun (Primary - Recommended)
  MailgunProvider,
  createMailgunProvider,
  mailgunManifest,
  type MailgunConfig,
  type MailgunSendOptions,
  type MailgunSendResult,
  // SendGrid (Alternative)
  SendGridProvider,
  createSendGridProvider,
  sendgridManifest,
  type SendGridConfig,
  type SendGridSendOptions,
  type SendGridSendResult,
  // Gmail SMTP (Free)
  GmailSMTPProvider,
  createGmailSMTPProvider,
  gmailSmtpManifest,
  type GmailSMTPConfig,
  type GmailSendOptions,
  type GmailSendResult,
} from './email/index.js';

// Import manifests for registry
import { metaWhatsAppManifest } from './whatsapp/index.js';
import { twilioManifest } from './sms/index.js';
import { smtpManifest, mailgunManifest, sendgridManifest, gmailSmtpManifest } from './email/index.js';

/**
 * Channel provider types
 */
export type WhatsAppProviderType = 'meta';
export type SMSProviderType = 'twilio';
export type EmailProviderType = 'smtp' | 'mailgun' | 'sendgrid' | 'gmail-smtp';

/**
 * All registered channel extension manifests
 * Note: Order matters for UI display - email providers ordered by recommendation
 */
export const channelManifests: Record<string, ChannelExtensionManifest> = {
  'whatsapp-meta': metaWhatsAppManifest,
  'sms-twilio': twilioManifest,
  // Email providers (ordered by recommendation)
  'email-mailgun': mailgunManifest,       // Primary - Recommended
  'email-sendgrid': sendgridManifest,     // Alternative
  'email-gmail-smtp': gmailSmtpManifest,  // Free option
  'email-smtp': smtpManifest,             // Advanced - own SMTP server
};

/**
 * Get all channel extension manifests
 */
export function getChannelManifests(): ChannelExtensionManifest[] {
  return Object.values(channelManifests);
}

/**
 * Get manifests by channel type
 */
export function getChannelManifestsByType(
  channelType: 'whatsapp' | 'sms' | 'email'
): ChannelExtensionManifest[] {
  return Object.values(channelManifests).filter((m) => m.id.startsWith(channelType));
}
