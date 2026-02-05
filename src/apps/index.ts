/**
 * Apps Module
 *
 * Adapters that implement core interfaces for external services.
 * Apps provide concrete implementations for:
 * - AI providers (Anthropic Claude, OpenAI, Ollama)
 * - Communication channels (WhatsApp, SMS, Email)
 * - Property Management Systems (Mews, Cloudbeds, Opera, etc.)
 *
 * Architecture:
 * - src/core/ contains business logic (kernel) and interfaces
 * - src/apps/ contains adapters (this module)
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
// AI Apps
// ============================================
export {
  // Providers
  AnthropicProvider,
  createAnthropicProvider,
  OpenAIProvider,
  createOpenAIProvider,
  OllamaProvider,
  createOllamaProvider,
  // Factory
  createAIProvider,
  testAIProviderConnection,
  // Manifests
  aiManifests,
  getAIManifests,
  getAIManifest,
  // Types
  type AIProviderType,
  type CombinedAIProvider,
  type AnthropicConfig,
  type OpenAIConfig,
  type OllamaConfig,
} from './ai/index.js';

// ============================================
// Channel Apps
// ============================================
export {
  // WhatsApp
  MetaWhatsAppProvider,
  createMetaWhatsAppProvider,
  metaWhatsAppManifest,
  // SMS
  TwilioProvider,
  createTwilioProvider,
  twilioManifest,
  // Email
  SMTPProvider,
  createSMTPProvider,
  smtpManifest,
  // Registry
  channelManifests,
  getChannelManifests,
  getChannelManifestsByType,
  // Types
  type MetaWhatsAppConfig,
  type TwilioConfig,
  type SMTPConfig,
  type WhatsAppProviderType,
  type SMSProviderType,
  type EmailProviderType,
} from './channels/index.js';

// ============================================
// PMS Apps
// ============================================
export {
  // Providers
  MockPMSAdapter,
  createMockPMSAdapter,
  mockManifest,
  // Registry
  pmsManifests,
  getPMSManifests,
  getPMSManifest,
  // Types
  type PMSProviderType,
} from './pms/index.js';

// ============================================
// Tool Apps
// ============================================
export {
  // Site Scraper
  scrapeUrl,
  scrapeUrls,
  parseHtml,
  processContent,
  siteScraperRoutes,
  // Registry
  toolManifests,
  getToolManifests,
  getToolManifest,
  // Types
  type ToolType,
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
// All Manifests Registry
// ============================================
import { aiManifests } from './ai/index.js';
import { channelManifests } from './channels/index.js';
import { pmsManifests } from './pms/index.js';
import type { AnyAppManifest, AppCategory } from './types.js';

/**
 * All registered app manifests
 *
 * Note: Tools are excluded as they are built-in features accessed via the
 * sidebar menu, not configurable apps.
 */
export const allManifests: Record<string, AnyAppManifest> = {
  ...aiManifests,
  ...channelManifests,
  ...pmsManifests,
};

/**
 * Get all app manifests
 */
export function getAllManifests(): AnyAppManifest[] {
  return Object.values(allManifests);
}

/**
 * Get manifests by category
 */
export function getManifestsByCategory(category: AppCategory): AnyAppManifest[] {
  return Object.values(allManifests).filter((m) => m.category === category);
}

/**
 * Get a specific app manifest by ID
 */
export function getManifest(id: string): AnyAppManifest | undefined {
  return allManifests[id];
}
