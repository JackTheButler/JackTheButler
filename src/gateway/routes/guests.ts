/**
 * Guest Routes
 *
 * CRUD operations for guest profiles.
 *
 * @module gateway/routes/guests
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { MemoryFact } from '@/services/memory.js';
import { MemoryService, memoryService } from '@/services/memory.js';
import { createLogger } from '@/utils/logger.js';
import { validateBody, requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { guestService } from '@/services/guest.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { getAppRegistry } from '@/apps/index.js';
import { NotFoundError } from '@/errors/index.js';

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
  const stats = await guestService.getStats();
  return c.json(stats);
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

  const result = await guestService.search({ search, vipStatus, loyaltyTier, tag, limit, offset });

  return c.json({
    guests: result.guests,
    total: result.total,
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
  const guest = await guestService.getWithCounts(id);
  return c.json(guest);
});

/**
 * GET /api/v1/guests/:id/reservations
 * Get reservations for a guest
 */
guestRoutes.get('/:id/reservations', requirePermission(PERMISSIONS.GUESTS_VIEW), async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const result = await guestService.getReservations(id, { limit, offset });

  return c.json({
    reservations: result.reservations,
    total: result.total,
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

  const result = await guestService.getConversations(id, { limit, offset });

  return c.json({
    conversations: result.conversations,
    total: result.total,
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

  const guest = await guestService.findById(id);
  if (!guest) {
    throw new NotFoundError('Guest', id);
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

  const guest = await guestService.findById(id);
  if (!guest) {
    throw new NotFoundError('Guest', id);
  }

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

  const guest = await guestService.findById(guestId);
  if (!guest) {
    throw new NotFoundError('Guest', guestId);
  }

  const patch = {
    ...(data.category !== undefined && { category: data.category }),
    ...(data.content !== undefined && { content: data.content }),
  };
  const updated = await memoryService.updateForGuest(guestId, memoryId, patch);

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

  await memoryService.deleteForGuest(guestId, memoryId);

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

  await memoryService.embedForGuest(guestId, memoryId, provider);

  return c.json({ success: true });
});

/**
 * POST /api/v1/guests
 * Create a new guest
 */
guestRoutes.post('/', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(createGuestSchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createGuestSchema>;
  const guest = await guestService.createGuest(data);
  return c.json(guest, 201);
});

/**
 * PUT /api/v1/guests/:id
 * Update a guest
 */
guestRoutes.put('/:id', requirePermission(PERMISSIONS.GUESTS_MANAGE), validateBody(updateGuestSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof updateGuestSchema>;
  const guest = await guestService.updateGuest(id, data);
  return c.json(guest);
});

/**
 * DELETE /api/v1/guests/:id
 * Delete a guest (soft delete by clearing PII, keeping for historical records)
 */
guestRoutes.delete('/:id', requirePermission(PERMISSIONS.GUESTS_MANAGE), async (c) => {
  const id = c.req.param('id');
  const permanent = c.req.query('permanent') === 'true';

  await guestService.deleteGuest(id, { permanent });

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

  const result = await memoryService.backfillEmbeddings(provider);

  return c.json(result);
});

export { guestRoutes };
