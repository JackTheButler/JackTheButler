/**
 * WhatsApp Channel Integration
 *
 * Factory and exports for WhatsApp provider integrations.
 */

import type { ConnectionTestResult } from '@/integrations/core/types.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

import { MetaWhatsAppProvider, createMetaWhatsAppProvider, type MetaWhatsAppConfig } from './meta.js';

export { MetaWhatsAppProvider, createMetaWhatsAppProvider, type MetaWhatsAppConfig } from './meta.js';

const log = createLogger('integrations:channels:whatsapp');

/**
 * WhatsApp provider types
 */
export type WhatsAppProviderType = 'meta';

/**
 * Cached provider instance
 */
let cachedProvider: MetaWhatsAppProvider | null = null;

/**
 * Create a WhatsApp provider by type
 */
export function createWhatsAppProvider(
  type: WhatsAppProviderType,
  config: MetaWhatsAppConfig
): MetaWhatsAppProvider {
  switch (type) {
    case 'meta':
      return createMetaWhatsAppProvider(config);
    default:
      throw new Error(`Unknown WhatsApp provider type: ${type}`);
  }
}

/**
 * Get the configured WhatsApp provider
 */
export function getWhatsAppProvider(): MetaWhatsAppProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = loadConfig();

  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    log.debug('WhatsApp not configured');
    return null;
  }

  cachedProvider = createMetaWhatsAppProvider({
    accessToken: config.whatsapp.accessToken,
    phoneNumberId: config.whatsapp.phoneNumberId,
    ...(config.whatsapp.verifyToken !== undefined && { verifyToken: config.whatsapp.verifyToken }),
    ...(config.whatsapp.appSecret !== undefined && { appSecret: config.whatsapp.appSecret }),
  });

  log.info('WhatsApp provider initialized');
  return cachedProvider;
}

/**
 * Test WhatsApp provider connection
 */
export async function testWhatsAppConnection(
  config: MetaWhatsAppConfig
): Promise<ConnectionTestResult> {
  try {
    const provider = createMetaWhatsAppProvider(config);
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
export function resetWhatsAppProvider(): void {
  cachedProvider = null;
  log.debug('WhatsApp provider cache cleared');
}
