import { inArray } from 'drizzle-orm';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { knowledgeEntries } from '@/db/schema/index.js';
import { getActiveEmbeddingInstance, getActiveGenerationInstance } from '@/modules/apps/service.js';
import { getBusiness } from '@/modules/business/service.js';
import { searchKnowledge } from '@/modules/knowledge/search.js';
import { buildResponsePrompt, type ResponseHit } from '@/modules/knowledge/answer.js';
import { logger } from '@/core/logger.js';

/**
 * Agent-copilot backend. Two steps the agent drives by hand:
 *   - searchKnowledgeByText: embed a free-text query, return a ranked shortlist.
 *   - generateReplyFromEntries: draft a reply grounded ONLY in the entries the
 *     agent selected, reusing the same response prompt as the live pipeline and
 *     the Ask Jane sandbox.
 *
 * Both share the live pipeline's building blocks (embedding, cosine search,
 * `buildResponsePrompt`). The reply is produced in the business default
 * language; translating it for the customer happens on send (the composer's
 * translate toggle), exactly like a typed agent reply.
 */

const COPILOT_LIMIT = 10;

export type KbSearchError = 'no_embedding' | 'embedding_failed';

export async function searchKnowledgeByText(
  query: string,
): Promise<{ matches: KnowledgeHitDTO[]; error?: KbSearchError }> {
  const embedding = getActiveEmbeddingInstance();
  if (!embedding) return { matches: [], error: 'no_embedding' };

  let vector: readonly number[] | undefined;
  try {
    const result = await embedding.embed({ texts: [query] });
    vector = result.vectors[0];
  } catch (err) {
    logger.warn({ err }, 'copilot kb search: embedding failed');
  }
  if (!vector || vector.length === 0) return { matches: [], error: 'embedding_failed' };

  // Rank all approved+embedded entries, return the top slice (floor 0).
  const { hits } = searchKnowledge(vector, COPILOT_LIMIT, 0);
  return {
    matches: hits.map((h) => ({
      id: h.id,
      question: h.question,
      answer: h.answer,
      topic: h.topic,
      similarity: h.similarity,
    })),
  };
}

export type GenerateReplyError = 'no_entries' | 'no_generation' | 'generation_failed';

export async function generateReplyFromEntries(
  entryIds: string[],
  question: string,
): Promise<{ reply?: string; error?: GenerateReplyError }> {
  // Read the selected entries fresh from the DB (don't trust client-sent text);
  // keep the caller's order and drop any that were deleted since.
  const rows = db
    .select({
      id: knowledgeEntries.id,
      question: knowledgeEntries.question,
      answer: knowledgeEntries.answer,
      topic: knowledgeEntries.topic,
    })
    .from(knowledgeEntries)
    .where(inArray(knowledgeEntries.id, entryIds))
    .all();
  if (rows.length === 0) return { error: 'no_entries' };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const hits: ResponseHit[] = entryIds.flatMap((id) => {
    const e = byId.get(id);
    if (!e) return [];
    return [{ title: e.topic ? `${e.topic}: ${e.question}` : e.question, content: e.answer }];
  });

  const generation = getActiveGenerationInstance();
  if (!generation) return { error: 'no_generation' };

  const prompt = buildResponsePrompt(hits, getBusiness().defaultLanguage);
  try {
    const result = await generation.generate({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: question },
      ],
      modelTier: 'reasoning',
      purpose: 'response_generation',
    });
    return { reply: result.content };
  } catch (err) {
    logger.warn({ err }, 'copilot generate reply failed');
    return { error: 'generation_failed' };
  }
}
