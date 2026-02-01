/**
 * Channel Adapters
 *
 * Adapters that translate between external messaging platforms
 * and Jack's internal message format.
 *
 * Channels:
 * - Web Chat (WebSocket) - Direct adapter
 *
 * Note: WhatsApp, SMS, and Email are handled via extension registry.
 * Configure them in Settings > Integrations.
 *
 * @see docs/03-architecture/c4-components/channel-adapters.md
 */

export * from './types.js';
export { WebChatAdapter, webChatAdapter, handleChatConnection, getSessionCount } from './webchat/index.js';
