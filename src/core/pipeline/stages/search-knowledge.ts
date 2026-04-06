import { KnowledgeService } from '@/core/ai/knowledge/index.js';
import type { MessageContext } from '../context.js';

// No embedding provider needed — searchByEmbedding works with a pre-computed vector
const knowledge = new KnowledgeService();

export async function searchKnowledge(ctx: MessageContext): Promise<void> {
  if (!ctx.queryEmbedding) return;

  ctx.knowledgeResults = await knowledge.searchByEmbedding(ctx.queryEmbedding, {
    limit: 3,
    minSimilarity: 0.3,
  });
}
