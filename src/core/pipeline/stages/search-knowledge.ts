import { KnowledgeService } from '@/core/ai/knowledge/index.js';
import { writeActivityLog } from '@/services/activity-log.js';
import type { MessageContext } from '../context.js';

// No embedding provider needed — searchByEmbedding works with a pre-computed vector
const knowledge = new KnowledgeService();

export async function searchKnowledge(ctx: MessageContext): Promise<void> {
  if (!ctx.queryEmbedding) return;

  ctx.knowledgeResults = await knowledge.searchByEmbedding(ctx.queryEmbedding, {
    limit: 3,
    minSimilarity: 0.3,
  });

  writeActivityLog(
    'knowledge',
    'knowledge.searched',
    'success',
    ctx.conversation?.id,
    undefined,
    undefined,
    {
      matches: ctx.knowledgeResults.length,
      results: ctx.knowledgeResults.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        similarity: Math.round(r.similarity * 100) / 100,
      })),
    }
  );
}
