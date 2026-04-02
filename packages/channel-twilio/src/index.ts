/**
 * Twilio SMS Provider Extension
 *
 * Twilio SMS API integration for guest messaging.
 *
 * @module extensions/channels/sms/twilio
 */

import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message.js';
import type {
  ChannelAppManifest,
  AppLogger,
  BaseProvider,
  ConnectionTestResult,
  InboundMessage,
  OutboundMessage,
  PluginContext,
  SendResult,
} from '@jack/shared';
import { withLogContext } from '@jack/shared';

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
  readonly channel = 'sms' as const;
  private client: twilio.Twilio;
  private phoneNumber: string;
  private accountSid: string;
  readonly appLog: AppLogger;

  constructor(config: TwilioConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.accountSid || !config.authToken || !config.phoneNumber) {
      throw new Error('Twilio provider requires accountSid, authToken, and phoneNumber');
    }

    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
    this.accountSid = config.accountSid;

    console.info(`Twilio provider initialized: from=${this.phoneNumber}`);
  }

  /**
   * Test connection to Twilio API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Fetch account info to verify credentials
      const account = await this.appLog('connection_test', {}, async () => {
        const result = await this.client.api.accounts(this.accountSid).fetch();
        return withLogContext(result, {
          accountName: result.friendlyName,
          accountStatus: result.status,
        });
      });
      const latencyMs = Date.now() - startTime;

      // Also verify the phone number exists
      let phoneNumberDetails;
      try {
        phoneNumberDetails = await this.appLog('verify_phone_number', { phoneNumber: this.phoneNumber }, async () => {
          const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: this.phoneNumber });
          return numbers[0];
        });
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
      console.error('Twilio connection test failed', error);

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
    const message = await this.appLog('send_sms', { to }, async () => {
      const result = await this.client.messages.create({ to, from: this.phoneNumber, body });
      return withLogContext(result, {
        messageSid: result.sid,
        status: result.status,
      });
    });

    return message;
  }

  /**
   * Send a message via the ChannelAdapter interface
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    await this.sendMessage(message.channelId, message.content);
    return { status: 'sent' };
  }

  /**
   * Get message status
   */
  async getMessageStatus(sid: string): Promise<MessageInstance> {
    return this.appLog('get_message_status', { sid }, () => this.client.messages(sid).fetch());
  }

  /**
   * Parse an inbound Twilio SMS webhook into a normalized InboundMessage.
   * Twilio posts form-encoded fields: From, Body, MessageSid, etc.
   */
  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const data = raw as Record<string, string>;
    return {
      id: data['MessageSid'] ?? crypto.randomUUID(),
      channel: this.channel,
      channelId: data['From'] ?? '',
      channelMessageId: data['MessageSid'],
      content: data['Body'] ?? '',
      contentType: 'text',
      timestamp: new Date(),
      raw,
    };
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
export function createTwilioProvider(config: TwilioConfig, context: PluginContext): TwilioProvider {
  return new TwilioProvider(config, context);
}

/**
 * Extension manifest for Twilio SMS
 */
export const manifest: ChannelAppManifest = {
  id: 'sms-twilio',
  name: 'Twilio SMS',
  category: 'channel',
  version: '1.0.0',
  description: 'SMS messaging via Twilio for guest communication',
  icon: '📱',
  docsUrl: 'https://www.twilio.com/docs/sms',
  configSchema: [
    {
      key: 'accountSid',
      label: 'Account SID',
      type: 'text',
      required: true,
      description: 'Twilio Account SID',
      placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    },
    {
      key: 'authToken',
      label: 'Auth Token',
      type: 'password',
      required: true,
      description: 'Twilio Auth Token',
    },
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      type: 'text',
      required: true,
      description: 'Twilio phone number (E.164 format)',
      placeholder: '+15551234567',
    },
  ],
  features: {
    inbound: true,
    outbound: true,
    media: true,
  },
  createAdapter: (config, context) => createTwilioProvider(config as unknown as TwilioConfig, context),
};

export default { manifest };
