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
  conversationId?: string | undefined;
  /** Source channel */
  channel: ChannelType;
  /** Channel-specific identifier (phone, email, session ID) */
  channelId: string;
  /** Channel's message ID (e.g., WhatsApp message ID) */
  channelMessageId?: string | undefined;
  /** Message content */
  content: string;
  /** Content type */
  contentType: ContentType;
  /** When the message was sent */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Original channel payload for reference */
  raw?: unknown;
}

/**
 * Outbound message from the pipeline
 */
export interface OutboundMessage {
  /** Target conversation */
  conversationId: string;
  /** Message content */
  content: string;
  /** Content type */
  contentType: ContentType;
  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
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
  detectedLanguage?: string | undefined;
  translatedContent?: string | undefined;
}
