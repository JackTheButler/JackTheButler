/**
 * Apps Module
 *
 * Registry, loader, and manifest utilities for the app/plugin system.
 * Concrete provider implementations live in packages/ and are discovered
 * at startup from node_modules/@jackthebutler/.
 *
 * @module apps
 */

// ============================================
// App Types
// ============================================
export * from './types.js';

// ============================================
// App Registry & Loader
// ============================================
export {
  AppRegistry,
  getAppRegistry,
  resetAppRegistry,
  type RegisteredApp,
  type RegistryStatus,
} from './registry.js';

export {
  AppLoader,
  getAppLoader,
  resetAppLoader,
  loadApps,
  type LoadConfig,
  type LoaderOptions,
  type LoadResult,
} from './loader.js';

// ============================================
// Tool Apps (built-in, not plugins)
// ============================================
export {
  scrapeUrl,
  scrapeUrls,
  parseHtml,
  processContent,
  siteScraperRoutes,
  type ScrapeOptions,
  type ScrapeResult,
  type ParseOptions,
  type ParsedContent,
  type ContentSection,
  type PageMetadata,
  type ProcessedEntry,
  type ProcessContext,
  type KnowledgeCategory,
} from './tools/index.js';

// ============================================
// Manifest Registry
// ============================================
import { getAppRegistry } from './registry.js';
import type { AnyAppManifest, AppCategory } from './types.js';

export function getAllManifests(): AnyAppManifest[] {
  return getAppRegistry().getAll().map((ext) => ext.manifest);
}

export function getManifestsByCategory(category: AppCategory): AnyAppManifest[] {
  return getAppRegistry().getByCategory(category).map((ext) => ext.manifest);
}

export function getManifest(id: string): AnyAppManifest | undefined {
  return getAppRegistry().get(id)?.manifest;
}
