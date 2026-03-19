/**
 * Channel Types
 *
 * Communication channel definitions.
 */

// Single source of truth in @jack/shared — re-exported so existing imports are unchanged.
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

