/**
 * Guest Routes
 *
 * CRUD operations for guest profiles.
 *
 * @module gateway/routes/guests
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { db, guests, reservations, conversations } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { validateBody } from '@/gateway/middleware/index.js';
import { normalizePhone } from '@/services/guest.js';

const log = createLogger('routes:guests');

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const guestRoutes = new Hono<{ Variables: Variables }>();

/**
 * Valid VIP statuses
 */
const VIP_STATUSES = ['none', 'silver', 'gold', 'platinum', 'diamond'] as const;

/**
 * Valid loyalty tiers
 */
const LOYALTY_TIERS = ['none', 'member', 'silver', 'gold', 'platinum'] as const;

/**
 * Schema for creating guests
 */
const createGuestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  language: z.string().default('en'),
  loyaltyTier: z.enum(LOYALTY_TIERS).optional().nullable(),
  vipStatus: z.enum(VIP_STATUSES).optional().nullable(),
  preferences: z.array(z.string()).optional().default([]),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

/**
 * Schema for updating guests
 */
const updateGuestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  language: z.string().optional(),
  loyaltyTier: z.enum(LOYALTY_TIERS).optional().nullable(),
  vipStatus: z.enum(VIP_STATUSES).optional().nullable(),
  preferences: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/guests/stats
 * Get aggregate guest statistics
 */
guestRoutes.get('/stats', async (c) => {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(guests)
    .get();

  const vipResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(guests)
    .where(sql`${guests.vipStatus} IS NOT NULL AND ${guests.vipStatus} != 'none'`)
    .get();

  const repeatResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(guests)
    .where(sql`${guests.stayCount} > 1`)
    .get();

  // New guests this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const newThisMonthResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(guests)
    .where(sql`${guests.createdAt} >= ${startOfMonth.toISOString()}`)
    .get();

  return c.json({
    total: totalResult?.count || 0,
    vip: vipResult?.count || 0,
    repeatGuests: repeatResult?.count || 0,
    newThisMonth: newThisMonthResult?.count || 0,
  });
});

/**
 * GET /api/v1/guests
 * List all guests with optional filtering
 */
guestRoutes.get('/', async (c) => {
  const search = c.req.query('search');
  const vipStatus = c.req.query('vipStatus');
  const loyaltyTier = c.req.query('loyaltyTier');
  const tag = c.req.query('tag');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Get all guests, sorted by most recently updated
  // (Filtering done in JS for complex conditions)
  const allGuests = await db
    .select()
    .from(guests)
    .orderBy(desc(guests.updatedAt))
    .all();

  // Apply filters
  let filtered = allGuests;

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      (g) =>
        g.firstName.toLowerCase().includes(searchLower) ||
        g.lastName.toLowerCase().includes(searchLower) ||
        (g.email && g.email.toLowerCase().includes(searchLower)) ||
        (g.phone && g.phone.includes(search))
    );
  }

  if (vipStatus && vipStatus !== 'all') {
    if (vipStatus === 'any') {
      filtered = filtered.filter((g) => g.vipStatus && g.vipStatus !== 'none');
    } else {
      filtered = filtered.filter((g) => g.vipStatus === vipStatus);
    }
  }

  if (loyaltyTier && loyaltyTier !== 'all') {
    filtered = filtered.filter((g) => g.loyaltyTier === loyaltyTier);
  }

  if (tag) {
    filtered = filtered.filter((g) => {
      const tags = JSON.parse(g.tags || '[]');
      return tags.includes(tag);
    });
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return c.json({
    guests: paginated.map((g) => ({
      ...g,
      preferences: JSON.parse(g.preferences || '[]'),
      tags: JSON.parse(g.tags || '[]'),
      externalIds: JSON.parse(g.externalIds || '{}'),
    })),
    total,
    limit,
    offset,
  });
});

/**
 * GET /api/v1/guests/:id
 * Get a single guest profile with related data
 */
guestRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const guest = await db
    .select()
    .from(guests)
    .where(eq(guests.id, id))
    .get();

  if (!guest) {
    return c.json({ error: 'Guest not found' }, 404);
  }

  // Get reservation count
  const reservationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(eq(reservations.guestId, id))
    .get();

  // Get conversation count
  const conversationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(eq(conversations.guestId, id))
    .get();

  return c.json({
    ...guest,
    preferences: JSON.parse(guest.preferences || '[]'),
    tags: JSON.parse(guest.tags || '[]'),
    externalIds: JSON.parse(guest.externalIds || '{}'),
    _counts: {
      reservations: reservationCount?.count || 0,
      conversations: conversationCount?.count || 0,
    },
  });
});

/**
 * GET /api/v1/guests/:id/reservations
 * Get reservations for a guest
 */
guestRoutes.get('/:id/reservations', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const guestReservations = await db
    .select()
    .from(reservations)
    .where(eq(reservations.guestId, id))
    .orderBy(desc(reservations.arrivalDate))
    .limit(limit)
    .offset(offset)
    .all();

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(eq(reservations.guestId, id))
    .get();

  return c.json({
    reservations: guestReservations.map((r) => ({
      ...r,
      specialRequests: JSON.parse(r.specialRequests || '[]'),
      notes: JSON.parse(r.notes || '[]'),
    })),
    total: total?.count || 0,
    limit,
    offset,
  });
});

/**
 * GET /api/v1/guests/:id/conversations
 * Get conversations for a guest
 */
guestRoutes.get('/:id/conversations', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const guestConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.guestId, id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset)
    .all();

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(eq(conversations.guestId, id))
    .get();

  return c.json({
    conversations: guestConversations.map((c) => ({
      ...c,
      metadata: JSON.parse(c.metadata || '{}'),
    })),
    total: total?.count || 0,
    limit,
    offset,
  });
});

/**
 * POST /api/v1/guests
 * Create a new guest
 */
guestRoutes.post('/', validateBody(createGuestSchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createGuestSchema>;

  const id = generateId('guest');
  const now = new Date().toISOString();

  await db
    .insert(guests)
    .values({
      id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone ? normalizePhone(data.phone) : null,
      language: data.language,
      loyaltyTier: data.loyaltyTier || null,
      vipStatus: data.vipStatus || null,
      preferences: JSON.stringify(data.preferences),
      notes: data.notes || null,
      tags: JSON.stringify(data.tags),
      externalIds: '{}',
      stayCount: 0,
      totalRevenue: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  log.info({ id, name: `${data.firstName} ${data.lastName}` }, 'Guest created');

  const guest = await db.select().from(guests).where(eq(guests.id, id)).get();

  return c.json(
    {
      ...guest,
      preferences: JSON.parse(guest?.preferences || '[]'),
      tags: JSON.parse(guest?.tags || '[]'),
      externalIds: JSON.parse(guest?.externalIds || '{}'),
    },
    201
  );
});

/**
 * PUT /api/v1/guests/:id
 * Update a guest
 */
guestRoutes.put('/:id', validateBody(updateGuestSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof updateGuestSchema>;

  const existing = await db.select().from(guests).where(eq(guests.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Guest not found' }, 404);
  }

  const now = new Date().toISOString();

  await db
    .update(guests)
    .set({
      ...(data.firstName && { firstName: data.firstName }),
      ...(data.lastName && { lastName: data.lastName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone ? normalizePhone(data.phone) : null }),
      ...(data.language && { language: data.language }),
      ...(data.loyaltyTier !== undefined && { loyaltyTier: data.loyaltyTier }),
      ...(data.vipStatus !== undefined && { vipStatus: data.vipStatus }),
      ...(data.preferences && { preferences: JSON.stringify(data.preferences) }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.tags && { tags: JSON.stringify(data.tags) }),
      updatedAt: now,
    })
    .where(eq(guests.id, id))
    .run();

  log.info({ id }, 'Guest updated');

  const guest = await db.select().from(guests).where(eq(guests.id, id)).get();

  return c.json({
    ...guest,
    preferences: JSON.parse(guest?.preferences || '[]'),
    tags: JSON.parse(guest?.tags || '[]'),
    externalIds: JSON.parse(guest?.externalIds || '{}'),
  });
});

/**
 * DELETE /api/v1/guests/:id
 * Delete a guest (soft delete by clearing PII, keeping for historical records)
 */
guestRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const permanent = c.req.query('permanent') === 'true';

  const existing = await db.select().from(guests).where(eq(guests.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Guest not found' }, 404);
  }

  if (permanent) {
    // Check for related records
    const reservationCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(eq(reservations.guestId, id))
      .get();

    if ((reservationCount?.count || 0) > 0) {
      return c.json(
        { error: 'Cannot delete guest with existing reservations' },
        400
      );
    }

    await db.delete(guests).where(eq(guests.id, id)).run();
    log.info({ id }, 'Guest permanently deleted');
  } else {
    // Soft delete - anonymize PII
    await db
      .update(guests)
      .set({
        firstName: 'Deleted',
        lastName: 'Guest',
        email: null,
        phone: null,
        notes: null,
        preferences: '[]',
        tags: '["deleted"]',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(guests.id, id))
      .run();
    log.info({ id }, 'Guest anonymized (soft delete)');
  }

  return c.json({ success: true });
});

export { guestRoutes };
