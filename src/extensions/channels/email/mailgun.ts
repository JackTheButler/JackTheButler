/**
 * Mailgun Email Provider Extension
 *
 * API-based email integration for guest communication.
 * Recommended for self-hosted deployments.
 *
 * @module extensions/channels/email/mailgun
 */

import Mailgun from 'mailgun.js';
import type { ChannelExtensionManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createLogger } from '@/utils/logger.js';
import * as crypto from 'crypto';

// Type for Mailgun client instance (mailgun.js doesn't export types)
type MailgunClient = ReturnType<InstanceType<typeof Mailgun>['client']>;

const log = createLogger('extensions:channels:email:mailgun');

/**
 * Mailgun provider configuration
 */
export interface MailgunConfig {
  apiKey: string;
  domain: string;
  fromAddress: string;
  fromName?: string;
  region?: 'us' | 'eu';
  webhookSigningKey?: string;
}

/**
 * Email message options
 */
export interface MailgunSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Email send result
 */
export interface MailgunSendResult {
  messageId: string;
  status: string;
}

/**
 * Mailgun Email provider implementation
 */
export class MailgunProvider implements BaseProvider {
  readonly id = 'mailgun';
  private client: MailgunClient;
  private domain: string;
  private fromAddress: string;
  private fromName: string;
  private webhookSigningKey: string | undefined;

  constructor(config: MailgunConfig) {
    if (!config.apiKey || !config.domain || !config.fromAddress) {
      throw new Error('Mailgun provider requires apiKey, domain, and fromAddress');
    }

    const mailgun = new Mailgun(FormData);
    const clientOptions: { username: string; key: string; url?: string } = {
      username: 'api',
      key: config.apiKey,
    };

    if (config.region === 'eu') {
      clientOptions.url = 'https://api.eu.mailgun.net';
    }

    this.client = mailgun.client(clientOptions);

    this.domain = config.domain;
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName ?? 'Hotel Concierge';
    this.webhookSigningKey = config.webhookSigningKey;

    log.info(
      { fromAddress: this.fromAddress, domain: this.domain },
      'Mailgun provider initialized'
    );
  }

  /**
   * Test connection to Mailgun API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Verify domain exists and is accessible
      const domainInfo = await this.client.domains.get(this.domain);
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Successfully connected to Mailgun',
        details: {
          domain: this.domain,
          state: domainInfo.state,
          fromAddress: this.fromAddress,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Mailgun connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: {
          domain: this.domain,
          hint: 'Check API key and domain configuration',
        },
        latencyMs,
      };
    }
  }

  /**
   * Send an email via Mailgun
   */
  async sendEmail(options: MailgunSendOptions): Promise<MailgunSendResult> {
    const from = `${this.fromName} <${this.fromAddress}>`;

    log.debug(
      {
        to: options.to,
        subject: options.subject,
        hasHtml: !!options.html,
        inReplyTo: options.inReplyTo,
      },
      'Sending email via Mailgun'
    );

    try {
      // Build message data - only include defined properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageData: Record<string, any> = {
        from,
        to: [options.to],
        subject: options.subject,
      };

      // Add content (at least one of text or html is required)
      if (options.html) {
        messageData.html = options.html;
      }
      if (options.text) {
        messageData.text = options.text;
      }

      // Add threading headers if replying
      if (options.inReplyTo) {
        messageData['h:In-Reply-To'] = options.inReplyTo;
      }
      if (options.references?.length) {
        messageData['h:References'] = options.references.join(' ');
      }

      // Cast to expected type - we've ensured the required properties are present
      const result = await this.client.messages.create(
        this.domain,
        messageData as Parameters<typeof this.client.messages.create>[1]
      );

      log.info(
        {
          messageId: result.id,
          to: options.to,
        },
        'Email sent successfully via Mailgun'
      );

      return {
        messageId: result.id || '',
        status: result.status?.toString() || 'queued',
      };
    } catch (error) {
      log.error({ err: error, to: options.to }, 'Failed to send email via Mailgun');
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(
    timestamp: string,
    token: string,
    signature: string
  ): boolean {
    if (!this.webhookSigningKey) {
      log.warn('Webhook signature verification skipped - no signing key configured');
      return true;
    }

    // Mailgun uses HMAC-SHA256 for webhook signatures
    const encodedToken = crypto
      .createHmac('sha256', this.webhookSigningKey)
      .update(timestamp.concat(token))
      .digest('hex');

    return encodedToken === signature;
  }

  /**
   * Get the from address
   */
  getFromAddress(): string {
    return this.fromAddress;
  }

  /**
   * Get the domain
   */
  getDomain(): string {
    return this.domain;
  }
}

/**
 * Create a Mailgun provider instance
 */
export function createMailgunProvider(config: MailgunConfig): MailgunProvider {
  return new MailgunProvider(config);
}

/**
 * Extension manifest for Mailgun Email
 */
export const mailgunManifest: ChannelExtensionManifest = {
  id: 'email-mailgun',
  name: 'Mailgun',
  category: 'channel',
  version: '1.0.0',
  description: 'Reliable transactional email service - API key based, works anywhere',
  icon: '⭐',
  docsUrl: 'https://documentation.mailgun.com/',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Mailgun API key from your dashboard',
      placeholder: 'key-xxxxxxxxxxxxxxxx',
    },
    {
      key: 'domain',
      label: 'Sending Domain',
      type: 'text',
      required: true,
      description: 'Your verified Mailgun sending domain',
      placeholder: 'mail.grandhotel.com',
    },
    {
      key: 'fromAddress',
      label: 'From Address',
      type: 'text',
      required: true,
      description: 'Email address to send from',
      placeholder: 'concierge@grandhotel.com',
    },
    {
      key: 'fromName',
      label: 'From Name',
      type: 'text',
      required: false,
      description: 'Display name for outgoing emails',
      default: 'Hotel Concierge',
    },
    {
      key: 'region',
      label: 'Region',
      type: 'select',
      required: false,
      description: 'Mailgun data center region',
      options: [
        { value: 'us', label: 'US (default)' },
        { value: 'eu', label: 'EU' },
      ],
      default: 'us',
    },
    {
      key: 'webhookSigningKey',
      label: 'Webhook Signing Key',
      type: 'password',
      required: false,
      description: 'Key for verifying inbound email webhooks (optional)',
    },
  ],
  features: {
    inbound: true,
    outbound: true,
    templates: false,
  },
  createAdapter: (config) => {
    const provider = createMailgunProvider(config as unknown as MailgunConfig);
    return provider as unknown as import('@/core/interfaces/channel.js').ChannelAdapter;
  },
};
