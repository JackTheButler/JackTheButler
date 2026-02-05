/**
 * Tool Extensions
 *
 * Built-in tools for hotel onboarding and operations.
 *
 * @module extensions/tools
 */

import type { ToolAppManifest } from '../types.js';
import { manifest as siteScraperManifest } from './site-scraper/manifest.js';

// Re-export site scraper
export * from './site-scraper/index.js';

/**
 * Available tool types
 */
export type ToolType = 'site-scraper';

/**
 * All tool manifests
 */
export const toolManifests: Record<string, ToolAppManifest> = {
  'tool-site-scraper': siteScraperManifest,
};

/**
 * Get all tool manifests
 */
export function getToolManifests(): ToolAppManifest[] {
  return Object.values(toolManifests);
}

/**
 * Get a tool manifest by ID
 */
export function getToolManifest(id: string): ToolAppManifest | undefined {
  return toolManifests[id];
}
