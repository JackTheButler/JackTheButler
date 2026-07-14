import type { ResponseLength } from '@janetheoperator/shared';
import { getAssistant } from '@/modules/assistant/service.js';
import { getBusiness } from '@/modules/business/service.js';
import type { KnowledgeMatch } from '@/modules/knowledge/search.js';

/**
 * The response-generation system prompt — shared by the live AI pipeline
 * responder and the KB test sandbox, so both answer in the same persona,
 * voice, length, and KB grounding. Keeping it here (not inline in the
 * pipeline) is what guarantees the test reflects real chat behaviour.
 */

/** Verbosity directive injected into the responder prompt. Orthogonal to
 *  tone (voice): controls *how much* the AI says via instruction. */
export const RESPONSE_LENGTH_DIRECTIVE: Record<ResponseLength, string> = {
  brief: 'Length: keep replies brief — 1–2 short sentences, lead with the answer.',
  standard: 'Length: keep replies concise but complete — usually a short paragraph.',
  detailed:
    'Length: give thorough, well-structured replies; use short lists or steps when it helps.',
};

/** What the prompt formats per retrieved entry. */
export interface ResponseHit {
  title: string;
  content: string;
}

/** Domain match → prompt hit (title carries topic+question; content the answer). */
export function matchToResponseHit(m: KnowledgeMatch): ResponseHit {
  return { title: m.topic ? `${m.topic}: ${m.question}` : m.question, content: m.answer };
}

/** Build the system prompt from the assistant persona + business + retrieved
 *  entries. The caller supplies the answer language (the pipeline answers in
 *  the business default language, then translates separately). */
export function buildResponsePrompt(hits: readonly ResponseHit[], systemLanguage: string): string {
  const p = getAssistant();
  const b = getBusiness();
  const businessName = b.name.trim() || 'the business';
  const lines = [
    `You are ${p.name}, the support assistant for ${businessName}.`,
    `Voice: ${p.tone.toLowerCase()}.`,
    RESPONSE_LENGTH_DIRECTIVE[p.responseLength],
  ];
  if (p.instructions.trim()) lines.push(`Additional instructions: ${p.instructions.trim()}`);
  if (p.topicsToAvoid.trim()) {
    lines.push(
      `Decline these topics politely and offer to connect a human: ${p.topicsToAvoid.trim()}.`,
    );
  }

  if (hits.length > 0) {
    lines.push(
      '',
      'Answer using ONLY the knowledge base entries below. Do not use any ' +
        'outside or general knowledge, and never guess or invent details. If ' +
        'the entries do not fully answer the question, reply with exactly: ' +
        `"${p.fallback.trim()}" and offer to connect a human.`,
      ...hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.content}`),
    );
  } else {
    lines.push(
      'You have no relevant entries to answer this question. Do not answer ' +
        `from outside or general knowledge. Reply with exactly: "${p.fallback.trim()}" ` +
        'and offer to connect a human.',
    );
  }

  lines.push('', `Respond in ${systemLanguage}.`);
  return lines.join('\n');
}
