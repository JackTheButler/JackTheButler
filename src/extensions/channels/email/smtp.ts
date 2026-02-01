/**
 * SMTP Email Provider Extension
 *
 * Direct SMTP email integration for guest communication.
 *
 * @module extensions/channels/email/smtp
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { ChannelExtensionManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('extensions:channels:email:smtp');

/**
 * SMTP provider configuration
 */
export interface SMTPConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  fromAddress: string;
  fromName?: string;
}

/**
 * Email message options
 */
export interface SendEmailOptions {
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
export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/**
 * SMTP Email provider implementation
 */
export class SMTPProvider implements BaseProvider {
  readonly id = 'smtp';
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private fromAddress: string;
  private fromName: string;
  private smtpHost: string;

  constructor(config: SMTPConfig) {
    if (!config.smtpHost || !config.fromAddress) {
      throw new Error('SMTP provider requires smtpHost and fromAddress');
    }

    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: config.smtpSecure ?? false,
      auth: config.smtpUser
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
    });

    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName || 'Hotel Concierge';
    this.smtpHost = config.smtpHost;

    log.info(
      { fromAddress: this.fromAddress, smtpHost: this.smtpHost },
      'SMTP provider initialized'
    );
  }

  /**
   * Test connection to SMTP server
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.transporter.verify();
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Successfully connected to SMTP server',
        details: {
          smtpHost: this.smtpHost,
          fromAddress: this.fromAddress,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'SMTP connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: {
          smtpHost: this.smtpHost,
          hint: 'Check SMTP credentials and server settings',
        },
        latencyMs,
      };
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const from = `"${this.fromName}" <${this.fromAddress}>`;

    log.debug(
      {
        to: options.to,
        subject: options.subject,
        hasHtml: !!options.html,
        inReplyTo: options.inReplyTo,
      },
      'Sending email'
    );

    try {
      const result = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        inReplyTo: options.inReplyTo,
        references: options.references?.join(' '),
      });

      log.info(
        {
          messageId: result.messageId,
          to: options.to,
        },
        'Email sent successfully'
      );

      return {
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error) {
      log.error({ err: error, to: options.to }, 'Failed to send email');
      throw error;
    }
  }

  /**
   * Get the from address
   */
  getFromAddress(): string {
    return this.fromAddress;
  }

  /**
   * Close the transporter
   */
  close(): void {
    this.transporter.close();
    log.debug('SMTP provider closed');
  }
}

/**
 * Create an SMTP provider instance
 */
export function createSMTPProvider(config: SMTPConfig): SMTPProvider {
  return new SMTPProvider(config);
}

/**
 * Extension manifest for SMTP Email
 */
export const manifest: ChannelExtensionManifest = {
  id: 'email-smtp',
  name: 'SMTP',
  category: 'channel',
  version: '1.0.0',
  description: 'Connect to your own SMTP server (Postfix, Exchange, etc.)',
  icon: '⚙️',
  docsUrl: 'https://nodemailer.com/smtp/',
  configSchema: [
    {
      key: 'smtpHost',
      label: 'SMTP Host',
      type: 'text',
      required: true,
      description: 'SMTP server hostname',
      placeholder: 'smtp.example.com',
    },
    {
      key: 'smtpPort',
      label: 'SMTP Port',
      type: 'number',
      required: false,
      description: 'SMTP server port',
      default: 587,
    },
    {
      key: 'smtpSecure',
      label: 'Use TLS',
      type: 'boolean',
      required: false,
      description: 'Use TLS for connection (port 465)',
      default: false,
    },
    {
      key: 'smtpUser',
      label: 'Username',
      type: 'text',
      required: false,
      description: 'SMTP authentication username',
    },
    {
      key: 'smtpPass',
      label: 'Password',
      type: 'password',
      required: false,
      description: 'SMTP authentication password',
    },
    {
      key: 'fromAddress',
      label: 'From Address',
      type: 'text',
      required: true,
      description: 'Email address to send from',
      placeholder: 'concierge@hotel.com',
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
    templates: true,
  },
  createAdapter: (config) => {
    const provider = createSMTPProvider(config as unknown as SMTPConfig);
    return provider as unknown as import('@/core/interfaces/channel.js').ChannelAdapter;
  },
};
