/**
 * SendGrid Email Provider Extension
 *
 * @module extensions/channels/email/sendgrid
 */

import { MailService, type MailDataRequired } from '@sendgrid/mail';
import type {
  ChannelAdapter,
  ChannelAppManifest,
  AppLogger,
  BaseProvider,
  ConnectionTestResult,
  PluginContext,
  OutboundMessage,
  SendResult,
} from '@jackthebutler/shared';
import { withLogContext, AppLogError } from '@jackthebutler/shared';

export interface SendGridConfig {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
}

export interface SendGridSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SendGridSendResult {
  messageId: string;
  status: string;
}

export class SendGridProvider implements BaseProvider, ChannelAdapter {
  readonly id = 'sendgrid';
  readonly channel = 'email' as const;
  private fromAddress: string;
  private fromName: string;
  private apiKey: string;
  private mailClient: MailService;
  readonly appLog: AppLogger;

  constructor(config: SendGridConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.apiKey || !config.fromAddress) {
      throw new Error('SendGrid provider requires apiKey and fromAddress');
    }
    this.apiKey = config.apiKey;
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName ?? 'Hotel Concierge';
    this.mailClient = new MailService();
    this.mailClient.setApiKey(config.apiKey);
    console.info(`SendGrid provider initialized: fromAddress=${this.fromAddress}`);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
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
        return { success: true, message: 'Successfully connected to SendGrid', details: { fromAddress: this.fromAddress }, latencyMs };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: `Connection failed: ${response.statusText}`, details: { statusCode: response.status, error: errorData, hint: 'Check your SendGrid API key' }, latencyMs };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('SendGrid connection test failed', error);
      return { success: false, message: `Connection failed: ${message}`, details: { hint: 'Check API key and network connectivity' }, latencyMs };
    }
  }

  async sendEmail(options: SendGridSendOptions): Promise<SendGridSendResult> {
    const from = { email: this.fromAddress, name: this.fromName };
    try {
      const msg: MailDataRequired = {
        to: options.to,
        from,
        subject: options.subject,
        text: options.text || '',
        html: options.html || options.text || '',
      };
      if (options.inReplyTo || options.references?.length) {
        msg.headers = {};
        if (options.inReplyTo) msg.headers['In-Reply-To'] = options.inReplyTo;
        if (options.references?.length) msg.headers['References'] = options.references.join(' ');
      }
      const [response] = await this.appLog('send_email', { to: options.to }, async () => {
        const result = await this.mailClient.send(msg);
        return withLogContext(result, { statusCode: result[0]?.statusCode, messageId: result[0]?.headers?.['x-message-id'] });
      });
      const messageId = response.headers['x-message-id'] as string || '';
      return { messageId, status: response.statusCode === 202 ? 'accepted' : 'sent' };
    } catch (error) {
      console.error(`Failed to send email via SendGrid to ${options.to}`, error);
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
}

export function createSendGridProvider(config: SendGridConfig, context: PluginContext): SendGridProvider {
  return new SendGridProvider(config, context);
}

export const manifest: ChannelAppManifest = {
  id: 'email-sendgrid',
  name: 'SendGrid',
  category: 'channel',
  version: '1.0.0',
  description: 'Popular email API with free tier (100 emails/day)',
  icon: '📧',
  docsUrl: 'https://docs.sendgrid.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, description: 'SendGrid API key from your dashboard', placeholder: 'SG.xxxxxxxxxxxxxxxx' },
    { key: 'fromAddress', label: 'From Address', type: 'text', required: true, description: 'Email address to send from (must be verified)', placeholder: 'concierge@grandhotel.com' },
    { key: 'fromName', label: 'From Name', type: 'text', required: false, description: 'Display name for outgoing emails', default: 'Hotel Concierge' },
  ],
  features: { inbound: false, outbound: true, templates: false },
  createAdapter: (config, context) => createSendGridProvider(config as unknown as SendGridConfig, context),
};

export default { manifest };
