import { getBusiness } from '@/modules/business/service.js';
import { getAssistant } from '@/modules/assistant/service.js';
import { getActiveEmbeddingInstance, getActiveGenerationInstance } from '@/modules/apps/service.js';
import { searchKnowledge } from '@/modules/knowledge/search.js';
import { getKbMinSimilarity, getKbTopK } from '@/modules/knowledge/service.js';
import { buildResponsePrompt, matchToResponseHit } from '@/modules/knowledge/answer.js';
import { logger } from '@/core/logger.js';

/**
 * "Ask Jane" — the KB test sandbox backend. Mirrors the live chat path
 * (same embedding → retrieval → generation, same stored strictness + top-K,
 * same response prompt), minus the conversation plumbing. Emits progress
 * events so the UI can show phases and render matches before the answer.
 */

export interface AskMatch {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  score: number;
}

export type AskEvent =
  | { type: 'phase'; phase: 'embedding' | 'searching' | 'generating' }
  | { type: 'matches'; matches: AskMatch[] }
  | { type: 'answer'; text: string }
  | { type: 'error'; reason: 'no_embedding' | 'no_generation' | 'embedding_failed' | 'generation_failed' }
  | { type: 'done' };

type Emit = (event: AskEvent) => void | Promise<void>;

export async function askKnowledge(question: string, emit: Emit): Promise<void> {
  const embedding = getActiveEmbeddingInstance();
  if (!embedding) {
    await emit({ type: 'error', reason: 'no_embedding' });
    return;
  }

  await emit({ type: 'phase', phase: 'embedding' });
  let vector: readonly number[] | undefined;
  try {
    const result = await embedding.embed({ texts: [question] });
    vector = result.vectors[0];
  } catch (err) {
    logger.warn({ err }, 'kb ask: embedding failed');
  }
  if (!vector || vector.length === 0) {
    await emit({ type: 'error', reason: 'embedding_failed' });
    return;
  }

  // Retrieval uses the SAME stored settings as live chat.
  await emit({ type: 'phase', phase: 'searching' });
  const { hits } = searchKnowledge(vector, getKbTopK(), getKbMinSimilarity());
  await emit({
    type: 'matches',
    matches: hits.map((h) => ({
      id: h.id,
      question: h.question,
      answer: h.answer,
      topic: h.topic,
      score: h.similarity,
    })),
  });

  // Strict KB grounding: nothing cleared the strictness floor, so don't call
  // the model (it would answer from general knowledge). Return the configured
  // fallback deterministically — same outcome the strengthened prompt drives.
  if (hits.length === 0) {
    await emit({ type: 'answer', text: getAssistant().fallback.trim() });
    await emit({ type: 'done' });
    return;
  }

  const generation = getActiveGenerationInstance();
  if (!generation) {
    // Matches already sent — the UI can show them; just no composed answer.
    await emit({ type: 'error', reason: 'no_generation' });
    return;
  }

  await emit({ type: 'phase', phase: 'generating' });
  const prompt = buildResponsePrompt(hits.map(matchToResponseHit), getBusiness().defaultLanguage);
  try {
    const result = await generation.generate({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: question },
      ],
      modelTier: 'reasoning',
      purpose: 'response_generation',
    });
    await emit({ type: 'answer', text: result.content });
  } catch (err) {
    logger.warn({ err }, 'kb ask: generation failed');
    await emit({ type: 'error', reason: 'generation_failed' });
    return;
  }

  await emit({ type: 'done' });
}
