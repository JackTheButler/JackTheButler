/**
 * Twilio SMS Provider
 *
 * Twilio SMS API integration for the integrations layer.
 */

import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message.js';
import type { BaseProvider, ConnectionTestResult } from '@/integrations/core/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('integrations:channels:sms:twilio');

/**
 * Twilio provider configuration
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

/**
 * Twilio SMS provider implementation
 */
export class TwilioProvider implements BaseProvider {
  readonly id = 'twilio';
  private client: twilio.Twilio;
  private phoneNumber: string;
  private accountSid: string;

  constructor(config: TwilioConfig) {
    if (!config.accountSid || !config.authToken || !config.phoneNumber) {
      throw new Error('Twilio provider requires accountSid, authToken, and phoneNumber');
    }

    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
    this.accountSid = config.accountSid;

    log.info({ from: this.phoneNumber }, 'Twilio provider initialized');
  }

  /**
   * Test connection to Twilio API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Fetch account info to verify credentials
      const account = await this.client.api.accounts(this.accountSid).fetch();
      const latencyMs = Date.now() - startTime;

      // Also verify the phone number exists
      let phoneNumberDetails;
      try {
        const incomingNumbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: this.phoneNumber });
        phoneNumberDetails = incomingNumbers[0];
      } catch {
        // Phone number lookup failed, but account works
      }

      return {
        success: true,
        message: 'Successfully connected to Twilio API',
        details: {
          accountSid: this.accountSid,
          accountName: account.friendlyName,
          accountStatus: account.status,
          phoneNumber: this.phoneNumber,
          phoneNumberSid: phoneNumberDetails?.sid,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Twilio connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        latencyMs,
      };
    }
  }

  /**
   * Send an SMS message
   */
  async sendMessage(to: string, body: string): Promise<MessageInstance> {
    log.debug({ to, bodyLength: body.length }, 'Sending SMS');

    const message = await this.client.messages.create({
      to,
      from: this.phoneNumber,
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

  /**
   * Get the configured phone number
   */
  getPhoneNumber(): string {
    return this.phoneNumber;
  }
}

/**
 * Create a Twilio provider instance
 */
export function createTwilioProvider(config: TwilioConfig): TwilioProvider {
  return new TwilioProvider(config);
}
