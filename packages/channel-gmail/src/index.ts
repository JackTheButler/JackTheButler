/**
 * Gmail SMTP Provider Extension
 *
 * @module extensions/channels/email/gmail-smtp
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type {
  ChannelAdapter,
  ChannelAppManifest,
  AppLogger,
  BaseProvider,
  ConnectionTestResult,
  PluginContext,
  OutboundMessage,
  SendResult,
} from '@jack/shared';
import { withLogContext } from '@jack/shared';

const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 587, secure: false };

export interface GmailSMTPConfig {
  email: string;
  appPassword: string;
  fromName?: string;
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface GmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export class GmailSMTPProvider implements BaseProvider, ChannelAdapter {
  readonly id = 'gmail-smtp';
  readonly channel = 'email' as const;
  readonly appLog: AppLogger;
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private email: string;
  private fromName: string;

  constructor(config: GmailSMTPConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.email || !config.appPassword) {
      throw new Error('Gmail SMTP provider requires email and appPassword');
    }
    const appPassword = config.appPassword.replace(/\s/g, '');
    this.transporter = nodemailer.createTransport({
      host: GMAIL_SMTP.host,
      port: GMAIL_SMTP.port,
      secure: GMAIL_SMTP.secure,
      auth: { user: config.email, pass: appPassword },
    });
    this.email = config.email;
    this.fromName = config.fromName ?? 'Hotel Concierge';
    console.info(`Gmail SMTP provider initialized: email=${this.email}`);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.appLog('connection_test', { host: GMAIL_SMTP.host, email: this.email }, () =>
        this.transporter.verify()
      );
      const latencyMs = Date.now() - startTime;
      return { success: true, message: 'Successfully connected to Gmail SMTP', details: { email: this.email, smtpHost: GMAIL_SMTP.host }, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Gmail SMTP connection test failed', error);
      let hint = 'Check email and App Password';
      if (message.includes('Invalid login') || message.includes('auth')) {
        hint = 'Invalid credentials. Make sure you are using an App Password, not your regular Google password.';
      }
      return { success: false, message: `Connection failed: ${message}`, details: { email: this.email, hint }, latencyMs };
    }
  }

  async sendEmail(options: GmailSendOptions): Promise<GmailSendResult> {
    const from = `"${this.fromName}" <${this.email}>`;
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

  async send(message: OutboundMessage): Promise<SendResult> {
    const subject = (message.metadata?.subject as string) ?? '(no subject)';
    const html = message.metadata?.html as string | undefined;
    try {
      const result = await this.sendEmail({
        to: message.channelId,
        subject,
        text: message.content,
        ...(html !== undefined && { html }),
      });
      return { channelMessageId: result.messageId, status: 'sent' };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  getEmail(): string { return this.email; }
  close(): void { this.transporter.close(); }
}

export function createGmailSMTPProvider(config: GmailSMTPConfig, context: PluginContext): GmailSMTPProvider {
  return new GmailSMTPProvider(config, context);
}

export const manifest: ChannelAppManifest = {
  id: 'email-gmail-smtp',
  name: 'Gmail',
  category: 'channel',
  version: '1.0.0',
  description: 'Free email using your Google Workspace or Gmail account with App Password',
  icon: '🆓',
  docsUrl: 'https://support.google.com/accounts/answer/185833',
  configSchema: [
    { key: 'email', label: 'Gmail Address', type: 'text', required: true, description: 'Your Gmail or Google Workspace email address', placeholder: 'concierge@grandhotel.com' },
    { key: 'appPassword', label: 'App Password', type: 'password', required: true, description: 'Google App Password (16 characters).', placeholder: 'xxxx xxxx xxxx xxxx' },
    { key: 'fromName', label: 'From Name', type: 'text', required: false, description: 'Display name for outgoing emails', default: 'Hotel Concierge' },
  ],
  features: { inbound: false, outbound: true, templates: false },
  createAdapter: (config, context) => createGmailSMTPProvider(config as unknown as GmailSMTPConfig, context),
};

export default { manifest };
