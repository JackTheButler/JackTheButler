/**
 * Guest Routes
 *
 * CRUD operations for guest profiles.
 *
 * @module gateway/routes/guests
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, sql, isNull } from 'drizzle-orm';
import type { MemoryFact } from '@/services/memory.js';
import { MemoryService } from '@/services/memory.js';
import { db, guests, reservations, conversations, guestMemories } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { validateBody, requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { normalizePhone } from '@/services/guest.js';
import { now } from '@/utils/time.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { memoryService } from '@/services/memory.js';
import { getAppRegistry } from '@/apps/index.js';

const log = createLogger('routes:guests');

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const guestRoutes = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
guestRoutes.use('/*', requireAuth);

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
guestRoutes.get('/stats', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
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
guestRoutes.get('/', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
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
guestRoutes.get('/:id', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
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
guestRoutes.get('/:id/reservations', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
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
guestRoutes.get('/:id/conversations', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
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
 * GET /api/v1/guests/:id/memories
 * Get memories Jack has learned about a guest
 */
guestRoutes.get('/:id/memories', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
  const id = c.req.param('id');

  const guest = await db.select().from(guests).where(eq(guests.id, id)).get();
  if (!guest) {
    return c.json({ error: 'Guest not found' }, 404);
  }

  const rows = await memoryService.listForGuest(id);

  // Strip binary embedding blobs — not useful to the UI and wasteful on the wire
  const memories = rows.map(({ embedding, ...m }) => ({ ...m, hasEmbedding: embedding !== null }));

  return c.json({ memories });
});

const MEMORY_CATEGORIES = ['preference', 'complaint', 'habit', 'personal', 'request'] as const;

const createMemorySchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().min(1).max(1000),
});

const updateMemorySchema = z
  .object({
    category: z.enum(MEMORY_CATEGORIES).optional(),
    content: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.category !== undefined || data.content !== undefined, {
    message: 'At least one field (category or content) must be provided',
  });

/**
 * POST /api/v1/guests/:id/memories
 * Add a manual memory for a guest
 */
guestRoutes.post('/:id/memories', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(createMemorySchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof createMemorySchema>;

  const guest = await db.select().from(guests).where(eq(guests.id, id)).get();
  if (!guest) return c.json({ error: 'Guest not found' }, 404);

  const fact: MemoryFact = { category: data.category, content: data.content, confidence: 1.0 };
  const registry = getAppRegistry();
  const svc = new MemoryService(registry.getActiveAIProvider(), registry.getEmbeddingProvider() ?? undefined);
  const [memory] = await svc.insert(id, null, [fact], 'manual');

  log.info({ guestId: id, memoryId: memory!.id }, 'Manual memory created');

  const { embedding, ...row } = memory!;
  return c.json({ ...row, hasEmbedding: embedding !== null }, 201);
});

/**
 * PATCH /api/v1/guests/:id/memories/:memoryId
 * Update a memory entry
 */
guestRoutes.patch('/:id/memories/:memoryId', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(updateMemorySchema), async (c) => {
  const guestId = c.req.param('id');
  const memoryId = c.req.param('memoryId');
  const data = c.get('validatedBody') as z.infer<typeof updateMemorySchema>;

  const guest = await db.select().from(guests).where(eq(guests.id, guestId)).get();
  if (!guest) return c.json({ error: 'Guest not found' }, 404);

  let existing;
  try {
    existing = await memoryService.getById(memoryId);
  } catch {
    return c.json({ error: 'Memory not found' }, 404);
  }

  // Cross-guest safety: ensure memory belongs to this guest
  if (existing.guestId !== guestId) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  const patch = {
    ...(data.category !== undefined && { category: data.category }),
    ...(data.content !== undefined && { content: data.content }),
  };
  const updated = await memoryService.update(memoryId, patch);

  const { embedding, ...row } = updated;
  return c.json({ ...row, hasEmbedding: embedding !== null });
});

/**
 * DELETE /api/v1/guests/:id/memories/:memoryId
 * Delete a memory entry
 */
guestRoutes.delete('/:id/memories/:memoryId', requirePermission(PERMISSIONS.GUESTS_MANAGE), async (c) => {
  const guestId = c.req.param('id');
  const memoryId = c.req.param('memoryId');

  let existing;
  try {
    existing = await memoryService.getById(memoryId);
  } catch {
    return c.json({ error: 'Memory not found' }, 404);
  }

  // Cross-guest safety: ensure memory belongs to this guest
  if (existing.guestId !== guestId) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  await memoryService.delete(memoryId);
  return c.json({ success: true });
});

/**
 * POST /api/v1/guests/:id/memories/:memoryId/embed
 * Generate embedding for a single memory that is missing one.
 */
guestRoutes.post('/:id/memories/:memoryId/embed', requirePermission(PERMISSIONS.GUESTS_MANAGE), async (c) => {
  const guestId = c.req.param('id');
  const memoryId = c.req.param('memoryId');

  const registry = getAppRegistry();
  const provider = registry.getEmbeddingProvider();
  if (!provider) {
    return c.json({ error: 'No embedding provider available. Please enable Local AI or configure OpenAI in Engine > Apps.' }, 422);
  }

  let existing;
  try {
    existing = await memoryService.getById(memoryId);
  } catch {
    return c.json({ error: 'Memory not found' }, 404);
  }

  if (existing.guestId !== guestId) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  const { embedding } = await provider.embed({ text: existing.content, purpose: 'store' });
  await memoryService.updateEmbedding(memoryId, embedding);

  return c.json({ success: true });
});

/**
 * POST /api/v1/guests
 * Create a new guest
 */
guestRoutes.post('/', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(createGuestSchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createGuestSchema>;

  const id = generateId('guest');

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
      createdAt: now(),
      updatedAt: now(),
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
guestRoutes.put('/:id', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(updateGuestSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof updateGuestSchema>;

  const existing = await db.select().from(guests).where(eq(guests.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Guest not found' }, 404);
  }


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
      updatedAt: now(),
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
guestRoutes.delete('/:id', requirePermission(PERMISSIONS.GUESTS_MANAGE), async (c) => {
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
        updatedAt: now(),
      })
      .where(eq(guests.id, id))
      .run();
    log.info({ id }, 'Guest anonymized (soft delete)');
  }

  return c.json({ success: true });
});

/**
 * POST /api/v1/guests/memories/backfill-embeddings
 * Embed all guest memories that currently have no embedding.
 */
guestRoutes.post('/memories/backfill-embeddings', requirePermission(PERMISSIONS.GUESTS_MANAGE), async (c) => {
  const registry = getAppRegistry();
  const provider = registry.getEmbeddingProvider();

  if (!provider) {
    return c.json(
      { error: 'No embedding provider available. Please enable Local AI or configure OpenAI in Engine > Apps.' },
      400
    );
  }

  const unembedded = await db
    .select({ id: guestMemories.id, content: guestMemories.content })
    .from(guestMemories)
    .where(isNull(guestMemories.embedding));

  log.info({ count: unembedded.length }, 'Starting memory embedding backfill');

  let success = 0;
  let failed = 0;

  for (const memory of unembedded) {
    try {
      const { embedding } = await provider.embed({ text: memory.content, purpose: 'store' });
      await memoryService.updateEmbedding(memory.id, embedding);
      success++;
    } catch (err) {
      log.warn({ id: memory.id, error: err }, 'Failed to embed memory');
      failed++;
    }
  }

  log.info({ success, failed }, 'Memory embedding backfill completed');

  return c.json({ total: unembedded.length, success, failed });
});

export { guestRoutes };
