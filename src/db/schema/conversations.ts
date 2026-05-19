import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { customers } from './customers.js';
import { staff } from './staff.js';

/**
 * A support thread. `mode` is the human-takeover flag: `ai` (the pipeline
 * may answer — Stage 6) vs `human` (an agent took over; AI pauses).
 *
 * `customerId` is **nullable**: anonymous webchat conversations have no
 * customer. Resolution/continuity uses `(channel, channelExternalId)` —
 * the webchat visitor id, WhatsApp phone, Telegram id, etc.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    ref: integer('ref').notNull().unique(),
    channel: text('channel').notNull().default('webchat'),
    channelExternalId: text('channel_external_id').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    mode: text('mode', { enum: ['ai', 'human'] })
      .notNull()
      .default('ai'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    assignedAgentId: text('assigned_agent_id').references(() => staff.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    lastMessageAtIdx: index('conversations_last_message_at_idx').on(t.lastMessageAt),
    statusIdx: index('conversations_status_idx').on(t.status),
    // One conversation per identity per channel — the continuous-conversation
    // invariant, enforced by the DB.
    channelExternalUnique: uniqueIndex('conversations_channel_external_unique').on(
      t.channel,
      t.channelExternalId,
    ),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
