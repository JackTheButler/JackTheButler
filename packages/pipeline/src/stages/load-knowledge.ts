/**
 * loadKnowledge — runs vector search over the domain knowledge base
 * using `ctx.inboundEmbedding`, writes results to `ctx.knowledgeHits`.
 *
 * No-ops when the optional `knowledge` service isn't configured or when
 * `computeEmbedding` didn't produce an embedding.
 *
 * @module stages/load-knowledge
 */

import type { Stage } from '../core/pipeline.js';

/** Default retrieval ceilings. Override by replacing this stage if needed. */
const DEFAULT_LIMIT = 3;
const DEFAULT_MIN_SIMILARITY = 0.5;

export const loadKnowledge: Stage = async (ctx, env) => {
  if (!env.services.knowledge || !ctx.inboundEmbedding) return;

  try {
    ctx.knowledgeHits = await env.services.knowledge.search(ctx.inboundEmbedding, {
      limit: DEFAULT_LIMIT,
      minSimilarity: DEFAULT_MIN_SIMILARITY,
    });
  } catch (err) {
    env.services.logger.warn({ err }, 'Knowledge search failed');
  }
};
