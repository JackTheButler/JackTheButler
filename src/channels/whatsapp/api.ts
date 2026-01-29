/**
 * WhatsApp Cloud API Client
 *
 * Sends messages via the WhatsApp Business Cloud API.
 * Note: The WhatsAppAPI class can be instantiated directly with config.
 * The getWhatsAppAPI() function is deprecated - use extension registry instead.
 */

import { createLogger } from '@/utils/logger.js';

const log = createLogger('whatsapp:api');

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = 'https://graph.facebook.com';

/**
 * WhatsApp API configuration
 */
export interface WhatsAppAPIConfig {
  accessToken: string;
  phoneNumberId: string;
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
export interface APIError {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

/**
 * WhatsApp Cloud API client
 */
export class WhatsAppAPI {
  private accessToken: string;
  private phoneNumberId: string;
  private baseUrl: string;

  constructor(config: WhatsAppAPIConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.baseUrl = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${this.phoneNumberId}`;

    log.info({ phoneNumberId: this.phoneNumberId }, 'WhatsApp API client initialized');
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
        'Authorization': `Bearer ${this.accessToken}`,
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
        'Authorization': `Bearer ${this.accessToken}`,
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
}

/**
 * Get the WhatsApp API client
 *
 * @deprecated Always returns null. Use extension registry instead.
 * Configure WhatsApp via the dashboard UI, then access via extension instance.
 */
export function getWhatsAppAPI(): WhatsAppAPI | null {
  log.debug('Legacy getWhatsAppAPI disabled. Use extension registry.');
  return null;
}

/**
 * Reset cached client (for testing)
 * @deprecated No longer needed
 */
export function resetWhatsAppAPI(): void {
  // No-op
}
