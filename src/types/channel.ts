/**
 * Channel Types
 *
 * Communication channel definitions.
 */

// Single source of truth in @jack/shared — imported for local use and re-exported
// so existing imports are unchanged.
import type { ChannelType } from '@jack/shared';
export type { ChannelType } from '@jack/shared';

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
 * Message payload for sending via a channel
 */
export interface ChannelMessagePayload {
  content: string;
  contentType: ContentType;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Channel adapter interface
 *
 * Adapters handle sending and receiving messages for a specific channel.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;

  /**
   * Send a message to a recipient
   */
  send(to: string, message: ChannelMessagePayload): Promise<SendResult>;
}
