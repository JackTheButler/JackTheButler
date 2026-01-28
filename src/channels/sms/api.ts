/**
 * Twilio SMS API Client
 *
 * Wrapper around Twilio SDK for sending SMS messages.
 */

import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message.js';
import { loadConfig } from '@/config/index.js';
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
 * Cached API instance
 */
let cachedAPI: TwilioAPI | null = null;

/**
 * Get the Twilio API client
 */
export function getTwilioAPI(): TwilioAPI | null {
  if (cachedAPI) {
    return cachedAPI;
  }

  const config = loadConfig();

  if (!config.sms.accountSid || !config.sms.authToken || !config.sms.phoneNumber) {
    log.debug('Twilio SMS not configured');
    return null;
  }

  cachedAPI = new TwilioAPI(
    config.sms.accountSid,
    config.sms.authToken,
    config.sms.phoneNumber
  );

  return cachedAPI;
}

/**
 * Reset cached API (for testing)
 */
export function resetTwilioAPI(): void {
  cachedAPI = null;
}
