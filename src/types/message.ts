/**
 * Message Types
 *
 * Type definitions for messages flowing through the system.
 */

import type { ChannelType, ContentType } from './channel.js';

/**
 * Inbound message from a channel
 */
export interface InboundMessage {
  /** Unique message ID */
  id: string;
  /** Existing conversation ID if known */
  conversationId?: string;
  /** Source channel */
  channel: ChannelType;
  /** Channel-specific identifier (phone, email, session ID) */
  channelId: string;
  /** Message content */
  content: string;
  /** Content type */
  contentType: ContentType;
  /** When the message was sent */
  timestamp: Date;
  /** Original channel payload for reference */
  raw?: unknown;
}

/**
 * Outbound message to send
 */
export interface OutboundMessage {
  /** Target conversation */
  conversationId: string;
  /** Message content */
  content: string;
  /** Content type */
  contentType: ContentType;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Message direction
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Message sender type
 */
export type SenderType = 'guest' | 'ai' | 'staff' | 'system';

/**
 * Message delivery status
 */
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Input for creating a new message
 */
export interface CreateMessageInput {
  direction: MessageDirection;
  senderType: SenderType;
  senderId?: string | undefined;
  content: string;
  contentType: ContentType;
  channelMessageId?: string | undefined;
  intent?: string | undefined;
  confidence?: number | undefined;
  entities?: unknown[] | undefined;
}
