/**
 * loadMemories — pulls relevant long-term memories about the entity,
 * writes them to `ctx.memoryHits`.
 *
 * Requires `ctx.entity` (memories are per-entity) and the optional
 * `memory` service. When `computeEmbedding` ran, the embedding is passed
 * to rank memories by relevance to the current message; otherwise the
 * implementation may fall back to recency or some other ordering.
 *
 * @module stages/load-memories
 */

import type { Stage } from '../core/pipeline.js';
import type { MemoryRecallOptions } from '../types/memory.js';

/** Default number of memories to load. */
const DEFAULT_LIMIT = 5;

export const loadMemories: Stage = async (ctx, env) => {
  if (!env.services.memory || !ctx.entity) return;

  const options: MemoryRecallOptions = {
    limit: DEFAULT_LIMIT,
    ...(ctx.inboundEmbedding ? { embedding: ctx.inboundEmbedding } : {}),
  };

  try {
    ctx.memoryHits = await env.services.memory.recall(ctx.entity.id, options);
  } catch (err) {
    env.services.logger.warn({ err }, 'Memory recall failed');
  }
};
