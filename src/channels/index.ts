/**
 * Channel Adapters
 *
 * Adapters that translate between external messaging platforms
 * and Jack's internal message format.
 *
 * Channels:
 * - Web Chat (WebSocket) - Phase 3
 * - WhatsApp Business API - Phase 5
 * - Twilio (SMS) - Phase 5
 * - Email (SMTP/IMAP) - Phase 5
 *
 * @see docs/03-architecture/c4-components/channel-adapters.md
 */

export * from './types.js';
export { WebChatAdapter, webChatAdapter, handleChatConnection, getSessionCount } from './webchat/index.js';
