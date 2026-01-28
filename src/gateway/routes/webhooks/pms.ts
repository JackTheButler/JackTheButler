/**
 * PMS Webhook Routes
 *
 * Inbound webhooks for PMS systems to push data to Jack.
 * Supports both generic format and PMS-specific endpoints.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createLogger } from '@/utils/logger.js';
import { loadConfig } from '@/config/index.js';
import { getPMSAdapter } from '@/integrations/pms/index.js';
import type { NormalizedGuest, NormalizedReservation, PMSEvent, PMSEventType } from '@/integrations/types.js';
import { validateBody } from '../../middleware/validator.js';

const log = createLogger('webhook:pms');

type Variables = {
  validatedBody: unknown;
};

export const pmsWebhooks = new Hono<{ Variables: Variables }>();

// ==================
// Generic PMS Webhooks
// ==================

/**
 * Schema for generic guest webhook
 */
const guestWebhookSchema = z.object({
  externalId: z.string(),
  source: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  language: z.string().optional(),
  loyaltyTier: z.string().optional(),
  vipStatus: z.string().optional(),
  preferences: z.array(z.object({
    category: z.string(),
    value: z.string(),
  })).optional(),
});

/**
 * Schema for generic reservation webhook
 */
const reservationWebhookSchema = z.object({
  externalId: z.string(),
  source: z.string(),
  confirmationNumber: z.string(),
  guest: guestWebhookSchema,
  roomNumber: z.string().optional(),
  roomType: z.string(),
  arrivalDate: z.string(),
  departureDate: z.string(),
  status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  rateCode: z.string().optional(),
  totalRate: z.number().optional(),
  currency: z.string().optional(),
  specialRequests: z.array(z.string()).optional(),
});

/**
 * Schema for generic event webhook
 */
const eventWebhookSchema = z.object({
  type: z.enum([
    'reservation.created',
    'reservation.updated',
    'reservation.cancelled',
    'guest.checked_in',
    'guest.checked_out',
    'guest.updated',
    'room.status_changed',
  ]),
  source: z.string(),
  timestamp: z.string().optional(),
  data: z.object({
    reservation: reservationWebhookSchema.optional(),
    guest: guestWebhookSchema.optional(),
    roomNumber: z.string().optional(),
    previousStatus: z.string().optional(),
    newStatus: z.string().optional(),
  }),
});

type GuestWebhook = z.infer<typeof guestWebhookSchema>;
type ReservationWebhook = z.infer<typeof reservationWebhookSchema>;
type EventWebhook = z.infer<typeof eventWebhookSchema>;

/**
 * Verify webhook secret
 */
function verifyWebhookSecret(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const config = loadConfig();
  const secret = config.pms.webhookSecret;

  if (!secret) {
    // No secret configured, allow all (dev mode)
    return true;
  }

  const providedSecret = c.req.header('x-webhook-secret') || c.req.header('authorization')?.replace('Bearer ', '');
  return providedSecret === secret;
}

/**
 * POST /webhooks/pms/guests
 * Receive guest updates from PMS
 */
pmsWebhooks.post('/guests', validateBody(guestWebhookSchema), async (c) => {
  if (!verifyWebhookSecret(c)) {
    log.warn('Invalid webhook secret');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const guest = c.get('validatedBody') as GuestWebhook;
  log.info({ guestId: guest.externalId, source: guest.source }, 'Received guest webhook');

  // Process asynchronously
  processGuestWebhook(guest as NormalizedGuest).catch((err) => {
    log.error({ err, guestId: guest.externalId }, 'Error processing guest webhook');
  });

  return c.json({ received: true });
});

/**
 * POST /webhooks/pms/reservations
 * Receive reservation updates from PMS
 */
pmsWebhooks.post('/reservations', validateBody(reservationWebhookSchema), async (c) => {
  if (!verifyWebhookSecret(c)) {
    log.warn('Invalid webhook secret');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const reservation = c.get('validatedBody') as ReservationWebhook;
  log.info(
    { reservationId: reservation.externalId, confirmation: reservation.confirmationNumber },
    'Received reservation webhook'
  );

  // Process asynchronously
  processReservationWebhook(reservation as NormalizedReservation).catch((err) => {
    log.error({ err, reservationId: reservation.externalId }, 'Error processing reservation webhook');
  });

  return c.json({ received: true });
});

/**
 * POST /webhooks/pms/events
 * Receive generic events from PMS
 */
pmsWebhooks.post('/events', validateBody(eventWebhookSchema), async (c) => {
  if (!verifyWebhookSecret(c)) {
    log.warn('Invalid webhook secret');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const event = c.get('validatedBody') as EventWebhook;
  log.info({ type: event.type, source: event.source }, 'Received PMS event');

  // Process asynchronously
  processEventWebhook({
    type: event.type as PMSEventType,
    source: event.source as NormalizedGuest['source'],
    timestamp: event.timestamp || new Date().toISOString(),
    data: event.data as PMSEvent['data'],
  }).catch((err) => {
    log.error({ err, type: event.type }, 'Error processing event webhook');
  });

  return c.json({ received: true });
});

// ==================
// PMS-Specific Webhooks
// ==================

/**
 * POST /webhooks/pms/mews
 * Mews-specific webhook endpoint
 */
pmsWebhooks.post('/mews', async (c) => {
  const signature = c.req.header('x-mews-signature');
  const body = await c.req.text();

  const adapter = getPMSAdapter();
  if (adapter.provider !== 'mews') {
    log.warn('Received Mews webhook but adapter is not Mews');
    return c.json({ error: 'PMS mismatch' }, 400);
  }

  // Verify signature if adapter supports it
  if (adapter.verifyWebhookSignature && signature) {
    if (!adapter.verifyWebhookSignature(body, signature)) {
      log.warn('Invalid Mews webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }

  // Parse webhook
  if (adapter.parseWebhook) {
    const event = await adapter.parseWebhook(JSON.parse(body), { 'x-mews-signature': signature || '' });
    if (event) {
      processEventWebhook(event).catch((err) => {
        log.error({ err }, 'Error processing Mews webhook');
      });
    }
  }

  return c.json({ received: true });
});

/**
 * POST /webhooks/pms/cloudbeds
 * Cloudbeds-specific webhook endpoint
 */
pmsWebhooks.post('/cloudbeds', async (c) => {
  const body = await c.req.text();

  const adapter = getPMSAdapter();
  if (adapter.provider !== 'cloudbeds') {
    log.warn('Received Cloudbeds webhook but adapter is not Cloudbeds');
    return c.json({ error: 'PMS mismatch' }, 400);
  }

  if (adapter.parseWebhook) {
    const event = await adapter.parseWebhook(JSON.parse(body));
    if (event) {
      processEventWebhook(event).catch((err) => {
        log.error({ err }, 'Error processing Cloudbeds webhook');
      });
    }
  }

  return c.json({ received: true });
});

// ==================
// Processing Functions
// ==================

/**
 * Process guest webhook - sync to database
 */
async function processGuestWebhook(guest: NormalizedGuest): Promise<void> {
  // Import dynamically to avoid circular dependencies
  const { pmsSyncService } = await import('@/services/pms-sync.js');
  await pmsSyncService.upsertGuest(guest);
}

/**
 * Process reservation webhook - sync to database
 */
async function processReservationWebhook(reservation: NormalizedReservation): Promise<void> {
  const { pmsSyncService } = await import('@/services/pms-sync.js');
  await pmsSyncService.upsertReservation(reservation);
}

/**
 * Process event webhook - handle various event types
 */
async function processEventWebhook(event: PMSEvent): Promise<void> {
  const { pmsSyncService } = await import('@/services/pms-sync.js');

  switch (event.type) {
    case 'reservation.created':
    case 'reservation.updated':
      if (event.data.reservation) {
        await pmsSyncService.upsertReservation(event.data.reservation);
      }
      break;

    case 'reservation.cancelled':
      if (event.data.reservation) {
        await pmsSyncService.upsertReservation({
          ...event.data.reservation,
          status: 'cancelled',
        });
      }
      break;

    case 'guest.checked_in':
      if (event.data.reservation) {
        await pmsSyncService.upsertReservation({
          ...event.data.reservation,
          status: 'checked_in',
        });
      }
      break;

    case 'guest.checked_out':
      if (event.data.reservation) {
        await pmsSyncService.upsertReservation({
          ...event.data.reservation,
          status: 'checked_out',
        });
      }
      break;

    case 'guest.updated':
      if (event.data.guest) {
        await pmsSyncService.upsertGuest(event.data.guest);
      }
      break;

    case 'room.status_changed':
      // Could update room status cache here
      log.info({ room: event.data.room, newStatus: event.data.newStatus }, 'Room status changed');
      break;
  }
}
