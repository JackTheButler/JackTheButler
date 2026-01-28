/**
 * Webhook Routes
 *
 * Aggregates all webhook routes for external services.
 */

import { Hono } from 'hono';
import { whatsappWebhook } from './whatsapp.js';
import { smsWebhook } from './sms.js';
import { pmsWebhooks } from './pms.js';

export const webhookRoutes = new Hono();

// WhatsApp webhook
webhookRoutes.route('/whatsapp', whatsappWebhook);

// SMS/Twilio webhook
webhookRoutes.route('/sms', smsWebhook);

// PMS webhooks
webhookRoutes.route('/pms', pmsWebhooks);

export { whatsappWebhook, smsWebhook, pmsWebhooks };
