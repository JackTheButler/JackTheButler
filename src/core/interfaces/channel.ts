/**
 * Channel Adapter Interface
 *
 * Defines the contract all channel adapters must implement.
 * This is part of the kernel - business logic depends on this interface,
 * not on concrete implementations.
 *
 * @module core/interfaces/channel
 */

import type { ChannelType, ContentType, SendResult } from '@/types/index.js';

/**
 * Inbound message from a channel (normalized)
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
  /** Channel-specific recipient identifier (phone number, session ID, etc.) */
  channelId: string;
  /** Message content */
  content: string;
  /** Content type */
  contentType: ContentType;
  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Channel adapter interface
 *
 * All channel implementations must follow this contract.
 * Adapters handle sending and receiving messages for a specific channel.
 */
export interface ChannelAdapter {
  /** Unique adapter identifier */
  readonly id: string;

  /** Channel type this adapter handles */
  readonly channel: ChannelType;

  /**
   * Send a message through this channel
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * Parse raw incoming data into a structured message.
   * Optional — webhook handlers may parse manually instead.
   */
  parseIncoming?(raw: unknown): Promise<InboundMessage>;

  /**
   * Verify webhook signature (optional)
   */
  verifySignature?(payload: unknown, signature: string): boolean;
}

// Re-export types from @/types for convenience
export type { ChannelType, ContentType, SendResult } from '@/types/index.js';
