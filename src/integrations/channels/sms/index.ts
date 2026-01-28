/**
 * SMS Channel Integration
 *
 * Factory and exports for SMS provider integrations.
 */

import type { ConnectionTestResult } from '@/integrations/core/types.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

import { TwilioProvider, createTwilioProvider, type TwilioConfig } from './twilio.js';

export { TwilioProvider, createTwilioProvider, type TwilioConfig } from './twilio.js';

const log = createLogger('integrations:channels:sms');

/**
 * SMS provider types
 */
export type SMSProviderType = 'twilio' | 'vonage';

/**
 * Cached provider instance
 */
let cachedProvider: TwilioProvider | null = null;

/**
 * Create an SMS provider by type
 */
export function createSMSProvider(
  type: SMSProviderType,
  config: Record<string, unknown>
): TwilioProvider {
  switch (type) {
    case 'twilio':
      return createTwilioProvider(config as unknown as TwilioConfig);
    case 'vonage':
      // TODO: Implement Vonage provider
      throw new Error('Vonage provider not yet implemented');
    default:
      throw new Error(`Unknown SMS provider type: ${type}`);
  }
}

/**
 * Get the configured SMS provider
 */
export function getSMSProvider(): TwilioProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = loadConfig();

  if (!config.sms.accountSid || !config.sms.authToken || !config.sms.phoneNumber) {
    log.debug('SMS not configured');
    return null;
  }

  cachedProvider = createTwilioProvider({
    accountSid: config.sms.accountSid,
    authToken: config.sms.authToken,
    phoneNumber: config.sms.phoneNumber,
  });

  log.info('SMS provider initialized');
  return cachedProvider;
}

/**
 * Test SMS provider connection
 */
export async function testSMSConnection(
  type: SMSProviderType,
  config: Record<string, unknown>
): Promise<ConnectionTestResult> {
  try {
    const provider = createSMSProvider(type, config);
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
export function resetSMSProvider(): void {
  cachedProvider = null;
  log.debug('SMS provider cache cleared');
}
