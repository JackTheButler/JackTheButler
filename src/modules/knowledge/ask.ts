import { getBusiness } from '@/modules/business/service.js';
import { getAssistant } from '@/modules/assistant/service.js';
import { getActiveEmbeddingInstance, getActiveGenerationInstance } from '@/modules/apps/service.js';
import { searchKnowledge } from '@/modules/knowledge/search.js';
import { getKbMinSimilarity, getKbTopK } from '@/modules/knowledge/service.js';
import { buildResponsePrompt, matchToResponseHit } from '@/modules/knowledge/answer.js';
import { detectTextLanguage, translateText } from '@/core/pipeline.js';
import { logger } from '@/core/logger.js';

/**
 * "Ask Jane" — the KB test sandbox backend. Mirrors the live chat path
 * (same embedding → retrieval → generation, same stored strictness + top-K,
 * same response prompt, same language handling), minus the conversation
 * plumbing. Emits progress events so the UI can show phases and render
 * matches before the answer.
 *
 * Language: like live chat, a non-default-language question is translated to
 * the system/default language before embedding (so retrieval runs in the KB's
 * language), the answer is generated in the default language, then translated
 * back to the asker's language. Detection + translation reuse the pipeline's
 * `detectTextLanguage` / `translateText` (no duplicated prompts or routing).
 */

/** Same language up to the primary subtag ('en' ≈ 'en-US'). */
function sameLanguage(a: string, b: string): boolean {
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

export interface AskMatch {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  score: number;
}

export type AskEvent =
  | {
      type: 'phase';
      phase: 'translating_question' | 'embedding' | 'searching' | 'generating' | 'translating_answer';
    }
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

  const defaultLang = getBusiness().defaultLanguage;

  // Mirror live chat: detect the asker's language and translate the question
  // into the system/default language before embedding, so retrieval runs in
  // the same language the KB is embedded in. Falls back to the original text
  // if detection/translation is unavailable (no generation app, or failure).
  const detected = await detectTextLanguage(question);
  const foreign = !!detected && !sameLanguage(detected, defaultLang);
  let searchText = question;
  if (foreign && detected) {
    await emit({ type: 'phase', phase: 'translating_question' });
    const translated = await translateText(question, detected, defaultLang);
    if (translated) searchText = translated;
  }

  // Deliver outbound text (answer / fallback) in the asker's language —
  // generation always happens in the default language, this is the
  // translateOutbound equivalent. Surfaces the same 'translating' phase.
  const localize = async (text: string): Promise<string> => {
    if (!foreign || !detected) return text;
    await emit({ type: 'phase', phase: 'translating_answer' });
    return (await translateText(text, defaultLang, detected)) ?? text;
  };

  await emit({ type: 'phase', phase: 'embedding' });
  let vector: readonly number[] | undefined;
  try {
    const result = await embedding.embed({ texts: [searchText] });
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
    await emit({ type: 'answer', text: await localize(getAssistant().fallback.trim()) });
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
  const prompt = buildResponsePrompt(hits.map(matchToResponseHit), defaultLang);
  try {
    const result = await generation.generate({
      messages: [
        { role: 'system', content: prompt },
        // Use the system-language question so the model reasons in the same
        // language as the KB and the prompt directive.
        { role: 'user', content: searchText },
      ],
      modelTier: 'reasoning',
      purpose: 'response_generation',
    });
    await emit({ type: 'answer', text: await localize(result.content) });
  } catch (err) {
    logger.warn({ err }, 'kb ask: generation failed');
    await emit({ type: 'error', reason: 'generation_failed' });
    return;
  }

  await emit({ type: 'done' });
}
