/**
 * Reservation Routes
 *
 * List and view operations for reservations.
 *
 * @module gateway/routes/reservations
 */

import { Hono } from 'hono';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db, reservations, guests, conversations, tasks } from '@/db/index.js';
import { requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { PERMISSIONS } from '@/core/permissions/index.js';

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
  const today = new Date();
  const todayStr: string = today.toISOString().split('T')[0]!;

  // Arrivals today
  const arrivalsResult = await db
    .select()
    .from(reservations)
    .where(eq(reservations.arrivalDate, todayStr))
    .all();

  const arrivals = {
    count: arrivalsResult.length,
    pending: arrivalsResult.filter((r) => r.status === 'confirmed').length,
    checkedIn: arrivalsResult.filter((r) => r.status === 'checked_in').length,
  };

  // Departures today
  const departuresResult = await db
    .select()
    .from(reservations)
    .where(eq(reservations.departureDate, todayStr))
    .all();

  const departures = {
    count: departuresResult.length,
    checkedOut: departuresResult.filter((r) => r.status === 'checked_out').length,
    late: departuresResult.filter((r) => r.status === 'checked_in').length,
  };

  // In-house (checked in, departure date >= today)
  const inHouseResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(
      and(
        eq(reservations.status, 'checked_in'),
        gte(reservations.departureDate, todayStr)
      )
    )
    .get();

  // Total rooms (from settings or hardcoded for now)
  const totalRooms = 100; // TODO: Get from settings
  const inHouse = inHouseResult?.count || 0;
  const occupancyRate = Math.round((inHouse / totalRooms) * 100);

  return c.json({
    date: todayStr,
    arrivals,
    departures,
    inHouse,
    occupancyRate,
  });
});

/**
 * GET /api/v1/reservations/arrivals
 * Get today's arrivals list
 */
reservationRoutes.get('/arrivals', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const date: string = c.req.query('date') ?? new Date().toISOString().split('T')[0]!;
  const status = c.req.query('status'); // optional filter

  const query = db
    .select({
      reservation: reservations,
      guest: guests,
    })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .where(eq(reservations.arrivalDate, date));

  const results = await query.orderBy(reservations.estimatedArrival).all();

  let filtered = results;
  if (status) {
    filtered = results.filter((r) => r.reservation.status === status);
  }

  return c.json({
    date,
    arrivals: filtered.map((r) => ({
      ...r.reservation,
      specialRequests: JSON.parse(r.reservation.specialRequests || '[]'),
      notes: JSON.parse(r.reservation.notes || '[]'),
      guest: r.guest
        ? {
            id: r.guest.id,
            firstName: r.guest.firstName,
            lastName: r.guest.lastName,
            vipStatus: r.guest.vipStatus,
            loyaltyTier: r.guest.loyaltyTier,
          }
        : null,
    })),
  });
});

/**
 * GET /api/v1/reservations/departures
 * Get today's departures list
 */
reservationRoutes.get('/departures', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const date: string = c.req.query('date') ?? new Date().toISOString().split('T')[0]!;
  const status = c.req.query('status');

  const results = await db
    .select({
      reservation: reservations,
      guest: guests,
    })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .where(eq(reservations.departureDate, date))
    .orderBy(reservations.estimatedDeparture)
    .all();

  let filtered = results;
  if (status) {
    filtered = results.filter((r) => r.reservation.status === status);
  }

  return c.json({
    date,
    departures: filtered.map((r) => ({
      ...r.reservation,
      specialRequests: JSON.parse(r.reservation.specialRequests || '[]'),
      notes: JSON.parse(r.reservation.notes || '[]'),
      guest: r.guest
        ? {
            id: r.guest.id,
            firstName: r.guest.firstName,
            lastName: r.guest.lastName,
            vipStatus: r.guest.vipStatus,
            loyaltyTier: r.guest.loyaltyTier,
          }
        : null,
    })),
  });
});

/**
 * GET /api/v1/reservations/in-house
 * Get current in-house guests
 */
reservationRoutes.get('/in-house', requirePermission(PERMISSIONS.RESERVATIONS_VIEW), async (c) => {
  const today: string = new Date().toISOString().split('T')[0]!;

  const results = await db
    .select({
      reservation: reservations,
      guest: guests,
    })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .where(
      and(
        eq(reservations.status, 'checked_in'),
        gte(reservations.departureDate, today)
      )
    )
    .orderBy(reservations.roomNumber)
    .all();

  return c.json({
    count: results.length,
    reservations: results.map((r) => ({
      ...r.reservation,
      specialRequests: JSON.parse(r.reservation.specialRequests || '[]'),
      notes: JSON.parse(r.reservation.notes || '[]'),
      guest: r.guest
        ? {
            id: r.guest.id,
            firstName: r.guest.firstName,
            lastName: r.guest.lastName,
            vipStatus: r.guest.vipStatus,
            loyaltyTier: r.guest.loyaltyTier,
          }
        : null,
    })),
  });
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

  // Get all reservations with guest info
  const results = await db
    .select({
      reservation: reservations,
      guest: guests,
    })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .orderBy(desc(reservations.arrivalDate))
    .all();

  // Apply filters in JS for flexibility
  let filtered = results;

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.reservation.confirmationNumber.toLowerCase().includes(searchLower) ||
        (r.guest &&
          `${r.guest.firstName} ${r.guest.lastName}`
            .toLowerCase()
            .includes(searchLower)) ||
        (r.reservation.roomNumber &&
          r.reservation.roomNumber.toLowerCase().includes(searchLower))
    );
  }

  if (status && status !== 'all') {
    filtered = filtered.filter((r) => r.reservation.status === status);
  }

  if (arrivalFrom) {
    filtered = filtered.filter((r) => r.reservation.arrivalDate >= arrivalFrom);
  }

  if (arrivalTo) {
    filtered = filtered.filter((r) => r.reservation.arrivalDate <= arrivalTo);
  }

  if (departureFrom) {
    filtered = filtered.filter(
      (r) => r.reservation.departureDate >= departureFrom
    );
  }

  if (departureTo) {
    filtered = filtered.filter((r) => r.reservation.departureDate <= departureTo);
  }

  if (roomNumber) {
    filtered = filtered.filter(
      (r) => r.reservation.roomNumber === roomNumber
    );
  }

  if (guestId) {
    filtered = filtered.filter((r) => r.reservation.guestId === guestId);
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return c.json({
    reservations: paginated.map((r) => ({
      ...r.reservation,
      specialRequests: JSON.parse(r.reservation.specialRequests || '[]'),
      notes: JSON.parse(r.reservation.notes || '[]'),
      guest: r.guest
        ? {
            id: r.guest.id,
            firstName: r.guest.firstName,
            lastName: r.guest.lastName,
            vipStatus: r.guest.vipStatus,
            loyaltyTier: r.guest.loyaltyTier,
          }
        : null,
    })),
    total,
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

  const result = await db
    .select({
      reservation: reservations,
      guest: guests,
    })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .where(eq(reservations.id, id))
    .get();

  if (!result) {
    return c.json({ error: 'Reservation not found' }, 404);
  }

  // Get related conversations
  const relatedConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.reservationId, id))
    .orderBy(desc(conversations.lastMessageAt))
    .all();

  // Get related tasks
  const relatedTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.conversationId, id))
    .orderBy(desc(tasks.createdAt))
    .limit(10)
    .all();

  return c.json({
    ...result.reservation,
    specialRequests: JSON.parse(result.reservation.specialRequests || '[]'),
    notes: JSON.parse(result.reservation.notes || '[]'),
    guest: result.guest
      ? {
          id: result.guest.id,
          firstName: result.guest.firstName,
          lastName: result.guest.lastName,
          email: result.guest.email,
          phone: result.guest.phone,
          vipStatus: result.guest.vipStatus,
          loyaltyTier: result.guest.loyaltyTier,
          preferences: JSON.parse(result.guest.preferences || '[]'),
        }
      : null,
    _related: {
      conversations: relatedConversations.map((c) => ({
        id: c.id,
        channelType: c.channelType,
        state: c.state,
        lastMessageAt: c.lastMessageAt,
      })),
      tasks: relatedTasks.map((t) => ({
        id: t.id,
        type: t.type,
        description: t.description,
        status: t.status,
        priority: t.priority,
      })),
    },
  });
});

export { reservationRoutes };
