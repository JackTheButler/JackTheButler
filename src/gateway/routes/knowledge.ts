/**
 * Knowledge Base Routes
 *
 * CRUD operations for knowledge base entries.
 *
 * @module gateway/routes/knowledge
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createLogger } from '@/utils/logger.js';
import { validateBody, requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { getAppRegistry } from '@/apps/index.js';
import { PERMISSIONS } from '@/permissions/index.js';
import { KnowledgeService } from '@/services/knowledge.js';
import { NotFoundError } from '@/errors/index.js';

const log = createLogger('routes:knowledge');

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const knowledgeRoutes = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
knowledgeRoutes.use('/*', requireAuth);

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
knowledgeRoutes.get('/', requirePermission(PERMISSIONS.KNOWLEDGE_VIEW), async (c) => {
  const categoryParam = c.req.query('category');
  const search = c.req.query('search');
  const source = c.req.query('source');
  const status = c.req.query('status') || 'active';
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const category =
    categoryParam && CATEGORIES.includes(categoryParam as (typeof CATEGORIES)[number]) ? categoryParam : undefined;

  const knowledgeService = new KnowledgeService();
  const { entries, total } = await knowledgeService.listFiltered({
    category,
    search,
    source: source === 'scraped' || source === 'manual' ? source : undefined,
    status,
    limit,
    offset,
  });

  return c.json({
    entries: entries.map((e) => ({
      ...e,
      keywords: JSON.parse(e.keywords || '[]'),
    })),
    total,
    limit,
    offset,
  });
});

/**
 * GET /api/v1/knowledge/categories
 * Get list of valid categories with counts
 */
knowledgeRoutes.get('/categories', requirePermission(PERMISSIONS.KNOWLEDGE_VIEW), async (c) => {
  const knowledgeService = new KnowledgeService();
  const countMap = await knowledgeService.getCategoryCounts();

  return c.json({
    categories: CATEGORIES.map((cat) => ({
      id: cat,
      label: cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count: countMap.get(cat) || 0,
    })),
  });
});

/**
 * Schema for search/ask queries
 */
const querySchema = z.object({
  query: z.string().min(1).max(1000),
});

/**
 * POST /api/v1/knowledge/search
 * Semantic search against the knowledge base - returns matches without AI response
 */
knowledgeRoutes.post('/search', requirePermission(PERMISSIONS.KNOWLEDGE_VIEW), validateBody(querySchema), async (c) => {
  const { query } = c.get('validatedBody') as z.infer<typeof querySchema>;

  log.info({ query: query.substring(0, 50) }, 'Searching knowledge base');

  // Get embedding provider from extension registry
  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider();

  if (!embeddingProvider) {
    return c.json(
      { error: 'No embedding provider available. Please enable Local AI or configure OpenAI in Engine > Apps.' },
      400
    );
  }

  // Search knowledge base using embedding provider
  const knowledgeService = new KnowledgeService(embeddingProvider);
  const matches = await knowledgeService.search(query, {
    limit: 5,
    minSimilarity: 0.3,
  });

  log.info({ query: query.substring(0, 50), matchCount: matches.length }, 'Knowledge search completed');

  return c.json({
    matches: matches.map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      similarity: Math.round(m.similarity * 100),
    })),
  });
});

/**
 * POST /api/v1/knowledge/ask
 * Test the knowledge base by asking a question and getting an AI response
 */
knowledgeRoutes.post('/ask', requirePermission(PERMISSIONS.KNOWLEDGE_VIEW), validateBody(querySchema), async (c) => {
  const { query } = c.get('validatedBody') as z.infer<typeof querySchema>;

  log.info({ query: query.substring(0, 50) }, 'Testing knowledge base');

  // Get providers from extension registry
  const registry = getAppRegistry();
  const completionProvider = registry.getCompletionProvider();
  const embeddingProvider = registry.getEmbeddingProvider();

  if (!completionProvider) {
    return c.json(
      { error: 'No AI provider configured. Please configure an AI provider in Engine > Apps.' },
      400
    );
  }

  if (!embeddingProvider) {
    return c.json(
      { error: 'No embedding provider available. Please enable Local AI or configure OpenAI in Engine > Apps.' },
      400
    );
  }

  // Search knowledge base using embedding provider
  const knowledgeService = new KnowledgeService(embeddingProvider);
  const matches = await knowledgeService.search(query, {
    limit: 5,
    minSimilarity: 0.3,
  });

  // Build prompt with knowledge context
  let systemPrompt = `You are Jack, a friendly hotel concierge. Answer the guest's question based on the hotel information provided below. Be helpful and concise.`;

  if (matches.length > 0) {
    systemPrompt += '\n\n## Hotel Information:\n';
    for (const match of matches) {
      systemPrompt += `\n### ${match.title}\n${match.content}\n`;
    }
  } else {
    systemPrompt += '\n\nNote: No specific hotel information was found for this query. Provide a helpful general response and suggest the guest contact staff for more details.';
  }

  // Generate AI response using completion provider
  const result = await completionProvider.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
    maxTokens: 300,
  });

  log.info(
    { query: query.substring(0, 50), matchCount: matches.length },
    'Knowledge base test completed'
  );

  return c.json({
    response: result.content,
    matches: matches.map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      similarity: Math.round(m.similarity * 100),
    })),
  });
});

/**
 * POST /api/v1/knowledge/reindex
 * Regenerate embeddings for all knowledge base entries
 */
knowledgeRoutes.post('/reindex', requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE), async (c) => {
  // Get embedding provider
  const registry = getAppRegistry();
  const provider = registry.getEmbeddingProvider();

  if (!provider) {
    return c.json(
      { error: 'No embedding provider available. Please enable Local AI or configure OpenAI in Engine > Apps.' },
      400
    );
  }

  const knowledgeService = new KnowledgeService(provider);
  const { total, success, failed } = await knowledgeService.reindexAll();

  return c.json({
    message: 'Reindex completed',
    total,
    success,
    failed,
  });
});

/**
 * GET /api/v1/knowledge/:id
 * Get a single knowledge base entry
 */
knowledgeRoutes.get('/:id', requirePermission(PERMISSIONS.KNOWLEDGE_VIEW), async (c) => {
  const id = c.req.param('id');

  const knowledgeService = new KnowledgeService();
  const entry = await knowledgeService.findById(id);

  if (!entry) {
    throw new NotFoundError('KnowledgeItem', id);
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
knowledgeRoutes.post('/', requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE), validateBody(createEntrySchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createEntrySchema>;

  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider() ?? undefined;
  const knowledgeService = new KnowledgeService(embeddingProvider);

  const entry = await knowledgeService.add({
    category: data.category,
    title: data.title,
    content: data.content,
    keywords: JSON.stringify(data.keywords),
    priority: data.priority,
  });

  log.info({ id: entry.id, category: data.category, title: data.title }, 'Knowledge entry created');

  return c.json(
    {
      ...entry,
      keywords: JSON.parse(entry.keywords || '[]'),
    },
    201
  );
});

/**
 * PUT /api/v1/knowledge/:id
 * Update a knowledge base entry
 */
knowledgeRoutes.put('/:id', requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE), validateBody(updateEntrySchema), async (c) => {
  const id = c.req.param('id');
  const data = c.get('validatedBody') as z.infer<typeof updateEntrySchema>;

  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider() ?? undefined;
  const knowledgeService = new KnowledgeService(embeddingProvider);

  const entry = await knowledgeService.update(id, {
    ...(data.category && { category: data.category }),
    ...(data.title && { title: data.title }),
    ...(data.content && { content: data.content }),
    ...(data.keywords && { keywords: JSON.stringify(data.keywords) }),
    ...(data.priority !== undefined && { priority: data.priority }),
  });

  return c.json({
    ...entry,
    keywords: JSON.parse(entry.keywords || '[]'),
  });
});

/**
 * DELETE /api/v1/knowledge/:id
 * Delete (archive) a knowledge base entry
 */
knowledgeRoutes.delete('/:id', requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE), async (c) => {
  const id = c.req.param('id');
  const permanent = c.req.query('permanent') === 'true';

  const knowledgeService = new KnowledgeService();

  if (permanent) {
    await knowledgeService.delete(id);
    log.info({ id }, 'Knowledge entry permanently deleted');
  } else {
    await knowledgeService.archive(id);
    log.info({ id }, 'Knowledge entry archived');
  }

  return c.json({ success: true });
});

export { knowledgeRoutes };
