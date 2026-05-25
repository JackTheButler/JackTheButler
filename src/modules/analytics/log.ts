import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { conversationEvents } from '@/db/schema/index.js';

/**
 * Lifecycle event writer. The transition functions (ingest, takeover, close, …)
 * call `appendConversationEvent` to record what happened; the analytics
 * projection is built from these rows. Append-only — never updated or deleted.
 */

export type ConversationEventType =
  | 'episode_opened'
  | 'escalated'
  | 'taken_over'
  | 'handed_back'
  | 'closed'
  | 'reopened';

export function appendConversationEvent(input: {
  conversationId: string;
  episodeId: string;
  type: ConversationEventType;
  /** The acting agent, when one acted; null for customer/ai/system. */
  actorAgentId?: string | null;
  /** Defaults to now; pass the transaction's `now` to keep events aligned with
   *  the conversation row they describe. */
  at?: Date;
}): void {
  db.insert(conversationEvents)
    .values({
      id: randomUUID(),
      conversationId: input.conversationId,
      episodeId: input.episodeId,
      type: input.type,
      actorAgentId: input.actorAgentId ?? null,
      createdAt: input.at ?? new Date(),
    })
    .run();
}

/** When the conversation's most recent episode was closed, or null if never.
 *  Used to apply the reopen window (resume vs. start a new episode). */
export function lastEpisodeCloseAt(conversationId: string): Date | null {
  const row = db
    .select({ createdAt: conversationEvents.createdAt })
    .from(conversationEvents)
    .where(
      and(
        eq(conversationEvents.conversationId, conversationId),
        eq(conversationEvents.type, 'closed'),
      ),
    )
    .orderBy(desc(conversationEvents.createdAt))
    .get();
  return row?.createdAt ?? null;
}
