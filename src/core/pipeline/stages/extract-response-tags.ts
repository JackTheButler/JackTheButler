/**
 * extractResponseTags — Butler-side stage.
 *
 * Strips `[ACTION:xxx]` and `[QUICK_REPLIES:opt1|opt2|...]` tags from the
 * AI response and moves their structured form into `aiResponse.metadata`.
 *
 * Why post-LLM tag extraction:
 *   - The system prompt instructs the AI to end its reply with
 *     `[ACTION:action-id]` when the guest wants a webchat-triggered form
 *     (e.g. "verify-reservation"), and with
 *     `[QUICK_REPLIES:a|b|c]` to suggest 2-4 clickable reply options.
 *   - The webchat client reads `metadata.suggestedAction` and
 *     `metadata.quickReplies` to render the corresponding UI.
 *   - The tags themselves are stripped from `content` so the user never
 *     sees the raw markers.
 *
 * Runs after `generateResponse` (where `ctx.aiResponse` is populated) and
 * before `translateOutbound` (so translation operates on tag-free text).
 *
 * Channels other than webchat ignore the metadata; the extraction is
 * cheap and harmless regardless of channel.
 *
 * @module core/pipeline/stages/extract-response-tags
 */

import type { Stage } from '@thebutler/pipeline';
import type { ButlerContext } from '../context.js';

const ACTION_TAG_RE = /\[ACTION:([a-z0-9-]+)\]\s*$/;
const QUICK_REPLY_RE = /\[QUICK_REPLIES:((?:[^|\]]+\|?)+)\]\s*$/;

export const extractResponseTags: Stage<ButlerContext> = async (ctx) => {
  if (!ctx.aiResponse) return;

  let content = ctx.aiResponse.content;
  let suggestedAction: string | undefined;
  let quickReplies: readonly string[] | undefined;

  // Tags are anchored to end-of-string. The AI is instructed not to
  // combine them; if it does, we follow the legacy order (ACTION then
  // QUICK_REPLIES) which only fully extracts both when the AI emits
  // them as `... [QUICK_REPLIES:...] [ACTION:...]`.
  const actionMatch = content.match(ACTION_TAG_RE);
  if (actionMatch?.[1]) {
    suggestedAction = actionMatch[1];
    content = content.replace(ACTION_TAG_RE, '').trimEnd();
  }

  const qrMatch = content.match(QUICK_REPLY_RE);
  if (qrMatch?.[1]) {
    quickReplies = qrMatch[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    content = content.replace(QUICK_REPLY_RE, '').trimEnd();
  }

  if (!suggestedAction && !quickReplies) return;

  ctx.aiResponse = {
    ...ctx.aiResponse,
    content,
    metadata: {
      ...(ctx.aiResponse.metadata ?? {}),
      ...(suggestedAction ? { suggestedAction } : {}),
      ...(quickReplies ? { quickReplies } : {}),
    },
  };
};
