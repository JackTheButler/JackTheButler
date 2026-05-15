/**
 * ConversationProvider — conversation persistence.
 *
 * The pipeline calls this to:
 *   - find or create a conversation when an inbound arrives
 *   - append the inbound message to the conversation
 *   - append the outbound response to the conversation
 *   - fetch recent history for context-aware classification and responder
 *
 * @module services/conversation
 */

import type { Conversation, Message } from '../types/conversation.js';

export interface ConversationProvider {
  /**
   * Find or create a conversation for this channel + sender.
   * Pass `entityId` when the sender is already resolved to an entity;
   * `null` when the channel can't identify them yet.
   */
  findOrCreate(channel: string, channelId: string, entityId: string | null): Promise<Conversation>;

  /**
   * Look up a conversation by id. Used when the inbound carries an
   * explicit `conversationId` (e.g. webchat sessions, Slack threads).
   */
  findById(id: string): Promise<Conversation | null>;

  /** Append a message to a conversation. Returns the persisted message's id. */
  addMessage(conversationId: string, message: Message): Promise<{ readonly id: string }>;

  /**
   * Fetch recent message turns, newest last. Used by classifier and
   * responder for context-aware processing.
   */
  getRecentMessages(conversationId: string, limit: number): Promise<readonly Message[]>;

  /**
   * Persist the conversation's user-side language (BCP-47). Called by
   * `detectLanguage` after a successful detection so subsequent turns
   * and outside consumers (UI, staff replies, etc.) can read the same
   * value via `Conversation.language`.
   *
   * Implementations that don't track per-conversation language may
   * no-op.
   */
  setLanguage(conversationId: string, language: string): Promise<void>;
}
