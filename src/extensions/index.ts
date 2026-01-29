/**
 * Extensions Module
 *
 * Adapters that implement core interfaces for external services.
 * Extensions provide concrete implementations for:
 * - AI providers (Anthropic Claude, OpenAI, Ollama)
 * - Communication channels (WhatsApp, SMS, Email)
 * - Property Management Systems (Mews, Cloudbeds, Opera, etc.)
 *
 * Architecture:
 * - src/core/ contains business logic (kernel) and interfaces
 * - src/extensions/ contains adapters (this module)
 *
 * @module extensions
 * @see docs/03-architecture/decisions/006-extension-architecture.md
 */

// ============================================
// Extension Types
// ============================================
export * from './types.js';

// ============================================
// Extension Registry & Loader
// ============================================
export {
  ExtensionRegistry,
  getExtensionRegistry,
  resetExtensionRegistry,
  type RegisteredExtension,
  type ExtensionStatus,
} from './registry.js';

export {
  ExtensionLoader,
  getExtensionLoader,
  resetExtensionLoader,
  loadExtensions,
  type ExtensionConfig,
  type LoaderOptions,
  type LoadResult,
} from './loader.js';

// ============================================
// AI Extensions
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
// Channel Extensions
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
// PMS Extensions
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
// All Manifests Registry
// ============================================
import { aiManifests } from './ai/index.js';
import { channelManifests } from './channels/index.js';
import { pmsManifests } from './pms/index.js';
import type { AnyExtensionManifest, ExtensionCategory } from './types.js';

/**
 * All registered extension manifests
 */
export const allManifests: Record<string, AnyExtensionManifest> = {
  ...aiManifests,
  ...channelManifests,
  ...pmsManifests,
};

/**
 * Get all extension manifests
 */
export function getAllManifests(): AnyExtensionManifest[] {
  return Object.values(allManifests);
}

/**
 * Get manifests by category
 */
export function getManifestsByCategory(category: ExtensionCategory): AnyExtensionManifest[] {
  return Object.values(allManifests).filter((m) => m.category === category);
}

/**
 * Get a specific extension manifest by ID
 */
export function getManifest(id: string): AnyExtensionManifest | undefined {
  return allManifests[id];
}
