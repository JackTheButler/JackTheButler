/**
 * Telegram Bot API Channel
 *
 * Telegram Bot API integration for guest messaging.
 *
 * @module extensions/channels/telegram
 */

import * as crypto from 'node:crypto';
import type {
  ChannelAppManifest,
  AppLogger,
  BaseProvider,
  ConnectionTestResult,
  InboundMessage,
  OutboundMessage,
  PluginContext,
  SendResult,
} from '@jackthebutler/shared';
import { withLogContext, AppLogError } from '@jackthebutler/shared';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Telegram Bot provider configuration
 */
export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

/**
 * Telegram sendMessage response
 */
export interface SendMessageResponse {
  ok: boolean;
  result: {
    message_id: number;
    chat: {
      id: number;
    };
    text?: string;
  };
}

/**
 * API error response
 */
interface APIError {
  ok: false;
  error_code: number;
  description: string;
}

/**
 * Telegram Bot API provider
 */
export class TelegramProvider implements BaseProvider {
  readonly id = 'telegram';
  readonly channel = 'telegram' as const;
  private botToken: string;
  private baseUrl: string;
  private webhookUrl: string | undefined;
  private webhookSecret: string | undefined;
  readonly appLog: AppLogger;

  constructor(config: TelegramConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.botToken) {
      throw new Error('Telegram provider requires botToken');
    }

    this.botToken = config.botToken;
    this.baseUrl = `${TELEGRAM_API_BASE}/bot${this.botToken}`;
    this.webhookUrl = config.webhookUrl;
    this.webhookSecret = config.webhookSecret;

    console.info('Telegram provider initialized');
  }

  /**
   * Test connection to Telegram Bot API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const url = `${this.baseUrl}/getMe`;
      const { response, data } = await this.appLog('connection_test', {}, async () => {
        const res = await fetch(url);
        const d = await res.json();
        const result = { response: res, data: d as { ok: boolean; result?: { username?: string; first_name?: string } } };
        return withLogContext(result, {
          httpStatus: res.status,
          botUsername: (d as { result?: { username?: string } }).result?.username,
        });
      });
      const latencyMs = Date.now() - startTime;

      if (!response.ok || !data.ok) {
        const error = data as unknown as APIError;
        return {
          success: false,
          message: `Connection failed: ${error.description ?? 'Unknown error'}`,
          latencyMs,
        };
      }

      // Register webhook if URL is configured
      if (this.webhookUrl) {
        const webhookResult = await this.registerWebhook();
        if (!webhookResult.success) {
          return {
            success: false,
            message: `Bot connected but webhook registration failed: ${webhookResult.message}`,
            details: { username: data.result?.username, name: data.result?.first_name },
            latencyMs: Date.now() - startTime,
          };
        }
      }

      return {
        success: true,
        message: this.webhookUrl
          ? 'Connected and webhook registered successfully'
          : 'Successfully connected to Telegram Bot API',
        details: {
          username: data.result?.username,
          name: data.result?.first_name,
          webhookUrl: this.webhookUrl,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Telegram connection test failed', error);
      return {
        success: false,
        message: `Connection failed: ${message}`,
        latencyMs,
      };
    }
  }

  /**
   * Register the webhook URL with Telegram
   */
  async registerWebhook(): Promise<ConnectionTestResult> {
    if (!this.webhookUrl) {
      return { success: false, message: 'No webhook URL configured' };
    }

    const startTime = Date.now();

    try {
      // Register the webhook
      const setResult = await this.appLog('register_webhook', { webhookUrl: this.webhookUrl }, async () => {
        const body: Record<string, string> = { url: this.webhookUrl! };
        if (this.webhookSecret) body.secret_token = this.webhookSecret;

        const res = await fetch(`${this.baseUrl}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json() as { ok: boolean; description?: string };
        return withLogContext(json, { httpStatus: res.status });
      });

      if (!setResult.ok) {
        return { success: false, message: setResult.description ?? 'setWebhook failed', latencyMs: Date.now() - startTime };
      }

      // Verify registration via getWebhookInfo
      const info = await this.appLog('get_webhook_info', {}, async () => {
        const res = await fetch(`${this.baseUrl}/getWebhookInfo`);
        const json = await res.json() as {
          ok: boolean;
          result?: {
            url: string;
            has_custom_certificate: boolean;
            pending_update_count: number;
            last_error_message?: string;
            last_error_date?: number;
          };
        };
        return withLogContext(json, { httpStatus: res.status });
      });

      if (!info.ok || info.result?.url !== this.webhookUrl) {
        return { success: false, message: 'Webhook registered but verification failed — URL mismatch', latencyMs: Date.now() - startTime };
      }

      if (info.result?.last_error_message) {
        return {
          success: false,
          message: `Webhook registered but Telegram reported an error: ${info.result.last_error_message}`,
          details: { webhookUrl: this.webhookUrl },
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        message: 'Webhook registered and verified',
        details: { webhookUrl: this.webhookUrl },
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Webhook registration failed: ${message}`, latencyMs: Date.now() - startTime };
    }
  }

  /**
   * Send a text message to a chat
   */
  async sendText(chatId: string, text: string): Promise<SendMessageResponse> {
    const url = `${this.baseUrl}/sendMessage`;

    const result = await this.appLog('send_message', { chatId }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const json = await res.json() as SendMessageResponse | APIError;
      if (!res.ok || !(json as SendMessageResponse).ok) {
        const error = json as APIError;
        throw new AppLogError(`Telegram API error: ${error.description}`, {
          httpStatus: res.status,
          errorCode: error.error_code,
        });
      }
      const typed = json as SendMessageResponse;
      return withLogContext(typed, {
        httpStatus: res.status,
        messageId: typed.result?.message_id,
      });
    });

    return result;
  }

  /**
   * Send a message via the ChannelAdapter interface
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    await this.sendText(message.channelId, message.content);
    return { status: 'sent' };
  }

  /**
   * Parse an inbound Telegram webhook update into a normalized InboundMessage.
   * Throws for non-message updates (edited messages, channel posts, etc.).
   */
  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const update = raw as {
      update_id?: number;
      message?: {
        message_id: number;
        from?: { id: number; username?: string; first_name?: string };
        chat: { id: number };
        date: number;
        text?: string;
      };
    };

    const message = update.message;
    if (!message) {
      throw new Error('No inbound message found in Telegram update payload');
    }

    const content = message.text ?? '';
    const timestamp = new Date(message.date * 1000);

    return {
      id: String(message.message_id),
      channel: this.channel,
      channelId: String(message.chat.id),
      channelMessageId: String(message.message_id),
      content,
      contentType: 'text',
      timestamp,
      raw,
    };
  }

  /**
   * Verify Telegram webhook secret token (X-Telegram-Bot-Api-Secret-Token header)
   */
  verifySignature(_payload: unknown, secretToken: string): boolean {
    if (!this.webhookSecret) return true;
    if (!secretToken) return false;
    return crypto.timingSafeEqual(
      Buffer.from(this.webhookSecret),
      Buffer.from(secretToken)
    );
  }

  /**
   * Get the webhook secret token
   */
  getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }
}

/**
 * Create a Telegram provider instance
 */
export function createTelegramProvider(config: TelegramConfig, context: PluginContext): TelegramProvider {
  return new TelegramProvider(config, context);
}

/**
 * Extension manifest for Telegram
 */
export const manifest: ChannelAppManifest = {
  id: 'telegram',
  name: 'Telegram Bot',
  category: 'channel',
  version: '1.0.0',
  description: 'Telegram Bot API for guest messaging',
  icon: '✈️',
  docsUrl: 'https://core.telegram.org/bots/api',
  configSchema: [
    {
      key: 'botToken',
      label: 'Bot Token',
      type: 'password',
      required: true,
      description: 'Bot token from @BotFather',
      placeholder: '123456789:ABCDefgh...',
    },
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      type: 'text',
      required: false,
      description: 'Your public server URL with the path /webhooks/telegram (e.g. https://yourhotel.com/webhooks/telegram)',
      placeholder: 'https://yourhotel.com/webhooks/telegram',
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret Token',
      type: 'password',
      required: false,
      description: 'Optional secret for webhook request verification',
    },
  ],
  features: {
    inbound: true,
    outbound: true,
    media: false,
    templates: false,
  },
  createAdapter: (config, context) => createTelegramProvider(config as unknown as TelegramConfig, context),
};

export default { manifest };
