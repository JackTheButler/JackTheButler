/**
 * Email Sender (SMTP)
 *
 * Handles outbound email sending via SMTP using nodemailer.
 * Note: EmailSender class can be instantiated directly with config.
 * The getEmailSender() function is deprecated - use extension registry instead.
 */

import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
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
 * Get or create the email sender
 *
 * @deprecated Always returns null. Use extension registry instead.
 * Configure Email via the dashboard UI.
 */
export function getEmailSender(): EmailSender | null {
  log.debug('Legacy getEmailSender disabled. Use extension registry.');
  return null;
}

/**
 * Reset cached sender (for testing)
 * @deprecated No longer needed
 */
export function resetEmailSender(): void {
  // No-op
}
