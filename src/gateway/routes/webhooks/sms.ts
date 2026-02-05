/**
 * SMS (Twilio) Webhook Routes
 *
 * Handles incoming SMS messages and status callbacks from Twilio.
 * Configuration is loaded from extension registry (configured via dashboard UI).
 */

import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/index.js';
import { appConfigService } from '@/services/app-config.js';

const log = createLogger('webhook:sms');

export const smsWebhook = new Hono();

/**
 * Twilio webhook body structure
 */
interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

/**
 * Twilio status callback body
 */
interface TwilioStatusBody {
  MessageSid: string;
  MessageStatus: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

/**
 * Get Twilio config from extension registry
 */
async function getTwilioConfig(): Promise<{
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
} | null> {
  const extConfig = await appConfigService.getAppConfig('sms-twilio');
  if (extConfig?.config) {
    return extConfig.config as {
      accountSid?: string;
      authToken?: string;
      phoneNumber?: string;
    };
  }
  return null;
}

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
  authToken: string | undefined
): boolean {
  if (!authToken) {
    log.warn('Auth token not configured, skipping signature verification');
    return true; // Allow in development without auth token
  }

  if (!signature) {
    log.warn('Missing x-twilio-signature header');
    return false;
  }

  // Build the data string: URL + sorted params
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  // Calculate expected signature
  const expectedSignature = createHmac('sha1', authToken).update(data).digest('base64');

  // Constant-time comparison
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/sms
 * Receive incoming SMS messages from Twilio
 */
smsWebhook.post('/', async (c) => {
  const signature = c.req.header('x-twilio-signature') || '';
  const formData = await c.req.parseBody();
  const body = formData as unknown as TwilioWebhookBody;

  log.info(
    {
      from: body.From,
      to: body.To,
      messageSid: body.MessageSid,
    },
    'Received SMS webhook'
  );

  // Get config and verify signature
  const twilioConfig = await getTwilioConfig();
  const url = new URL(c.req.url);
  const fullUrl = `${url.protocol}//${url.host}${url.pathname}`;

  if (!verifyTwilioSignature(signature, fullUrl, formData as Record<string, string>, twilioConfig?.authToken)) {
    log.warn('Invalid Twilio signature');
    return c.text('Invalid signature', 401);
  }

  // Process asynchronously to respond quickly
  processIncomingSmsAsync(body).catch((err) => {
    log.error({ err }, 'Error processing SMS');
  });

  // Return empty TwiML response
  return c.text(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    200,
    { 'Content-Type': 'text/xml' }
  );
});

/**
 * POST /webhooks/sms/status
 * Receive message status callbacks from Twilio
 */
smsWebhook.post('/status', async (c) => {
  const signature = c.req.header('x-twilio-signature') || '';
  const formData = await c.req.parseBody();
  const body = formData as unknown as TwilioStatusBody;

  log.debug(
    {
      messageSid: body.MessageSid,
      status: body.MessageStatus,
    },
    'Received SMS status callback'
  );

  // Get config and verify signature
  const twilioConfig = await getTwilioConfig();
  const url = new URL(c.req.url);
  const fullUrl = `${url.protocol}//${url.host}${url.pathname}`;

  if (!verifyTwilioSignature(signature, fullUrl, formData as Record<string, string>, twilioConfig?.authToken)) {
    log.warn('Invalid Twilio signature on status callback');
    return c.text('Invalid signature', 401);
  }

  // Process status update
  await handleStatusUpdate(body);

  return c.text('OK', 200);
});

/**
 * Process incoming SMS asynchronously
 */
async function processIncomingSmsAsync(body: TwilioWebhookBody): Promise<void> {
  // Get provider from extension registry
  const registry = getAppRegistry();
  const ext = registry.get('sms-twilio');

  if (ext?.status !== 'active' || !ext.instance) {
    log.warn('SMS extension not active');
    return;
  }

  const provider = ext.instance as {
    sendMessage: (to: string, body: string) => Promise<unknown>;
  };

  // Only process text messages
  if (parseInt(body.NumMedia, 10) > 0) {
    log.info({ numMedia: body.NumMedia }, 'SMS contains media, sending fallback');
    await provider.sendMessage(
      body.From,
      "I can only process text messages at the moment. Please send your request as text."
    );
    return;
  }

  // Process through message processor
  const { messageProcessor } = await import('@/core/message-processor.js');
  const { generateId } = await import('@/utils/id.js');

  const inbound = {
    id: generateId('message'),
    channel: 'sms' as const,
    channelId: body.From,
    content: body.Body,
    contentType: 'text' as const,
    timestamp: new Date(),
  };

  try {
    const response = await messageProcessor.process(inbound);
    await provider.sendMessage(body.From, response.content);
    log.info({ messageSid: body.MessageSid }, 'SMS processed successfully');
  } catch (error) {
    log.error({ err: error, messageSid: body.MessageSid }, 'Failed to process SMS');
    await provider.sendMessage(
      body.From,
      "I'm sorry, I encountered an error processing your request. Please try again."
    );
  }
}

/**
 * Handle a status update for a sent message
 */
async function handleStatusUpdate(body: TwilioStatusBody): Promise<void> {
  // Map Twilio status to our status
  const statusMap: Record<string, string> = {
    queued: 'pending',
    sending: 'pending',
    sent: 'sent',
    delivered: 'delivered',
    undelivered: 'failed',
    failed: 'failed',
  };

  const deliveryStatus = statusMap[body.MessageStatus] || 'pending';

  // Update message status in database
  try {
    const { db, messages } = await import('@/db/index.js');
    const { eq } = await import('drizzle-orm');

    await db
      .update(messages)
      .set({
        deliveryStatus,
        deliveryError: body.ErrorMessage,
      })
      .where(eq(messages.channelMessageId, body.MessageSid));
  } catch (error) {
    log.warn({ err: error, messageSid: body.MessageSid }, 'Failed to update SMS status');
  }
}

export type { TwilioWebhookBody, TwilioStatusBody };
