/**
 * computeEmbedding — embeds the inbound content (or its translation),
 * writes the vector to `ctx.inboundEmbedding`.
 *
 * The embedding is shared by `loadKnowledge` and `loadMemories` so
 * a single embedding call serves both. Skips entirely when neither
 * downstream consumer is configured (no knowledge service AND no memory
 * service) — no point paying for an embedding nothing will use.
 *
 * @module stages/compute-embedding
 */

import type { Stage } from '../core/pipeline.js';

export const computeEmbedding: Stage = async (ctx, env) => {
  // Skip when no downstream consumer needs the embedding.
  if (!env.services.knowledge && !env.services.memory) return;

  const text = ctx.inboundTranslation ?? ctx.inbound.content;

  try {
    const result = await env.services.ai.embed({ text });
    ctx.inboundEmbedding = result.embedding;
  } catch (err) {
    env.services.logger.warn({ err }, 'Embedding computation failed');
  }
};
