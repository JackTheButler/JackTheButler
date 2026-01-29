/**
 * WhatsApp Channel Adapter (Legacy)
 *
 * @deprecated Use extension registry instead. Configure WhatsApp via dashboard UI.
 * This adapter is kept for reference but always returns null.
 * All WhatsApp functionality is now handled via src/extensions/channels/whatsapp/
 */

import type { ChannelAdapter, SendResult, ChannelMessagePayload } from '@/types/channel.js';
import type { WebhookMessage, WebhookContact, WebhookStatus } from '@/gateway/routes/webhooks/whatsapp.js';
import { WhatsAppAPI } from './api.js';
import { parseWhatsAppMessage, isSupportedMessageType } from './parser.js';
import { MessageProcessor } from '@/pipeline/processor.js';
import { createLogger } from '@/utils/logger.js';
import { db } from '@/db/index.js';
import { messages } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

const log = createLogger('whatsapp');

/**
 * WhatsApp channel adapter
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;
  private api: WhatsAppAPI;
  private processor: MessageProcessor;

  constructor(api: WhatsAppAPI, processor: MessageProcessor) {
    this.api = api;
    this.processor = processor;
    log.info('WhatsApp adapter initialized');
  }

  /**
   * Handle an incoming WhatsApp message
   */
  async handleIncomingMessage(
    message: WebhookMessage,
    contact?: WebhookContact
  ): Promise<void> {
    log.info(
      {
        messageId: message.id,
        from: message.from,
        type: message.type,
      },
      'Processing incoming message'
    );

    // Mark message as read
    await this.api.markAsRead(message.id);

    // Only process text messages for now
    if (!isSupportedMessageType(message.type)) {
      log.info({ type: message.type }, 'Unsupported message type, sending fallback');
      await this.api.sendText(
        message.from,
        "I can only process text messages at the moment. Please send your request as text."
      );
      return;
    }

    // Parse the message
    const inbound = parseWhatsAppMessage(message, contact);

    try {
      // Process through pipeline
      const response = await this.processor.process(inbound);

      // Send response
      await this.send(message.from, {
        content: response.content,
        contentType: 'text',
        metadata: response.metadata,
      });
    } catch (error) {
      log.error({ err: error, messageId: message.id }, 'Failed to process message');

      // Send error response
      await this.api.sendText(
        message.from,
        "I'm sorry, I encountered an error processing your request. Please try again or contact the front desk for assistance."
      );
    }
  }

  /**
   * Handle a status update for a sent message
   */
  async handleStatusUpdate(status: WebhookStatus): Promise<void> {
    log.debug(
      {
        messageId: status.id,
        status: status.status,
      },
      'Updating message status'
    );

    // Update message status in database
    try {
      await db
        .update(messages)
        .set({
          deliveryStatus: status.status,
          deliveryError: status.errors?.[0]?.message,
        })
        .where(eq(messages.channelMessageId, status.id));
    } catch (error) {
      log.warn({ err: error, messageId: status.id }, 'Failed to update message status');
    }
  }

  /**
   * Send a message to a WhatsApp user
   */
  async send(to: string, message: ChannelMessagePayload): Promise<SendResult> {
    const result = await this.api.sendText(to, message.content);

    return {
      channelMessageId: result.messages[0]?.id,
      status: 'sent',
    };
  }
}

/**
 * Get the WhatsApp adapter
 *
 * @deprecated Always returns null. Use extension registry instead.
 * Configure WhatsApp via the dashboard UI.
 */
export function getWhatsAppAdapter(): WhatsAppAdapter | null {
  log.debug('Legacy WhatsApp adapter disabled. Use extension registry.');
  return null;
}

/**
 * Reset cached adapter (for testing)
 * @deprecated No longer needed
 */
export function resetWhatsAppAdapter(): void {
  // No-op
}

export { WhatsAppAPI, getWhatsAppAPI } from './api.js';
export { verifySignature } from './security.js';
export { parseWhatsAppMessage, isSupportedMessageType } from './parser.js';
