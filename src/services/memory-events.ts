/**
 * Memory Extraction Event Subscriber
 *
 * Subscribes to CONVERSATION_CLOSED and runs memory extraction
 * asynchronously. Fire-and-forget — never blocks message processing.
 *
 * Provider resolution is injected rather than pulled from the app
 * registry directly — `src/core/**` must not import `@/apps` (kernel /
 * adapter layering, see CLAUDE.md). The composition root
 * (`src/index.ts`) supplies getters bound to the registry at
 * `subscribeMemoryExtractionToEvents()` call time; each getter is called
 * fresh per event so the active provider can change between events
 * without needing a restart.
 *
 * @module core/memory/event-subscriber
 */

import { events, EventTypes } from '@/events/index.js';
import type { ConversationClosedEvent } from '@/types/events.js';
import type { AIProvider } from '@jackthebutler/shared';
import { conversationService } from '@/services/conversation.js';
import { MemoryService } from '@/services/memory.js';
import { MemoryExtractor } from './memory-extractor.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('core:memory-events');

/**
 * Provider getters supplied by the composition root. Each is a thunk
 * (rather than a resolved value) so the active provider is re-resolved
 * per event — matching the previous `getAppRegistry()`-per-call behavior.
 */
export interface MemoryEventSubscriberDeps {
  getActiveAIProvider: () => AIProvider | undefined;
  getEmbeddingProvider: () => AIProvider | undefined;
}

export function subscribeMemoryExtractionToEvents(deps: MemoryEventSubscriberDeps): void {
  events.on(EventTypes.CONVERSATION_CLOSED, (event: ConversationClosedEvent) => {
    // Fire-and-forget — errors must never propagate to the event emitter
    runExtraction(event, deps).catch((err) => {
      log.error({ err, conversationId: event.conversationId }, 'Unhandled error in memory extraction');
    });
  });

  log.info('Memory extraction subscribed to CONVERSATION_CLOSED');
}

export async function runExtraction(
  event: ConversationClosedEvent,
  deps: MemoryEventSubscriberDeps,
): Promise<void> {
  const { conversationId, guestId } = event;

  // No guest identified — nothing to attach memories to
  if (!guestId) {
    log.debug({ conversationId }, 'Skipping memory extraction: no guest on conversation');
    return;
  }

  // No AI provider configured — skip silently
  const provider = deps.getActiveAIProvider();
  if (!provider) {
    log.debug({ conversationId }, 'Skipping memory extraction: no AI provider configured');
    return;
  }

  const embeddingProvider = deps.getEmbeddingProvider();

  const messages = await conversationService.getMessages(conversationId, { limit: 500 });

  // Skip extraction if the guest barely spoke — no durable facts can be inferred
  const guestMessageCount = messages.filter((m) => m.senderType === 'guest').length;
  if (guestMessageCount < 2) {
    log.debug({ conversationId, guestMessageCount }, 'Skipping memory extraction: too few guest messages');
    return;
  }

  const extractor = new MemoryExtractor(provider);
  const facts = await extractor.extract(messages, conversationId);

  if (facts.length === 0) return;

  // MemoryService(completionProvider, embeddingProvider) handles embedding + deduplication on write
  const memoryService = new MemoryService(provider, embeddingProvider ?? undefined);
  await memoryService.insert(guestId, conversationId, facts);
}
