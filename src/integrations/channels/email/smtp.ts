/**
 * SMTP Email Provider
 *
 * Direct SMTP/IMAP email integration for the integrations layer.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { BaseProvider, ConnectionTestResult } from '@/integrations/core/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('integrations:channels:email:smtp');

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

    log.info({ fromAddress: this.fromAddress, smtpHost: this.smtpHost }, 'SMTP provider initialized');
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
