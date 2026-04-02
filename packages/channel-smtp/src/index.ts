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

export interface SMTPConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  fromAddress: string;
  fromName?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export class SMTPProvider implements BaseProvider, ChannelAdapter {
  readonly id = 'smtp';
  readonly channel = 'email' as const;
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private fromAddress: string;
  private fromName: string;
  private smtpHost: string;
  readonly appLog: AppLogger;

  constructor(config: SMTPConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.smtpHost || !config.fromAddress) {
      throw new Error('SMTP provider requires smtpHost and fromAddress');
    }

    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: config.smtpSecure ?? false,
      auth: config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPass }
        : undefined,
    });

    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName || 'Hotel Concierge';
    this.smtpHost = config.smtpHost;

    console.info(`SMTP provider initialized: fromAddress=${this.fromAddress} smtpHost=${this.smtpHost}`);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.appLog('connection_test', { smtpHost: this.smtpHost }, () =>
        this.transporter.verify()
      );
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: 'Successfully connected to SMTP server',
        details: { smtpHost: this.smtpHost, fromAddress: this.fromAddress },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('SMTP connection test failed', error);
      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: { smtpHost: this.smtpHost, hint: 'Check SMTP credentials and server settings' },
        latencyMs,
      };
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const from = `"${this.fromName}" <${this.fromAddress}>`;
    try {
      const result = await this.appLog('send_email', { to: options.to }, async () => {
        const res = await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
          inReplyTo: options.inReplyTo,
          references: options.references?.join(' '),
        });
        return withLogContext(res, {
          messageId: res.messageId,
          accepted: res.accepted,
          rejected: res.rejected,
          serverResponse: res.response,
        });
      });
      return {
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error) {
      console.error(`Failed to send email to ${options.to}`, error);
      throw error;
    }
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

  getFromAddress(): string { return this.fromAddress; }
  close(): void { this.transporter.close(); }
}

export function createSMTPProvider(config: SMTPConfig, context: PluginContext): SMTPProvider {
  return new SMTPProvider(config, context);
}

export const manifest: ChannelAppManifest = {
  id: 'email-smtp',
  name: 'SMTP',
  category: 'channel',
  version: '1.0.0',
  description: 'Connect to your own SMTP server (Postfix, Exchange, etc.)',
  icon: '⚙️',
  docsUrl: 'https://nodemailer.com/smtp/',
  configSchema: [
    { key: 'smtpHost', label: 'SMTP Host', type: 'text', required: true, description: 'SMTP server hostname', placeholder: 'smtp.example.com' },
    { key: 'smtpPort', label: 'SMTP Port', type: 'number', required: false, description: 'SMTP server port', default: 587 },
    { key: 'smtpSecure', label: 'Use TLS', type: 'boolean', required: false, description: 'Use TLS for connection (port 465)', default: false },
    { key: 'smtpUser', label: 'Username', type: 'text', required: false, description: 'SMTP authentication username' },
    { key: 'smtpPass', label: 'Password', type: 'password', required: false, description: 'SMTP authentication password' },
    { key: 'fromAddress', label: 'From Address', type: 'text', required: true, description: 'Email address to send from', placeholder: 'concierge@hotel.com' },
    { key: 'fromName', label: 'From Name', type: 'text', required: false, description: 'Display name for outgoing emails', default: 'Hotel Concierge' },
  ],
  features: { inbound: false, outbound: true, templates: true },
  createAdapter: (config, context) => createSMTPProvider(config as unknown as SMTPConfig, context),
};

export default { manifest };
