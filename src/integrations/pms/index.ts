/**
 * PMS Integration
 *
 * Factory for creating PMS adapters based on configuration.
 */

import type { PMSAdapter, PMSConfig } from './adapter.js';
import { MockPMSAdapter } from './providers/mock.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('pms');

/**
 * Cached PMS adapter instance
 */
let cachedAdapter: PMSAdapter | null = null;

/**
 * Create a PMS adapter based on configuration
 */
export function createPMSAdapter(config: PMSConfig): PMSAdapter {
  log.info({ provider: config.provider }, 'Creating PMS adapter');

  switch (config.provider) {
    case 'mock':
      return new MockPMSAdapter(config);

    // Future providers:
    // case 'mews':
    //   return new MewsAdapter(config);
    // case 'cloudbeds':
    //   return new CloudbedsAdapter(config);
    // case 'opera':
    //   return new OperaAdapter(config);

    default:
      log.warn({ provider: config.provider }, 'Unknown PMS provider, using mock');
      return new MockPMSAdapter(config);
  }
}

/**
 * Get the configured PMS adapter (singleton)
 */
export function getPMSAdapter(): PMSAdapter {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const config = loadConfig();
  const pmsConfig: PMSConfig = {
    provider: (config.pms?.provider as PMSConfig['provider']) || 'mock',
    apiUrl: config.pms?.apiUrl,
    apiKey: config.pms?.apiKey,
    clientId: config.pms?.clientId,
    clientSecret: config.pms?.clientSecret,
    propertyId: config.pms?.propertyId,
    webhookSecret: config.pms?.webhookSecret,
  };

  cachedAdapter = createPMSAdapter(pmsConfig);
  return cachedAdapter;
}

/**
 * Reset cached adapter (for testing)
 */
export function resetPMSAdapter(): void {
  cachedAdapter = null;
}

export type { PMSAdapter, PMSConfig } from './adapter.js';
export { MockPMSAdapter } from './providers/mock.js';
