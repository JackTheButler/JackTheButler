/**
 * Meta WhatsApp Business API Provider
 *
 * WhatsApp Cloud API integration for the integrations layer.
 */

import type { BaseProvider, ConnectionTestResult } from '@/integrations/core/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('integrations:channels:whatsapp:meta');

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
  private accessToken: string;
  private phoneNumberId: string;
  private baseUrl: string;

  constructor(config: MetaWhatsAppConfig) {
    if (!config.accessToken || !config.phoneNumberId) {
      throw new Error('Meta WhatsApp provider requires accessToken and phoneNumberId');
    }

    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.baseUrl = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${this.phoneNumberId}`;

    log.info({ phoneNumberId: this.phoneNumberId }, 'Meta WhatsApp provider initialized');
  }

  /**
   * Test connection to Meta API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Get phone number details to verify credentials
      const url = `${this.baseUrl}?fields=display_phone_number,verified_name,quality_rating`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      const data = await response.json();
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
      log.error({ error }, 'Meta WhatsApp connection test failed');

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

    log.debug({ to: request.to, type: request.type }, 'Sending message');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as APIError;
      log.error(
        {
          status: response.status,
          error: error.error,
        },
        'Failed to send message'
      );
      throw new Error(`WhatsApp API error: ${error.error.message}`);
    }

    const result = data as SendMessageResponse;

    log.info(
      {
        messageId: result.messages[0]?.id,
        to: request.to,
      },
      'Message sent successfully'
    );

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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      log.warn({ messageId, status: response.status }, 'Failed to mark message as read');
    }
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
export function createMetaWhatsAppProvider(config: MetaWhatsAppConfig): MetaWhatsAppProvider {
  return new MetaWhatsAppProvider(config);
}
