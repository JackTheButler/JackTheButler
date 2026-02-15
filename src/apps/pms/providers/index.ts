/**
 * PMS Providers
 *
 * Exports all PMS provider extensions.
 *
 * @module extensions/pms/providers
 */

export { MockPMSAdapter, createMockPMSAdapter, manifest as mockManifest } from './mock.js';
export { MewsPMSAdapter, createMewsPMSAdapter, manifest as mewsManifest } from './mews.js';
