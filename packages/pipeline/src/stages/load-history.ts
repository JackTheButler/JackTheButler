/**
 * loadHistory — populates `ctx.history` with recent conversation turns,
 * used by the classifier (context-aware classification) and the responder
 * (continuity in replies).
 *
 * Runs *before* `saveInboundMessage` so the history contains only prior
 * turns, not the current inbound.
 *
 * @module stages/load-history
 */

import type { Stage } from '../core/pipeline.js';

/** How many past turns to load. Reasonable default for context-aware LLM calls. */
const DEFAULT_HISTORY_LIMIT = 10;

export const loadHistory: Stage = async (ctx, env) => {
  if (!ctx.conversation) return;

  ctx.history = await env.services.conversation.getRecentMessages(
    ctx.conversation.id,
    DEFAULT_HISTORY_LIMIT,
  );
};
