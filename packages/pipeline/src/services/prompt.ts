/**
 * PromptProvider — every LLM prompt a domain needs.
 *
 * Four responsibilities, each returning a system prompt string:
 *   1. `classifier(intents)` — intent classification
 *   2. `responder(ctx, env)` — response generation, reading whatever it needs
 *      from the context and environment (may be async, e.g. to fetch domain
 *      state that isn't on `ctx`)
 *   3. `detector()` — language detection on the inbound
 *   4. `translator(from, to)` — translation between two languages
 *
 * `responder` is the only context-aware method by design — its prompt
 * draws on many fields and may need async work; the other three are
 * narrow prompts whose explicit inputs are self-documenting.
 *
 * `PromptProvider` is generic over `TCtx` so domain-extended contexts
 * (e.g. `ButlerContext` with `verification`) are visible to `responder`
 * with full type safety.
 *
 * @module services/prompt
 */

import type { MessageContext } from '../core/context.js';
import type { Env } from '../core/pipeline.js';
import type { Intent } from '../types/intent.js';

export interface PromptProvider<TCtx extends MessageContext = MessageContext> {
  /**
   * System prompt for the intent classifier. The intents are passed in so
   * the prompt can render the list inline; different domains may format
   * it differently (bulleted, JSON, few-shot) and frame it differently
   * ("You are an intent classifier for a hotel concierge…").
   */
  classifier(intents: readonly Intent[]): string;

  /**
   * System prompt for the responder. Reads ctx (entity, intent,
   * knowledgeHits, memoryHits, plus any domain-specific extensions on
   * `TCtx`) and env (system language, intent catalog, services for
   * domain lookups). The pipeline owns the LLM call itself — the domain
   * only owns the prompt text.
   *
   * May be async — e.g. to fetch hotel profile, channel state, or other
   * domain data not carried on `ctx`.
   */
  responder(ctx: TCtx, env: Env<TCtx>): string | Promise<string>;

  /**
   * System prompt for language detection on the inbound. The `detect-language`
   * stage calls `services.ai.complete` with this as the system message and
   * the inbound content as the user message, expecting a BCP-47 language
   * code in response.
   */
  detector(): string;

  /**
   * System prompt for translating between two languages (BCP-47 codes).
   * The translate stages call `services.ai.complete` with this as the
   * system message and the text to translate as the user message.
   */
  translator(from: string, to: string): string;
}
