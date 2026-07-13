/**
 * Reservation Routes
 *
 * List and view operations for reservations.
 *
 * @module gateway/routes/reservations
 */

import { Hono } from 'hono';
import { reservationService } from '@/services/reservation.js';
import { requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { PERMISSIONS } from '@/permissions/index.js';
import { now } from '@/utils/time.js';

// Define custom variables type for Hono context
type Variables = {
  userId: string;
};

const reservationRoutes = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
reservationRoutes.use('/*', requireAuth);

/**
 * GET /api/v1/reservations/today
 * Get today's activity summary
 */
reservationRoutes.get('/today', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const summary = await reservationService.getTodaySummary();
  return c.json(summary);
});

/**
 * GET /api/v1/reservations/arrivals
 * Get today's arrivals list
 */
reservationRoutes.get('/arrivals', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const date: string = c.req.query('date') ?? now().split('T')[0]!;
  const status = c.req.query('status'); // optional filter

  const arrivals = await reservationService.getArrivals(date, status);

  return c.json({ date, arrivals });
});

/**
 * GET /api/v1/reservations/departures
 * Get today's departures list
 */
reservationRoutes.get('/departures', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const date: string = c.req.query('date') ?? now().split('T')[0]!;
  const status = c.req.query('status');

  const departures = await reservationService.getDepartures(date, status);

  return c.json({ date, departures });
});

/**
 * GET /api/v1/reservations/in-house
 * Get current in-house guests
 */
reservationRoutes.get('/in-house', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const reservationList = await reservationService.getInHouse();

  return c.json({ count: reservationList.length, reservations: reservationList });
});

/**
 * GET /api/v1/reservations
 * List all reservations with optional filtering
 */
reservationRoutes.get('/', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const search = c.req.query('search');
  const status = c.req.query('status');
  const arrivalFrom = c.req.query('arrivalFrom');
  const arrivalTo = c.req.query('arrivalTo');
  const departureFrom = c.req.query('departureFrom');
  const departureTo = c.req.query('departureTo');
  const roomNumber = c.req.query('roomNumber');
  const guestId = c.req.query('guestId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const result = await reservationService.list({
    search,
    status,
    arrivalFrom,
    arrivalTo,
    departureFrom,
    departureTo,
    roomNumber,
    guestId,
    limit,
    offset,
  });

  return c.json({
    reservations: result.reservations,
    total: result.total,
    limit,
    offset,
  });
});

/**
 * GET /api/v1/reservations/:id
 * Get a single reservation with full details
 */
reservationRoutes.get('/:id', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const id = c.req.param('id');
  const reservation = await reservationService.getById(id);
  return c.json(reservation);
});

export { reservationRoutes };
