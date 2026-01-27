/**
 * Channel Types
 *
 * Communication channel definitions.
 */

/**
 * Supported messaging channels
 */
export type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';

/**
 * Content type for messages
 */
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location';

/**
 * Result of sending a message
 */
export interface SendResult {
  success: boolean;
  channelMessageId?: string;
  error?: string;
}
