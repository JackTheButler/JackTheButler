/**
 * Conversation Types
 *
 * Type definitions for conversation management.
 */

import type { ChannelType } from './channel.js';

/**
 * Conversation states
 */
export type ConversationState = 'new' | 'active' | 'escalated' | 'resolved' | 'closed';

/**
 * Conversation summary for lists
 */
export interface ConversationSummary {
  id: string;
  channelType: ChannelType;
  channelId: string;
  state: ConversationState;
  guestId?: string | null;
  guestName?: string;
  assignedTo?: string | null;
  assignedName?: string;
  currentIntent?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  createdAt: string;
}

/**
 * Full conversation details
 */
export interface ConversationDetails extends ConversationSummary {
  reservationId?: string | null;
  metadata: Record<string, unknown>;
  resolvedAt?: string | null;
  updatedAt: string;
}

/**
 * Input for updating a conversation
 */
export interface UpdateConversationInput {
  state?: ConversationState | undefined;
  assignedTo?: string | null | undefined;
  currentIntent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}
