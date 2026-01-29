/**
 * SMS Channel Adapter (Twilio) - Legacy
 *
 * @deprecated Use extension registry instead. Configure SMS via dashboard UI.
 * All SMS functionality is now handled via src/extensions/channels/sms/
 */

import type { ChannelAdapter, SendResult, ChannelMessagePayload } from '@/types/channel.js';
import { TwilioAPI } from './api.js';
import { MessageProcessor } from '@/pipeline/processor.js';
import { createLogger } from '@/utils/logger.js';
import { db } from '@/db/index.js';
import { messages } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

const log = createLogger('sms');

/**
 * Twilio webhook body structure
 */
export interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus?: string;
  // Media fields (if NumMedia > 0)
  MediaUrl0?: string;
  MediaContentType0?: string;
}

/**
 * Twilio status callback body
 */
export interface TwilioStatusBody {
  MessageSid: string;
  MessageStatus: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

/**
 * SMS channel adapter using Twilio
 */
export class SMSAdapter implements ChannelAdapter {
  readonly channel = 'sms' as const;
  private api: TwilioAPI;
  private processor: MessageProcessor;

  constructor(api: TwilioAPI, processor: MessageProcessor) {
    this.api = api;
    this.processor = processor;
    log.info('SMS adapter initialized');
  }

  /**
   * Handle an incoming SMS message from Twilio webhook
   */
  async handleIncomingMessage(body: TwilioWebhookBody): Promise<string> {
    log.info(
      {
        messageSid: body.MessageSid,
        from: body.From,
        hasMedia: parseInt(body.NumMedia, 10) > 0,
      },
      'Processing incoming SMS'
    );

    // Only process text messages for now
    if (parseInt(body.NumMedia, 10) > 0) {
      log.info({ numMedia: body.NumMedia }, 'SMS contains media, sending fallback');
      const fallbackResponse = "I can only process text messages at the moment. Please send your request as text.";
      await this.api.sendMessage(body.From, fallbackResponse);
      return fallbackResponse;
    }

    // Create inbound message
    const inbound = {
      id: body.MessageSid,
      channel: 'sms' as const,
      channelId: body.From,
      content: body.Body,
      contentType: 'text' as const,
      timestamp: new Date(),
      raw: body,
    };

    try {
      // Process through pipeline
      const response = await this.processor.process(inbound);

      // Send response
      await this.send(body.From, {
        content: response.content,
        contentType: 'text',
        metadata: response.metadata,
      });

      return response.content;
    } catch (error) {
      log.error({ err: error, messageSid: body.MessageSid }, 'Failed to process SMS');

      // Send error response
      const errorMessage = "I'm sorry, I encountered an error processing your request. Please try again or contact the front desk for assistance.";
      await this.api.sendMessage(body.From, errorMessage);
      return errorMessage;
    }
  }

  /**
   * Handle a status callback from Twilio
   */
  async handleStatusCallback(body: TwilioStatusBody): Promise<void> {
    log.debug(
      {
        messageSid: body.MessageSid,
        status: body.MessageStatus,
      },
      'SMS status update'
    );

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      queued: 'pending',
      sending: 'pending',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'failed',
      failed: 'failed',
    };

    const deliveryStatus = statusMap[body.MessageStatus] || 'pending';

    // Update message status in database
    try {
      await db
        .update(messages)
        .set({
          deliveryStatus,
          deliveryError: body.ErrorMessage,
        })
        .where(eq(messages.channelMessageId, body.MessageSid));
    } catch (error) {
      log.warn({ err: error, messageSid: body.MessageSid }, 'Failed to update SMS status');
    }
  }

  /**
   * Send an SMS message
   */
  async send(to: string, message: ChannelMessagePayload): Promise<SendResult> {
    const result = await this.api.sendMessage(to, message.content);

    return {
      channelMessageId: result.sid,
      status: 'sent',
    };
  }
}

/**
 * Get the SMS adapter
 *
 * @deprecated Always returns null. Use extension registry instead.
 * Configure SMS via the dashboard UI.
 */
export function getSMSAdapter(): SMSAdapter | null {
  log.debug('Legacy SMS adapter disabled. Use extension registry.');
  return null;
}

/**
 * Reset cached adapter (for testing)
 * @deprecated No longer needed
 */
export function resetSMSAdapter(): void {
  // No-op
}

export { TwilioAPI, getTwilioAPI, resetTwilioAPI } from './api.js';
export { verifyTwilioSignature } from './security.js';
