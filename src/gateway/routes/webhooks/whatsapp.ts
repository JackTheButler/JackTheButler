/**
 * WhatsApp Webhook Routes
 *
 * Handles webhook verification and incoming messages from WhatsApp Cloud API.
 * Configuration is loaded from extension registry (configured via dashboard UI).
 */

import { Hono } from 'hono';
import { createLogger } from '@/utils/logger.js';
import { getExtensionRegistry } from '@/extensions/index.js';
import { extensionConfigService } from '@/services/extension-config.js';
import { createHmac } from 'node:crypto';

const log = createLogger('webhook:whatsapp');

export const whatsappWebhook = new Hono();

/**
 * Get WhatsApp config from extension registry
 */
async function getWhatsAppConfig(): Promise<{
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  appSecret?: string;
} | null> {
  const extConfig = await extensionConfigService.getExtensionConfig('whatsapp-meta');
  if (extConfig?.config) {
    return extConfig.config as {
      accessToken?: string;
      phoneNumberId?: string;
      verifyToken?: string;
      appSecret?: string;
    };
  }

  return null;
}

/**
 * Verify webhook signature using extension config
 */
function verifySignature(payload: string, signature: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret) {
    log.warn('App secret not configured, skipping signature verification');
    return true; // Allow in development without secret
  }

  if (!signature) {
    log.warn('Missing x-hub-signature-256 header');
    return false;
  }

  const expectedSignature = createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  const expectedHeader = `sha256=${expectedSignature}`;

  // Constant-time comparison
  if (signature.length !== expectedHeader.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedHeader.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Webhook verification (GET)
 *
 * Meta sends a GET request to verify the webhook URL.
 * We must respond with the challenge if the verify token matches.
 */
whatsappWebhook.get('/', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  log.debug({ mode, hasToken: !!token, hasChallenge: !!challenge }, 'Webhook verification request');

  const waConfig = await getWhatsAppConfig();

  if (mode === 'subscribe' && token === waConfig?.verifyToken) {
    log.info('Webhook verified successfully');
    return c.text(challenge || '', 200);
  }

  log.warn({ mode, tokenMatch: token === waConfig?.verifyToken }, 'Webhook verification failed');
  return c.text('Forbidden', 403);
});

/**
 * Message webhook (POST)
 *
 * Receives incoming messages and status updates from WhatsApp.
 * Must respond quickly (within 20 seconds) to avoid retries.
 */
whatsappWebhook.post('/', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const body = await c.req.text();

  // Get config and verify signature
  const waConfig = await getWhatsAppConfig();
  if (!verifySignature(body, signature, waConfig?.appSecret)) {
    log.warn('Invalid webhook signature');
    return c.text('Invalid signature', 401);
  }

  // Parse payload
  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    log.warn('Invalid JSON payload');
    return c.text('Invalid JSON', 400);
  }

  // Process asynchronously to respond quickly
  processWebhookAsync(payload).catch((err) => {
    log.error({ err }, 'Error processing webhook');
  });

  // Always return 200 quickly to acknowledge receipt
  return c.text('OK', 200);
});

/**
 * WhatsApp webhook payload types
 */
interface WhatsAppWebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

interface WebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: WebhookContact[];
    messages?: WebhookMessage[];
    statuses?: WebhookStatus[];
  };
  field: string;
}

interface WebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
  };
  // Add more message types as needed
}

interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

/**
 * Process webhook payload asynchronously
 */
async function processWebhookAsync(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') {
    log.debug({ object: payload.object }, 'Ignoring non-WhatsApp webhook');
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') {
        continue;
      }

      const value = change.value;

      // Handle incoming messages
      if (value.messages) {
        for (const message of value.messages) {
          await handleIncomingMessage(message, value.contacts?.[0]);
        }
      }

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status);
        }
      }
    }
  }
}

/**
 * Handle an incoming WhatsApp message
 */
async function handleIncomingMessage(
  message: WebhookMessage,
  contact?: WebhookContact
): Promise<void> {
  log.info(
    {
      messageId: message.id,
      from: message.from,
      type: message.type,
      contactName: contact?.profile.name,
    },
    'Received WhatsApp message'
  );

  // Get provider from extension registry
  const registry = getExtensionRegistry();
  const ext = registry.get('whatsapp-meta');

  if (ext?.status === 'active' && ext.instance) {
    // Use extension provider
    const provider = ext.instance as {
      sendText: (to: string, text: string) => Promise<unknown>;
      markAsRead: (messageId: string) => Promise<void>;
    };

    // Mark as read
    await provider.markAsRead(message.id);

    // Only process text messages
    if (message.type !== 'text' || !message.text?.body) {
      await provider.sendText(
        message.from,
        "I can only process text messages at the moment. Please send your request as text."
      );
      return;
    }

    // Process through message processor
    const { messageProcessor } = await import('@/core/message-processor.js');
    const { generateId } = await import('@/utils/id.js');

    const inbound = {
      id: generateId('message'),
      channel: 'whatsapp' as const,
      channelId: message.from,
      content: message.text.body,
      contentType: 'text' as const,
      timestamp: new Date(),
    };

    try {
      const response = await messageProcessor.process(inbound);
      await provider.sendText(message.from, response.content);
    } catch (error) {
      log.error({ err: error, messageId: message.id }, 'Failed to process message');
      await provider.sendText(
        message.from,
        "I'm sorry, I encountered an error processing your request. Please try again."
      );
    }
  } else {
    // Fallback to old adapter
    const { getWhatsAppAdapter } = await import('@/channels/whatsapp/index.js');
    const adapter = getWhatsAppAdapter();

    if (adapter) {
      await adapter.handleIncomingMessage(message, contact);
    } else {
      log.warn('WhatsApp not configured in extension registry or env');
    }
  }
}

/**
 * Handle a status update for a sent message
 */
async function handleStatusUpdate(status: WebhookStatus): Promise<void> {
  log.debug(
    {
      messageId: status.id,
      status: status.status,
      recipientId: status.recipient_id,
    },
    'Received status update'
  );

  // Update message status in database
  try {
    const { db, messages } = await import('@/db/index.js');
    const { eq } = await import('drizzle-orm');

    await db
      .update(messages)
      .set({
        deliveryStatus: status.status,
        deliveryError: status.errors?.[0]?.message,
      })
      .where(eq(messages.channelMessageId, status.id));
  } catch (error) {
    log.warn({ err: error, messageId: status.id }, 'Failed to update message status');
  }
}

export type { WhatsAppWebhookPayload, WebhookMessage, WebhookStatus, WebhookContact };
