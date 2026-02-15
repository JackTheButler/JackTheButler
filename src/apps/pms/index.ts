/**
 * PMS Extensions
 *
 * Exports for all PMS (Property Management System) provider extensions.
 *
 * @module extensions/pms
 */

import type { PMSAppManifest } from '../types.js';

// Providers
export { MockPMSAdapter, createMockPMSAdapter, mockManifest } from './providers/index.js';
export { MewsPMSAdapter, createMewsPMSAdapter, mewsManifest } from './providers/index.js';

// Import manifests for registry
import { mockManifest, mewsManifest } from './providers/index.js';

/**
 * PMS provider types
 */
export type PMSProviderType = 'mock' | 'mews' | 'cloudbeds' | 'opera' | 'apaleo' | 'protel';

/**
 * All registered PMS extension manifests
 */
export const pmsManifests: Record<string, PMSAppManifest> = {
  'pms-mock': mockManifest,
  'pms-mews': mewsManifest,
};

/**
 * Get all PMS extension manifests
 */
export function getPMSManifests(): PMSAppManifest[] {
  return Object.values(pmsManifests);
}

/**
 * Get a specific PMS extension manifest
 */
export function getPMSManifest(id: string): PMSAppManifest | undefined {
  return pmsManifests[id];
}
