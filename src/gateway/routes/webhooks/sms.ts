/**
 * SMS (Twilio) Webhook Routes
 *
 * Handles incoming SMS messages and status callbacks from Twilio.
 */

import { Hono } from 'hono';
import { createLogger } from '@/utils/logger.js';
import { getSMSAdapter, verifyTwilioSignature } from '@/channels/sms/index.js';
import type { TwilioWebhookBody, TwilioStatusBody } from '@/channels/sms/index.js';

const log = createLogger('webhook:sms');

export const smsWebhook = new Hono();

/**
 * POST /webhooks/sms
 * Receive incoming SMS messages from Twilio
 */
smsWebhook.post('/', async (c) => {
  // Get signature for verification
  const signature = c.req.header('x-twilio-signature') || '';

  // Parse form data (Twilio sends application/x-www-form-urlencoded)
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

  // Verify signature in production
  const url = new URL(c.req.url);
  const fullUrl = `${url.protocol}//${url.host}${url.pathname}`;

  if (!verifyTwilioSignature(signature, fullUrl, formData as Record<string, string>)) {
    log.warn('Invalid Twilio signature');
    return c.text('Invalid signature', 401);
  }

  // Get adapter
  const adapter = getSMSAdapter();
  if (!adapter) {
    log.error('SMS adapter not available');
    return c.text('SMS not configured', 503);
  }

  // Process message
  try {
    await adapter.handleIncomingMessage(body);

    // Return TwiML response (tells Twilio we handled it)
    // We already sent the response via the API, so return empty TwiML
    return c.text(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      200,
      { 'Content-Type': 'text/xml' }
    );
  } catch (error) {
    log.error({ err: error }, 'Failed to process SMS webhook');
    return c.text('Processing error', 500);
  }
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

  // Verify signature
  const url = new URL(c.req.url);
  const fullUrl = `${url.protocol}//${url.host}${url.pathname}`;

  if (!verifyTwilioSignature(signature, fullUrl, formData as Record<string, string>)) {
    log.warn('Invalid Twilio signature on status callback');
    return c.text('Invalid signature', 401);
  }

  // Get adapter
  const adapter = getSMSAdapter();
  if (!adapter) {
    return c.text('OK', 200); // Acknowledge even if not configured
  }

  // Update status
  try {
    await adapter.handleStatusCallback(body);
  } catch (error) {
    log.warn({ err: error }, 'Failed to process status callback');
  }

  return c.text('OK', 200);
});
