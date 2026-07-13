/**
 * Domain-only provider adapters for @thebutler/pipeline.
 *
 * These adapters only need `@/services` and other core modules — no app
 * registry, no `@/apps` — so they stay in the domain layer alongside the
 * rest of `src/core/pipeline/`. The registry-dependent `aiProvider` (which
 * resolves the active AI provider per call) lives in the composition root
 * at `src/pipeline/adapters.ts` instead.
 *
 * @module core/pipeline/adapters
 */

import type {
  ConversationProvider,
  KnowledgeProvider,
  Logger,
  MemoryProvider,
  PromptProvider,
} from '@thebutler/pipeline';
import type { ButlerContext } from './context.js';
import {
  classifierPrompt,
  detectorPrompt,
  responderPrompt,
  translatorPrompt,
} from './prompts.js';
import { createLogger } from '@/utils/logger.js';
import { memoryService } from '@/services/memory.js';
import { KnowledgeService } from '@/core/ai/knowledge/index.js';
import { conversationService } from '@/services/conversation.js';
import type { Conversation as PkgConversation } from '@thebutler/pipeline';
import type { Conversation as ButlerConversation } from '@/db/schema.js';
import type { ChannelType } from '@jackthebutler/shared';

// Singleton — KnowledgeService is stateless aside from its DB queries, so
// one instance is fine for the whole process.
const knowledgeService = new KnowledgeService();

function notImpl(name: string): never {
  throw new Error(`[pipeline adapter] ${name} not implemented yet`);
}

// `intentProvider` and `entityProvider` live in their own files (their
// implementations are large enough to warrant separate modules); they're
// re-exported below so external consumers only need `./adapters.js`.
export { intentProvider } from './intents.js';
export { entityProvider } from './entity-resolver.js';

export const promptProvider: PromptProvider<ButlerContext> = {
  classifier: classifierPrompt,
  responder: responderPrompt,
  detector: detectorPrompt,
  translator: translatorPrompt,
};

// ─── Service adapters ───────────────────────────────────────────

// Maps a Butler `Conversation` row (SQLite TEXT columns, JSON-string
// metadata, `guestId`/`guestLanguage` fields) to the package's
// domain-agnostic shape (`entityId`/`language`, Date timestamps, parsed
// metadata).
function toPkgConversation(row: ButlerConversation): PkgConversation {
  let meta: Record<string, unknown> = {};
  try {
    meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    channel: row.channelType,
    channelId: row.channelId,
    entityId: row.guestId ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    ...(row.guestLanguage ? { language: row.guestLanguage } : {}),
    metadata: meta,
  };
}

export const conversationProvider: ConversationProvider = {
  findOrCreate: async (channel, channelId, entityId) => {
    const row = await conversationService.findOrCreate(
      channel as ChannelType,
      channelId,
      entityId ?? undefined,
    );
    return toPkgConversation(row);
  },

  findById: async (id) => {
    const row = await conversationService.findById(id);
    return row ? toPkgConversation(row) : null;
  },

  // Maps package `role` → Butler `direction`/`senderType` and the
  // optional language/translation → Butler's column pair. Other Butler
  // CreateMessageInput fields (intent, confidence, entities,
  // channelMessageId, senderId) are deliberately omitted — they're
  // ephemeral classification state, not per-message persistence concerns.
  addMessage: async (conversationId, message) => {
    const direction = message.role === 'user' ? 'inbound' : 'outbound';
    const senderType = message.role === 'user' ? 'guest' : 'ai';
    const saved = await conversationService.addMessage(conversationId, {
      direction,
      senderType,
      content: message.content,
      contentType: 'text',
      ...(message.language ? { detectedLanguage: message.language } : {}),
      ...(message.translation ? { translatedContent: message.translation } : {}),
    });
    return { id: saved.id };
  },

  // For history that feeds the LLM, prefer the translated content on
  // inbound rows so the conversation reads in one language (the system's).
  // Swallows errors to a empty array — history isn't load-bearing; a DB
  // hiccup shouldn't fail the whole reply.
  getRecentMessages: async (conversationId, limit) => {
    try {
      const rows = await conversationService.getMessages(conversationId, { limit });
      return rows.map((r) => {
        const role: 'user' | 'assistant' = r.direction === 'inbound' ? 'user' : 'assistant';
        const content =
          r.direction === 'inbound' && r.translatedContent
            ? r.translatedContent
            : r.content;
        return {
          role,
          content,
          ...(r.detectedLanguage ? { language: r.detectedLanguage } : {}),
          ...(r.translatedContent ? { translation: r.translatedContent } : {}),
        };
      });
    } catch {
      return [];
    }
  },

  setLanguage: async (conversationId, language) => {
    await conversationService.update(conversationId, { guestLanguage: language });
  },
};

// Pino's `(obj, msg)` call signature aligns with the package's `Logger`
// interface; a child logger keyed on `core:pipeline` namespaces every
// stage log line.
export const loggerProvider: Logger = createLogger('core:pipeline');

// Projects Butler's `KnowledgeSearchResult` rows down to the package's
// `KnowledgeHit` shape ({id, title, content, similarity}). Butler may
// return extra fields (`category`, etc.); they're dropped at the boundary.
export const knowledgeProvider: KnowledgeProvider = {
  search: async (embedding, options) => {
    const rows = await knowledgeService.searchByEmbedding([...embedding], {
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.minSimilarity !== undefined
        ? { minSimilarity: options.minSimilarity }
        : {}),
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      similarity: r.similarity,
    }));
  },
};

// Recall maps the package's options-object call style to Butler's
// positional (guestId, embedding?, topK) signature, and projects
// `GuestMemory` rows down to the package's `MemoryHit` shape.
//
// Save is unused by any current stage — the pipeline doesn't write
// memories itself yet. Throws if called so we hear about it the moment
// a future memory-extraction stage forgets to be implemented.
export const memoryProvider: MemoryProvider = {
  recall: async (entityId, options) => {
    const embedding = options?.embedding ? [...options.embedding] : undefined;
    const rows = await memoryService.recall(entityId, embedding, options?.limit);
    return rows.map((row) => ({ key: row.category, value: row.content }));
  },
  save: async () => notImpl('memoryProvider.save'),
};
