/**
 * Channel Integrations Layer
 *
 * Central exports for all channel provider integrations.
 */

// WhatsApp
export {
  MetaWhatsAppProvider,
  createMetaWhatsAppProvider,
  createWhatsAppProvider,
  getWhatsAppProvider,
  testWhatsAppConnection,
  resetWhatsAppProvider,
  type MetaWhatsAppConfig,
  type WhatsAppProviderType,
} from './whatsapp/index.js';

// SMS
export {
  TwilioProvider,
  createTwilioProvider,
  createSMSProvider,
  getSMSProvider,
  testSMSConnection,
  resetSMSProvider,
  type TwilioConfig,
  type SMSProviderType,
} from './sms/index.js';

// Email
export {
  SMTPProvider,
  createSMTPProvider,
  createEmailProvider,
  getEmailProvider,
  testEmailConnection,
  resetEmailProvider,
  type SMTPConfig,
  type EmailProviderType,
  type SendEmailOptions,
  type SendEmailResult,
} from './email/index.js';
