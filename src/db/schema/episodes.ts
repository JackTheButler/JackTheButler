import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { conversations } from './conversations.js';
import { staff } from './staff.js';

/**
 * Per-episode ("case") analytics projection, rebuilt incrementally from
 * `conversation_events` by the hourly job. Only *finalized* episodes live here:
 * an episode is materialized once it has been closed for longer than the 24h
 * reopen window (a return within that window resumes the same episode, so a
 * close isn't final until the window passes). Open/provisional episodes aren't
 * stored — live queue numbers come from the current-state columns instead.
 *
 * Each row is written once and never changes, so the table can always be
 * regenerated from the log. `id` is the `episodeId` carried on the events.
 */
export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
    closedAt: integer('closed_at', { mode: 'timestamp' }).notNull(),
    /** Did this episode start the conversation, or resume a closed one (after
     *  the reopen window)? Drives the reopen/recurrence metric. */
    openedVia: text('opened_via', { enum: ['new', 'reopen'] }).notNull(),
    /** First human reply within the episode; null when AI handled it alone.
     *  first-response time = firstResponseAt − openedAt. */
    firstResponseAt: integer('first_response_at', { mode: 'timestamp' }),
    firstResponseAgentId: text('first_response_agent_id').references(() => staff.id),
    /** Agent who closed it (manual closes only); null for inactivity auto-close.
     *  Drives "resolved today by agent". */
    closedByAgentId: text('closed_by_agent_id').references(() => staff.id),
    /** A human took over at least once during the episode. */
    handedOff: integer('handed_off', { mode: 'boolean' }).notNull().default(false),
    /** Closed with no takeover and no escalation — Jane handled the whole case. */
    aiDeflected: integer('ai_deflected', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    // Every time-range analytic filters on closedAt.
    closedAtIdx: index('episodes_closed_at_idx').on(t.closedAt),
    // "Resolved today by agent" and per-agent breakdowns.
    closedByIdx: index('episodes_closed_by_idx').on(t.closedByAgentId, t.closedAt),
    conversationIdx: index('episodes_conversation_idx').on(t.conversationId),
  }),
);

export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
