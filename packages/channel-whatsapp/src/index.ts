/**
 * Meta WhatsApp Business API Extension
 *
 * WhatsApp Cloud API integration for guest messaging.
 *
 * @module extensions/channels/whatsapp/meta
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

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = 'https://graph.facebook.com';

/**
 * Meta WhatsApp provider configuration
 */
export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  verifyToken?: string;
  appSecret?: string;
}

/**
 * Message send request
 */
export interface SendMessageRequest {
  to: string;
  type: 'text' | 'template' | 'image' | 'document';
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: unknown[];
  };
}

/**
 * Message send response
 */
export interface SendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

/**
 * API error response
 */
interface APIError {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

/**
 * Meta WhatsApp Business API provider
 */
export class MetaWhatsAppProvider implements BaseProvider {
  readonly id = 'meta';
  readonly channel = 'whatsapp' as const;
  private accessToken: string;
  private phoneNumberId: string;
  private baseUrl: string;
  private verifyToken: string | undefined;
  private appSecret: string | undefined;
  readonly appLog: AppLogger;

  constructor(config: MetaWhatsAppConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.accessToken || !config.phoneNumberId) {
      throw new Error('Meta WhatsApp provider requires accessToken and phoneNumberId');
    }

    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.baseUrl = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${this.phoneNumberId}`;
    this.verifyToken = config.verifyToken;
    this.appSecret = config.appSecret;

    console.info(`Meta WhatsApp provider initialized: phoneNumberId=${this.phoneNumberId}`);
  }

  /**
   * Test connection to Meta API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Get phone number details to verify credentials
      const url = `${this.baseUrl}?fields=display_phone_number,verified_name,quality_rating`;
      const { response, data } = await this.appLog('connection_test', {}, async () => {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
        const d = await res.json();
        const result = { response: res, data: d };
        return withLogContext(result, {
          httpStatus: res.status,
          phoneNumber: (d as { display_phone_number?: string }).display_phone_number,
          verifiedName: (d as { verified_name?: string }).verified_name,
          qualityRating: (d as { quality_rating?: string }).quality_rating,
        });
      });
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const error = data as APIError;
        return {
          success: false,
          message: `Connection failed: ${error.error.message}`,
          latencyMs,
        };
      }

      return {
        success: true,
        message: 'Successfully connected to Meta WhatsApp API',
        details: {
          phoneNumberId: this.phoneNumberId,
          displayPhoneNumber: data.display_phone_number,
          verifiedName: data.verified_name,
          qualityRating: data.quality_rating,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Meta WhatsApp connection test failed', error);

      return {
        success: false,
        message: `Connection failed: ${message}`,
        latencyMs,
      };
    }
  }

  /**
   * Send a message
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const url = `${this.baseUrl}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...request,
    };

    const result = await this.appLog('send_message', { to: request.to }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const error = json as APIError;
        throw new AppLogError(`WhatsApp API error: ${error.error.message}`, {
          httpStatus: res.status,
          errorCode: error.error.code,
          traceId: error.error.fbtrace_id,
        });
      }
      const typed = json as SendMessageResponse;
      return withLogContext(typed, {
        httpStatus: res.status,
        messageId: typed.messages?.[0]?.id,
        waId: typed.contacts?.[0]?.wa_id,
      });
    });

    return result;
  }

  /**
   * Send a text message
   */
  async sendText(to: string, text: string): Promise<SendMessageResponse> {
    return this.sendMessage({
      to,
      type: 'text',
      text: {
        body: text,
        preview_url: false,
      },
    });
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    const url = `${this.baseUrl}/messages`;

    await this.appLog('mark_as_read', { messageId }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
      });
      if (!res.ok) {
        console.warn(`Failed to mark message as read: messageId=${messageId} status=${res.status}`);
      }
      return withLogContext(res, { httpStatus: res.status });
    });
  }

  /**
   * Send a message via the ChannelAdapter interface
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    await this.sendText(message.channelId, message.content);
    return { status: 'sent' };
  }

  /**
   * Parse an inbound Meta WhatsApp webhook into a normalized InboundMessage.
   * Throws for non-message payloads (status updates, etc.) — callers should catch.
   */
  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const webhook = raw as {
      entry?: Array<{
        changes?: Array<{
          field?: string;
          value?: {
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type: string;
              text?: { body: string };
            }>;
          };
        }>;
      }>;
    };

    const change = webhook.entry?.[0]?.changes?.find((c) => c.field === 'messages');
    const message = change?.value?.messages?.[0];

    if (!message) {
      throw new Error('No inbound message found in WhatsApp webhook payload');
    }

    const content = message.type === 'text' ? (message.text?.body ?? '') : '';
    const timestamp = message.timestamp
      ? new Date(parseInt(message.timestamp, 10) * 1000)
      : new Date();

    return {
      id: message.id,
      channel: this.channel,
      channelId: message.from,
      channelMessageId: message.id,
      content,
      contentType: 'text',
      timestamp,
      raw,
    };
  }

  /**
   * Verify Meta webhook signature (X-Hub-Signature-256 header)
   */
  verifySignature(payload: unknown, signature: string): boolean {
    if (!this.appSecret) return true;
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expected = `sha256=${crypto.createHmac('sha256', this.appSecret).update(body).digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  /**
   * Get the webhook verify token (used during webhook setup with Meta)
   */
  getVerifyToken(): string | undefined {
    return this.verifyToken;
  }

  /**
   * Get phone number ID
   */
  getPhoneNumberId(): string {
    return this.phoneNumberId;
  }
}

/**
 * Create a Meta WhatsApp provider instance
 */
export function createMetaWhatsAppProvider(config: MetaWhatsAppConfig, context: PluginContext): MetaWhatsAppProvider {
  return new MetaWhatsAppProvider(config, context);
}

/**
 * Extension manifest for Meta WhatsApp
 */
export const manifest: ChannelAppManifest = {
  id: 'whatsapp-meta',
  name: 'WhatsApp Business (Meta)',
  category: 'channel',
  version: '1.0.0',
  description: 'WhatsApp Business Cloud API by Meta for guest messaging',
  icon: '💬',
  docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  configSchema: [
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      description: 'Permanent access token from Meta Business',
      placeholder: 'EAAxxxxxxx...',
    },
    {
      key: 'phoneNumberId',
      label: 'Phone Number ID',
      type: 'text',
      required: true,
      description: 'WhatsApp Business phone number ID',
      placeholder: '123456789012345',
    },
    {
      key: 'verifyToken',
      label: 'Webhook Verify Token',
      type: 'text',
      required: false,
      description: 'Token for webhook verification',
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      type: 'password',
      required: false,
      description: 'App secret for signature verification',
    },
  ],
  features: {
    inbound: true,
    outbound: true,
    media: true,
    templates: true,
  },
  createAdapter: (config, context) => createMetaWhatsAppProvider(config as unknown as MetaWhatsAppConfig, context),
};

export default { manifest };
