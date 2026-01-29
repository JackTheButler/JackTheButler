/**
 * Responder Interface and Implementations
 *
 * Generates responses for incoming messages.
 * Uses AI responder when configured via extension registry, falls back to echo.
 */

import type { Conversation } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/services/guest-context.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('pipeline:responder');

/**
 * Response from the responder
 */
export interface Response {
  content: string;
  confidence: number;
  intent?: string | undefined;
  entities?: unknown[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Responder interface
 */
export interface Responder {
  /**
   * Generate a response for a message
   * @param conversation - The conversation context
   * @param message - The inbound message to respond to
   * @param guestContext - Optional guest context with profile and reservation info
   */
  generate(conversation: Conversation, message: InboundMessage, guestContext?: GuestContext): Promise<Response>;
}

/**
 * Echo responder for testing
 * Simply echoes back the received message.
 */
export class EchoResponder implements Responder {
  async generate(_conversation: Conversation, message: InboundMessage, guestContext?: GuestContext): Promise<Response> {
    // Include guest name in echo if available
    const greeting = guestContext?.guest ? `Hello ${guestContext.guest.firstName}! ` : '';
    return {
      content: `${greeting}Echo: ${message.content}`,
      confidence: 1.0,
      intent: 'echo',
    };
  }
}

/**
 * Cached responder instance
 */
let cachedResponder: Responder | null = null;
let isInitializing = false;
let initPromise: Promise<Responder> | null = null;

/**
 * Initialize the AI responder asynchronously
 * Uses extension registry to get active AI provider (configured via dashboard UI)
 */
async function initializeAIResponder(): Promise<Responder | null> {
  try {
    // Dynamic imports to avoid circular dependency issues
    const [extensionsModule, responderModule] = await Promise.all([
      import('@/extensions/index.js'),
      import('@/ai/responder.js'),
    ]);

    const registry = extensionsModule.getExtensionRegistry();
    const provider = registry.getActiveAIProvider();

    if (!provider) {
      log.debug('No active AI provider in extension registry');
      return null;
    }

    // Get embedding provider (same as completion provider for now)
    const embeddingProvider = provider;

    const responder = new responderModule.AIResponder({
      provider,
      embeddingProvider,
    });

    log.info({ provider: provider.name }, 'Using AI responder');
    return responder;
  } catch (error) {
    const err = error as Error;
    log.warn({
      err: { message: err.message, stack: err.stack, name: err.name }
    }, 'Failed to initialize AI responder, falling back to echo');
    return null;
  }
}

/**
 * Get the default responder (async initialization)
 */
async function getResponderAsync(): Promise<Responder> {
  if (cachedResponder) {
    return cachedResponder;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    const aiResponder = await initializeAIResponder();

    if (aiResponder) {
      cachedResponder = aiResponder;
      return aiResponder;
    }

    // Fallback to echo responder
    log.info('Using echo responder (no AI provider configured)');
    const echoResponder = new EchoResponder();
    cachedResponder = echoResponder;
    return echoResponder;
  })();

  return initPromise;
}

/**
 * Get the default responder (sync version, may return echo if not initialized)
 */
export function getDefaultResponder(): Responder {
  if (cachedResponder) {
    return cachedResponder;
  }

  // Start async initialization
  getResponderAsync();

  // Return a wrapper that waits for initialization
  return {
    async generate(conversation: Conversation, message: InboundMessage, guestContext?: GuestContext): Promise<Response> {
      const responder = await getResponderAsync();
      return responder.generate(conversation, message, guestContext);
    },
  };
}

/**
 * Reset cached responder (for testing)
 */
export function resetResponder(): void {
  cachedResponder = null;
  isInitializing = false;
  initPromise = null;
}

/**
 * Default responder instance (lazy loaded)
 */
export const defaultResponder: Responder = {
  generate(conversation: Conversation, message: InboundMessage, guestContext?: GuestContext): Promise<Response> {
    return getDefaultResponder().generate(conversation, message, guestContext);
  },
};
