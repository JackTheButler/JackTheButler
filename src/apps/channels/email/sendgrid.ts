/**
 * SendGrid Email Provider Extension
 *
 * API-based email integration for guest communication.
 * Alternative to Mailgun with good free tier.
 *
 * @module extensions/channels/email/sendgrid
 */

import { ValidationError } from '@/errors/index.js';
import sgMail from '@sendgrid/mail';
import type { ChannelAppManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createAppLogger, withLogContext, AppLogError } from '@/apps/instrumentation.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('extensions:channels:email:sendgrid');

/**
 * SendGrid provider configuration
 */
export interface SendGridConfig {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
}

/**
 * Email message options
 */
export interface SendGridSendOptions {
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
export interface SendGridSendResult {
  messageId: string;
  status: string;
}

/**
 * SendGrid Email provider implementation
 */
export class SendGridProvider implements BaseProvider {
  readonly id = 'sendgrid';
  private fromAddress: string;
  private fromName: string;
  private apiKey: string;
  readonly appLog = createAppLogger('channel', 'email-sendgrid');

  constructor(config: SendGridConfig) {
    if (!config.apiKey || !config.fromAddress) {
      throw new ValidationError('SendGrid provider requires apiKey and fromAddress');
    }

    this.apiKey = config.apiKey;
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName ?? 'Hotel Concierge';

    // Set the API key for the SendGrid client
    sgMail.setApiKey(config.apiKey);

    log.info(
      { fromAddress: this.fromAddress },
      'SendGrid provider initialized'
    );
  }

  /**
   * Test connection to SendGrid API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // SendGrid doesn't have a dedicated "verify" endpoint
      // We'll make a request to the API and check if authentication works
      // Using the suppressions endpoint as a lightweight check
      const response = await this.appLog('connection_test', { fromAddress: this.fromAddress }, async () => {
        const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          throw new AppLogError(`SendGrid connection failed: ${res.status}`, { httpStatus: res.status });
        }
        return withLogContext(res, { httpStatus: res.status });
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: 'Successfully connected to SendGrid',
          details: {
            fromAddress: this.fromAddress,
          },
          latencyMs,
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `Connection failed: ${response.statusText}`,
          details: {
            statusCode: response.status,
            error: errorData,
            hint: 'Check your SendGrid API key',
          },
          latencyMs,
        };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'SendGrid connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: {
          hint: 'Check API key and network connectivity',
        },
        latencyMs,
      };
    }
  }

  /**
   * Send an email via SendGrid
   */
  async sendEmail(options: SendGridSendOptions): Promise<SendGridSendResult> {
    const from = {
      email: this.fromAddress,
      name: this.fromName,
    };

    log.debug(
      {
        to: options.to,
        subject: options.subject,
        hasHtml: !!options.html,
        inReplyTo: options.inReplyTo,
      },
      'Sending email via SendGrid'
    );

    try {
      // Build the message
      const msg: sgMail.MailDataRequired = {
        to: options.to,
        from,
        subject: options.subject,
        text: options.text || '',
        html: options.html || options.text || '',
      };

      // Add custom headers for threading
      if (options.inReplyTo || options.references?.length) {
        msg.headers = {};
        if (options.inReplyTo) {
          msg.headers['In-Reply-To'] = options.inReplyTo;
        }
        if (options.references?.length) {
          msg.headers['References'] = options.references.join(' ');
        }
      }

      const [response] = await this.appLog('send_email', { to: options.to }, async () => {
        const result = await sgMail.send(msg);
        return withLogContext(result, {
          statusCode: result[0]?.statusCode,
          messageId: result[0]?.headers?.['x-message-id'],
        });
      });

      log.info(
        {
          statusCode: response.statusCode,
          to: options.to,
        },
        'Email sent successfully via SendGrid'
      );

      // SendGrid returns message ID in x-message-id header
      const messageId = response.headers['x-message-id'] as string || '';

      return {
        messageId,
        status: response.statusCode === 202 ? 'accepted' : 'sent',
      };
    } catch (error) {
      log.error({ err: error, to: options.to }, 'Failed to send email via SendGrid');
      throw error;
    }
  }

  /**
   * Get the from address
   */
  getFromAddress(): string {
    return this.fromAddress;
  }
}

/**
 * Create a SendGrid provider instance
 */
export function createSendGridProvider(config: SendGridConfig): SendGridProvider {
  return new SendGridProvider(config);
}

/**
 * Extension manifest for SendGrid Email
 */
export const sendgridManifest: ChannelAppManifest = {
  id: 'email-sendgrid',
  name: 'SendGrid',
  category: 'channel',
  version: '1.0.0',
  description: 'Popular email API with free tier (100 emails/day)',
  icon: '📧',
  docsUrl: 'https://docs.sendgrid.com/',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'SendGrid API key from your dashboard',
      placeholder: 'SG.xxxxxxxxxxxxxxxx',
    },
    {
      key: 'fromAddress',
      label: 'From Address',
      type: 'text',
      required: true,
      description: 'Email address to send from (must be verified)',
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
  ],
  features: {
    inbound: true,
    outbound: true,
    templates: false,
  },
  createAdapter: (config) => {
    // Email is transactional-only, not a guest conversation channel — see mailgun.ts for details.
    // TODO: Introduce a separate EmailAppManifest type so this cast is not needed.
    const provider = createSendGridProvider(config as unknown as SendGridConfig);
    return provider as unknown as import('@/core/interfaces/channel.js').ChannelAdapter;
  },
};
