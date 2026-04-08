/**
 * Conversation Types
 *
 * Type definitions for conversation management.
 */

import type { ChannelType } from './channel.js';

// Single source of truth in @jack/shared — imported for local use and re-exported
// so existing imports are unchanged.
import type { ConversationState } from '@jack/shared';
export type { ConversationState } from '@jack/shared';

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
  taskCount: number;
  guestLanguage?: string | null;
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
  guestId?: string | undefined;
  reservationId?: string | null | undefined;
  currentIntent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  guestLanguage?: string | undefined;
  /** Only used when state === 'closed' to populate the CONVERSATION_CLOSED event reason */
  _closeReason?: 'timeout' | 'staff_resolved' | 'guest_satisfied' | undefined;
}
