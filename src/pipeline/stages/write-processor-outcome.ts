/**
 * writeProcessorOutcome — Butler-side stage. Final stage in the success
 * path: writes the per-run `processor.outcome` row to the activity_log.
 *
 * Consumed by:
 *   - `src/gateway/routes/system.ts` — counts successful pipeline runs
 *     for the System Health "successful runs" metric.
 *   - `src/services/analytics.ts` — pipeline-activity charts.
 *   - Dashboard "Recent Activity" feed.
 *
 * Mirrors the success-path payload shape of the legacy
 * `pipeline-legacy/index.ts:75-92` so analytics queries don't need
 * adjusting. Fields tied to disabled stages (`escalated`, `taskCreated`,
 * `approvalId`, `approvalReason`) are omitted until those stages return.
 *
 * The failure-path equivalent is emitted by the outer `processMessage`
 * wrapper's `catch` block — that path has access to `err.ctx`.
 *
 * @module pipeline/stages/write-processor-outcome
 */

import { writeActivityLog } from '@/services/activity-log.js';
import type { Stage } from '@thebutler/pipeline';
import type { ButlerContext } from '../context.js';

/**
 * Build the per-run details payload shared between the success-path stage
 * and the failure-path wrapper. Only includes fields whose ctx source is
 * set, so a row written mid-failure shows whatever was reached.
 *
 * The `knowledge` and `memory` arrays carry the matched items themselves
 * — `knowledge.length` is the hit count, `knowledge[0]` is the top match,
 * etc. — so the row contains the full debugging context of the run in one
 * place without needing to join to a separate knowledge/memory log table.
 */
export function buildOutcomeDetails(ctx: ButlerContext): Record<string, unknown> {
  const suggestedAction = ctx.aiResponse?.metadata?.suggestedAction as string | undefined;
  const quickReplies = ctx.aiResponse?.metadata?.quickReplies;

  return {
    intent: ctx.classification?.intent,
    confidence: ctx.classification?.confidence,
    detectedLanguage: ctx.inboundLanguage,
    entityId: ctx.entity?.id ?? null,
    ...(ctx.savedInboundId ? { savedInboundId: ctx.savedInboundId } : {}),
    ...(ctx.outbound?.id ? { outboundId: ctx.outbound.id } : {}),
    historyCount: ctx.history?.length ?? 0,
    ...(suggestedAction ? { suggestedAction } : {}),
    hasQuickReplies: Boolean(quickReplies),
    ...(ctx.outbound?.content !== undefined ? { responseLength: ctx.outbound.content.length } : {}),
    ...(ctx.taskCreated ? { taskCreated: true, taskId: ctx.taskId } : {}),
    knowledge: (ctx.knowledgeHits ?? []).map((k) => ({
      title: k.title,
      similarity: k.similarity,
      content: k.content,
    })),
    memory: (ctx.memoryHits ?? []).map((m) => ({
      key: m.key,
      value: m.value,
    })),
  };
}

export const writeProcessorOutcome: Stage<ButlerContext> = async (ctx) => {
  if (!ctx.conversation || !ctx.outbound) return;

  const details: Record<string, unknown> = {
    actionTaken: 'responded',
    ...buildOutcomeDetails(ctx),
  };

  try {
    writeActivityLog(
      ctx.inbound.channel,
      'processor.outcome',
      'success',
      ctx.conversation.id,
      undefined,
      Date.now() - ctx.startTime,
      details,
    );
  } catch {
    // Never let activity-log write affect the response. The legacy
    // pipeline also swallowed activity-log errors in its finally block.
  }
};
