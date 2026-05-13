/**
 * Channel Types
 *
 * Single source of truth in @jackthebutler/shared — re-exported so existing imports are unchanged.
 */
export type { ChannelType, ContentType, SendResult } from '@jackthebutler/shared';

/**
 * Message payload for sending via a channel
 */
export interface ChannelMessagePayload {
  content: string;
  contentType: import('@jackthebutler/shared').ContentType;
  metadata?: Record<string, unknown> | undefined;
}
