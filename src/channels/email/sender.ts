/**
 * Email Sender (SMTP)
 *
 * Handles outbound email sending via SMTP using nodemailer.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('email:sender');

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
 * Email sender using SMTP
 */
export class EmailSender {
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private fromAddress: string;
  private fromName: string;

  constructor(transporter: Transporter<SMTPTransport.SentMessageInfo>, fromAddress: string, fromName: string) {
    this.transporter = transporter;
    this.fromAddress = fromAddress;
    this.fromName = fromName;
    log.info({ fromAddress }, 'Email sender initialized');
  }

  /**
   * Send an email
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
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
   * Verify SMTP connection
   */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      log.info('SMTP connection verified');
      return true;
    } catch (error) {
      log.error({ err: error }, 'SMTP connection verification failed');
      return false;
    }
  }

  /**
   * Close the transporter
   */
  close(): void {
    this.transporter.close();
    log.debug('Email sender closed');
  }
}

/**
 * Cached sender instance
 */
let cachedSender: EmailSender | null = null;

/**
 * Get or create the email sender
 */
export function getEmailSender(): EmailSender | null {
  if (cachedSender) {
    return cachedSender;
  }

  const config = loadConfig();

  if (!config.email.smtpHost || !config.email.fromAddress) {
    log.debug('SMTP not configured');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpSecure,
    auth: config.email.smtpUser
      ? {
          user: config.email.smtpUser,
          pass: config.email.smtpPass,
        }
      : undefined,
  });

  cachedSender = new EmailSender(
    transporter,
    config.email.fromAddress,
    config.email.fromName
  );

  return cachedSender;
}

/**
 * Reset cached sender (for testing)
 */
export function resetEmailSender(): void {
  if (cachedSender) {
    cachedSender.close();
    cachedSender = null;
  }
}
