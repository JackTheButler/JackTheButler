/**
 * Gmail SMTP Provider Extension
 *
 * Free email option using Gmail SMTP with App Password.
 * Pre-configured for Gmail servers.
 *
 * @module extensions/channels/email/gmail-smtp
 */

import { ValidationError } from '@/errors/index.js';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { ChannelAppManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createLogger } from '@/utils/logger.js';
import { createAppLogger, withLogContext } from '@/apps/instrumentation.js';

const log = createLogger('extensions:channels:email:gmail-smtp');

// Gmail SMTP server settings (hardcoded)
const GMAIL_SMTP = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS
};

/**
 * Gmail SMTP provider configuration
 */
export interface GmailSMTPConfig {
  email: string;
  appPassword: string;
  fromName?: string;
}

/**
 * Email message options
 */
export interface GmailSendOptions {
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
export interface GmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/**
 * Gmail SMTP Email provider implementation
 */
export class GmailSMTPProvider implements BaseProvider {
  readonly id = 'gmail-smtp';
  readonly appLog = createAppLogger('channel', 'email-gmail-smtp');
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private email: string;
  private fromName: string;

  constructor(config: GmailSMTPConfig) {
    if (!config.email || !config.appPassword) {
      throw new ValidationError('Gmail SMTP provider requires email and appPassword');
    }

    // Normalize app password (remove spaces)
    const appPassword = config.appPassword.replace(/\s/g, '');

    this.transporter = nodemailer.createTransport({
      host: GMAIL_SMTP.host,
      port: GMAIL_SMTP.port,
      secure: GMAIL_SMTP.secure,
      auth: {
        user: config.email,
        pass: appPassword,
      },
    });

    this.email = config.email;
    this.fromName = config.fromName ?? 'Hotel Concierge';

    log.info(
      { email: this.email },
      'Gmail SMTP provider initialized'
    );
  }

  /**
   * Test connection to Gmail SMTP
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.appLog('connection_test', { host: GMAIL_SMTP.host, email: this.email }, () =>
        this.transporter.verify()
      );
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Successfully connected to Gmail SMTP',
        details: { email: this.email, smtpHost: GMAIL_SMTP.host },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Gmail SMTP connection test failed');

      let hint = 'Check email and App Password';
      if (message.includes('Invalid login') || message.includes('auth')) {
        hint = 'Invalid credentials. Make sure you are using an App Password, not your regular Google password. Enable 2FA first, then generate an App Password at: Google Account → Security → 2FA → App Passwords';
      }

      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: { email: this.email, hint },
        latencyMs,
      };
    }
  }

  /**
   * Send an email via Gmail SMTP
   */
  async sendEmail(options: GmailSendOptions): Promise<GmailSendResult> {
    const from = `"${this.fromName}" <${this.email}>`;

    log.debug(
      {
        to: options.to,
        subject: options.subject,
        hasHtml: !!options.html,
        inReplyTo: options.inReplyTo,
      },
      'Sending email via Gmail SMTP'
    );

    return this.appLog('send_email', { to: options.to }, async () => {
      const result = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        inReplyTo: options.inReplyTo,
        references: options.references?.join(' '),
      });

      log.info({ messageId: result.messageId, to: options.to }, 'Email sent successfully via Gmail SMTP');

      const enriched = {
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
      return withLogContext(enriched, {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        serverResponse: result.response,
      });
    });
  }

  /**
   * Get the email address
   */
  getEmail(): string {
    return this.email;
  }

  /**
   * Close the transporter
   */
  close(): void {
    this.transporter.close();
    log.debug('Gmail SMTP provider closed');
  }
}

/**
 * Create a Gmail SMTP provider instance
 */
export function createGmailSMTPProvider(config: GmailSMTPConfig): GmailSMTPProvider {
  return new GmailSMTPProvider(config);
}

/**
 * Extension manifest for Gmail SMTP
 */
export const gmailSmtpManifest: ChannelAppManifest = {
  id: 'email-gmail-smtp',
  name: 'Gmail',
  category: 'channel',
  version: '1.0.0',
  description: 'Free email using your Google Workspace or Gmail account with App Password',
  icon: '🆓',
  docsUrl: 'https://support.google.com/accounts/answer/185833',
  configSchema: [
    {
      key: 'email',
      label: 'Gmail Address',
      type: 'text',
      required: true,
      description: 'Your Gmail or Google Workspace email address',
      placeholder: 'concierge@grandhotel.com',
    },
    {
      key: 'appPassword',
      label: 'App Password',
      type: 'password',
      required: true,
      description: 'Google App Password (16 characters). Generate at: Google Account → Security → 2-Step Verification → App passwords',
      placeholder: 'xxxx xxxx xxxx xxxx',
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
    inbound: false, // Gmail SMTP is outbound only
    outbound: true,
    templates: false,
  },
  createAdapter: (config) => {
    const provider = createGmailSMTPProvider(config as unknown as GmailSMTPConfig);
    return provider as unknown as import('@/core/interfaces/channel.js').ChannelAdapter;
  },
};
