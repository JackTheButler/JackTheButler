import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { conversations } from './conversations.js';
import { staff } from './staff.js';

/**
 * Append-only audit of conversation lifecycle transitions — the source of truth
 * for analytics. Rows are never updated or deleted. The mutable columns on
 * `conversations` (status/mode/assignedAgentId/needsHuman/currentEpisodeId)
 * stay the fast current-state cache for the inbox; this captures the *history*
 * they overwrite.
 *
 * `episodeId` groups events into one open→close cycle (a "case"). It's a logical
 * id minted at episode open and carried by every later event in that episode —
 * NOT a foreign key, since the `episodes` projection is built afterwards and its
 * row won't exist yet.
 *
 * `actorAgentId` is the acting agent when one acted; null means customer/ai/
 * system did it (the `type` implies which). On a `closed` event: set ⇒ manual
 * close, null ⇒ inactivity auto-close.
 */
export const conversationEvents = sqliteTable(
  'conversation_events',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    episodeId: text('episode_id').notNull(),
    type: text('type', {
      enum: ['episode_opened', 'escalated', 'taken_over', 'handed_back', 'closed', 'reopened'],
    }).notNull(),
    actorAgentId: text('actor_agent_id').references(() => staff.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    // Per-conversation timeline.
    conversationIdx: index('conv_events_conversation_created_idx').on(
      t.conversationId,
      t.createdAt,
    ),
    // Gather one episode's events when materializing it.
    episodeIdx: index('conv_events_episode_idx').on(t.episodeId),
    // Incremental projection scan: "closed events since the watermark".
    typeCreatedIdx: index('conv_events_type_created_idx').on(t.type, t.createdAt),
  }),
);

export type ConversationEvent = typeof conversationEvents.$inferSelect;
export type NewConversationEvent = typeof conversationEvents.$inferInsert;
