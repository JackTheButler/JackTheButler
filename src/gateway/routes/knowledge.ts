/**
 * Knowledge Base Routes
 *
 * CRUD operations for knowledge base entries.
 *
 * @module gateway/routes/knowledge
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { db, knowledgeBase } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { validateBody } from '@/gateway/middleware/index.js';

const log = createLogger('routes:knowledge');

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const knowledgeRoutes = new Hono<{ Variables: Variables }>();

/**
 * Valid categories for knowledge base entries
 */
const CATEGORIES = [
  'faq',
  'policy',
  'amenity',
  'service',
  'dining',
  'room_type',
  'local_info',
  'contact',
  'other',
] as const;

/**
 * Schema for creating knowledge base entries
 */
const createEntrySchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  keywords: z.array(z.string()).optional().default([]),
  priority: z.number().int().min(0).max(10).optional().default(5),
  sourceUrl: z.string().url().optional(),
});

/**
 * Schema for updating knowledge base entries
 */
const updateEntrySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  keywords: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(10).optional(),
});

/**
 * GET /api/v1/knowledge
 * List all knowledge base entries with optional filtering
 */
knowledgeRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  const search = c.req.query('search');
  const status = c.req.query('status') || 'active';
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let entries;

  // Apply category filter
  if (category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    entries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.category, category))
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();
  } else {
    entries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.status, status))
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();
  }

  // Apply search filter in JS (SQLite FTS would be better for large datasets)
  let filtered = entries;
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = entries.filter(
      (e) =>
        e.title.toLowerCase().includes(searchLower) ||
        e.content.toLowerCase().includes(searchLower) ||
        (e.keywords && e.keywords.toLowerCase().includes(searchLower))
    );
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.status, status))
    .get();

  return c.json({
    entries: filtered.map((e) => ({
      ...e,
      keywords: JSON.parse(e.keywords || '[]'),
    })),
    total: countResult?.count || 0,
    limit,
    offset,
  });
});

/**
 * GET /api/v1/knowledge/categories
 * Get list of valid categories with counts
 */
knowledgeRoutes.get('/categories', async (c) => {
  const counts = await db
    .select({
      category: knowledgeBase.category,
      count: sql<number>`count(*)`,
    })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.status, 'active'))
    .groupBy(knowledgeBase.category)
    .all();

  const countMap = new Map(counts.map((c) => [c.category, c.count]));

  return c.json({
    categories: CATEGORIES.map((cat) => ({
      id: cat,
      label: cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count: countMap.get(cat) || 0,
    })),
  });
});

/**
 * GET /api/v1/knowledge/:id
 * Get a single knowledge base entry
 */
knowledgeRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const entry = await db
    .select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.id, id))
    .get();

  if (!entry) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  return c.json({
    ...entry,
    keywords: JSON.parse(entry.keywords || '[]'),
  });
});

/**
 * POST /api/v1/knowledge
 * Create a new knowledge base entry
 */
knowledgeRoutes.post('/', validateBody(createEntrySchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createEntrySchema>;

  const id = generateId('knowledge');
  const now = new Date().toISOString();

  await db
    .insert(knowledgeBase)
    .values({
      id,
      category: data.category,
      title: data.title,
      content: data.content,
      keywords: JSON.stringify(data.keywords),
      priority: data.priority,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  log.info({ id, category: data.category, title: data.title }, 'Knowledge entry created');

  const entry = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).get();

  return c.json(
    {
      ...entry,
      keywords: JSON.parse(entry?.keywords || '[]'),
    },
    201
  );
});

/**
 * PUT /api/v1/knowledge/:id
 * Update a knowledge base entry
 */
knowledgeRoutes.put('/:id', validateBody(updateEntrySchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof updateEntrySchema>;

  const existing = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const now = new Date().toISOString();

  await db
    .update(knowledgeBase)
    .set({
      ...(data.category && { category: data.category }),
      ...(data.title && { title: data.title }),
      ...(data.content && { content: data.content }),
      ...(data.keywords && { keywords: JSON.stringify(data.keywords) }),
      ...(data.priority !== undefined && { priority: data.priority }),
      updatedAt: now,
    })
    .where(eq(knowledgeBase.id, id))
    .run();

  log.info({ id }, 'Knowledge entry updated');

  const entry = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).get();

  return c.json({
    ...entry,
    keywords: JSON.parse(entry?.keywords || '[]'),
  });
});

/**
 * DELETE /api/v1/knowledge/:id
 * Delete (archive) a knowledge base entry
 */
knowledgeRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const permanent = c.req.query('permanent') === 'true';

  const existing = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  if (permanent) {
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id)).run();
    log.info({ id }, 'Knowledge entry permanently deleted');
  } else {
    await db
      .update(knowledgeBase)
      .set({ status: 'archived', updatedAt: new Date().toISOString() })
      .where(eq(knowledgeBase.id, id))
      .run();
    log.info({ id }, 'Knowledge entry archived');
  }

  return c.json({ success: true });
});

export { knowledgeRoutes };
