/**
 * Channel Types
 *
 * Single source of truth in @jack/shared — re-exported so existing imports are unchanged.
 */
export type { ChannelType, ContentType, SendResult } from '@jack/shared';

/**
 * Message payload for sending via a channel
 */
export interface ChannelMessagePayload {
  content: string;
  contentType: import('@jack/shared').ContentType;
  metadata?: Record<string, unknown> | undefined;
}
