/**
 * Mailgun Email Provider Extension
 *
 * @module extensions/channels/email/mailgun
 */

import Mailgun from 'mailgun.js';
import * as crypto from 'node:crypto';
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

type MailgunClient = ReturnType<InstanceType<typeof Mailgun>['client']>;

export interface MailgunConfig {
  apiKey: string;
  domain: string;
  fromAddress: string;
  fromName?: string;
  region?: 'us' | 'eu';
  webhookSigningKey?: string;
}

export interface MailgunSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface MailgunSendResult {
  messageId: string;
  status: string;
}

export class MailgunProvider implements BaseProvider, ChannelAdapter {
  readonly id = 'mailgun';
  readonly channel = 'email' as const;
  private client: MailgunClient;
  private domain: string;
  private fromAddress: string;
  private fromName: string;
  private webhookSigningKey: string | undefined;
  readonly appLog: AppLogger;

  constructor(config: MailgunConfig, context: PluginContext) {
    this.appLog = context.appLog;
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
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const domainInfo = await this.appLog('connection_test', { domain: this.domain }, async () => {
        const result = await this.client.domains.get(this.domain);
        return withLogContext(result, { domainState: (result as { state?: string }).state });
      });
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: 'Successfully connected to Mailgun',
        details: { domain: this.domain, state: domainInfo.state, fromAddress: this.fromAddress },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: { domain: this.domain, hint: 'Check API key and domain configuration' },
        latencyMs,
      };
    }
  }

  async sendEmail(options: MailgunSendOptions): Promise<MailgunSendResult> {
    const from = `${this.fromName} <${this.fromAddress}>`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageData: Record<string, any> = {
        from,
        to: [options.to],
        subject: options.subject,
      };
      if (options.html) messageData.html = options.html;
      if (options.text) messageData.text = options.text;
      if (options.inReplyTo) messageData['h:In-Reply-To'] = options.inReplyTo;
      if (options.references?.length) messageData['h:References'] = options.references.join(' ');

      const result = await this.appLog('send_email', { to: options.to }, async () => {
        const res = await this.client.messages.create(this.domain, messageData as Parameters<typeof this.client.messages.create>[1]);
        return withLogContext(res, {
          messageId: (res as unknown as { id?: string }).id,
          statusCode: (res as unknown as { status?: number }).status,
        });
      });
      return {
        messageId: result.id || '',
        status: result.status?.toString() || 'queued',
      };
    } catch (error) {
      throw error;
    }
  }

  verifyWebhook(timestamp: string, token: string, signature: string): boolean {
    if (!this.webhookSigningKey) {
      return true;
    }
    const encodedToken = crypto
      .createHmac('sha256', this.webhookSigningKey)
      .update(timestamp.concat(token))
      .digest('hex');
    return encodedToken === signature;
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
  getDomain(): string { return this.domain; }
}

export function createMailgunProvider(config: MailgunConfig, context: PluginContext): MailgunProvider {
  return new MailgunProvider(config, context);
}

export const manifest: ChannelAppManifest = {
  id: 'email-mailgun',
  name: 'Mailgun',
  category: 'channel',
  version: '1.0.0',
  description: 'Reliable transactional email service - API key based, works anywhere',
  icon: '⭐',
  docsUrl: 'https://documentation.mailgun.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, description: 'Mailgun API key from your dashboard', placeholder: 'key-xxxxxxxxxxxxxxxx' },
    { key: 'domain', label: 'Sending Domain', type: 'text', required: true, description: 'Your verified Mailgun sending domain', placeholder: 'mail.grandhotel.com' },
    { key: 'fromAddress', label: 'From Address', type: 'text', required: true, description: 'Email address to send from', placeholder: 'concierge@grandhotel.com' },
    { key: 'fromName', label: 'From Name', type: 'text', required: false, description: 'Display name for outgoing emails', default: 'Hotel Concierge' },
    { key: 'region', label: 'Region', type: 'select', required: false, description: 'Mailgun data center region', options: [{ value: 'us', label: 'US (default)' }, { value: 'eu', label: 'EU' }], default: 'us' },
    { key: 'webhookSigningKey', label: 'Webhook Signing Key', type: 'password', required: false, description: 'Key for verifying inbound email webhooks (optional)' },
  ],
  features: { inbound: false, outbound: true, templates: false },
  createAdapter: (config, context) => createMailgunProvider(config as unknown as MailgunConfig, context),
};

export default { manifest };
