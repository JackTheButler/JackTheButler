/**
 * Channel types — shared between backend, dashboard, and plugins.
 *
 * @module shared/channel
 */

/**
 * Supported messaging channels
 */
export type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';

/**
 * Content type for messages
 */
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'location';

/**
 * Result of sending a message
 */
export interface SendResult {
  channelMessageId?: string | undefined;
  status: 'sent' | 'failed';
  error?: string | undefined;
}

/**
 * Inbound message from a channel (normalized)
 */
export interface InboundMessage {
  id: string;
  conversationId?: string | undefined;
  channel: ChannelType;
  channelId: string;
  channelMessageId?: string | undefined;
  content: string;
  contentType: ContentType;
  timestamp: Date;
  metadata?: Record<string, unknown> | undefined;
  raw?: unknown;
}

/**
 * Outbound message from the pipeline
 */
export interface OutboundMessage {
  conversationId: string;
  channelId: string;
  content: string;
  contentType: ContentType;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Channel Adapter interface — implement this to build a channel plugin.
 */
export interface ChannelAdapter {
  readonly id: string;
  readonly channel: ChannelType;
  send(message: OutboundMessage): Promise<SendResult>;
  parseIncoming?(raw: unknown): Promise<InboundMessage>;
  verifySignature?(payload: unknown, signature: string): boolean;
}
