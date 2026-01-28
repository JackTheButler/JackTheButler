/**
 * Email Channel Integration
 *
 * Factory and exports for Email provider integrations.
 */

import type { ConnectionTestResult } from '@/integrations/core/types.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

import { SMTPProvider, createSMTPProvider, type SMTPConfig } from './smtp.js';

export { SMTPProvider, createSMTPProvider, type SMTPConfig } from './smtp.js';
export type { SendEmailOptions, SendEmailResult } from './smtp.js';

const log = createLogger('integrations:channels:email');

/**
 * Email provider types
 */
export type EmailProviderType = 'smtp' | 'mailgun' | 'sendgrid';

/**
 * Cached provider instance
 */
let cachedProvider: SMTPProvider | null = null;

/**
 * Create an email provider by type
 */
export function createEmailProvider(
  type: EmailProviderType,
  config: Record<string, unknown>
): SMTPProvider {
  switch (type) {
    case 'smtp':
      return createSMTPProvider(config as unknown as SMTPConfig);
    case 'mailgun':
      // TODO: Implement Mailgun provider
      throw new Error('Mailgun provider not yet implemented');
    case 'sendgrid':
      // TODO: Implement SendGrid provider
      throw new Error('SendGrid provider not yet implemented');
    default:
      throw new Error(`Unknown email provider type: ${type}`);
  }
}

/**
 * Get the configured email provider
 */
export function getEmailProvider(): SMTPProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = loadConfig();

  if (!config.email.smtpHost || !config.email.fromAddress) {
    log.debug('Email not configured');
    return null;
  }

  cachedProvider = createSMTPProvider({
    smtpHost: config.email.smtpHost,
    smtpPort: config.email.smtpPort,
    fromAddress: config.email.fromAddress,
    ...(config.email.smtpUser !== undefined && { smtpUser: config.email.smtpUser }),
    ...(config.email.smtpPass !== undefined && { smtpPass: config.email.smtpPass }),
    ...(config.email.smtpSecure !== undefined && { smtpSecure: config.email.smtpSecure }),
    ...(config.email.imapHost !== undefined && { imapHost: config.email.imapHost }),
    ...(config.email.imapPort !== undefined && { imapPort: config.email.imapPort }),
    ...(config.email.imapUser !== undefined && { imapUser: config.email.imapUser }),
    ...(config.email.imapPass !== undefined && { imapPass: config.email.imapPass }),
    ...(config.email.fromName !== undefined && { fromName: config.email.fromName }),
  });

  log.info('Email provider initialized');
  return cachedProvider;
}

/**
 * Test email provider connection
 */
export async function testEmailConnection(
  type: EmailProviderType,
  config: Record<string, unknown>
): Promise<ConnectionTestResult> {
  try {
    const provider = createEmailProvider(type, config);
    return await provider.testConnection();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to create provider: ${message}`,
    };
  }
}

/**
 * Reset cached provider (for testing)
 */
export function resetEmailProvider(): void {
  if (cachedProvider) {
    cachedProvider.close();
    cachedProvider = null;
  }
  log.debug('Email provider cache cleared');
}
