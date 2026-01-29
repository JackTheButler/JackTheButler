/**
 * Twilio SMS API Client
 *
 * Wrapper around Twilio SDK for sending SMS messages.
 * Note: TwilioAPI class can be instantiated directly with config.
 * The getTwilioAPI() function is deprecated - use extension registry instead.
 */

import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('sms:api');

/**
 * Twilio API client wrapper
 */
export class TwilioAPI {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = phoneNumber;
    log.info({ from: phoneNumber }, 'Twilio API client initialized');
  }

  /**
   * Send an SMS message
   */
  async sendMessage(to: string, body: string): Promise<MessageInstance> {
    log.debug({ to, bodyLength: body.length }, 'Sending SMS');

    const message = await this.client.messages.create({
      to,
      from: this.fromNumber,
      body,
    });

    log.info({ sid: message.sid, to, status: message.status }, 'SMS sent');
    return message;
  }

  /**
   * Get message status
   */
  async getMessageStatus(sid: string): Promise<MessageInstance> {
    return this.client.messages(sid).fetch();
  }
}

/**
 * Get the Twilio API client
 *
 * @deprecated Always returns null. Use extension registry instead.
 * Configure SMS via the dashboard UI, then access via extension instance.
 */
export function getTwilioAPI(): TwilioAPI | null {
  log.debug('Legacy getTwilioAPI disabled. Use extension registry.');
  return null;
}

/**
 * Reset cached API (for testing)
 * @deprecated No longer needed
 */
export function resetTwilioAPI(): void {
  // No-op
}
