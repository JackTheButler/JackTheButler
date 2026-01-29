/**
 * Task Routes
 *
 * API endpoints for managing tasks.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { taskService } from '@/services/task.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import { requireAuth } from '../middleware/auth.js';

const listQuerySchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
  department: z.string().optional(),
  assignedTo: z.string().optional(),
  source: z.enum(['manual', 'auto', 'automation']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const createBodySchema = z.object({
  conversationId: z.string().optional(),
  type: z.enum(['housekeeping', 'maintenance', 'concierge', 'room_service', 'other']),
  department: z.string(),
  roomNumber: z.string().optional(),
  description: z.string().min(1),
  items: z.array(z.string()).optional(),
  priority: z.enum(['urgent', 'high', 'standard', 'low']).default('standard'),
  dueAt: z.string().optional(),
});

const updateBodySchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(['urgent', 'high', 'standard', 'low']).optional(),
  notes: z.string().optional(),
  completionNotes: z.string().optional(),
});

const completeBodySchema = z.object({
  notes: z.string().optional(),
});

type Variables = {
  validatedBody: unknown;
  validatedQuery: unknown;
  userId: string;
};

const tasksRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
tasksRouter.use('/*', requireAuth);

/**
 * GET /api/v1/tasks
 * List tasks with optional filters
 */
tasksRouter.get('/', validateQuery(listQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof listQuerySchema>;

  const tasks = await taskService.list({
    status: query.status,
    department: query.department,
    assignedTo: query.assignedTo,
    source: query.source,
    limit: query.limit,
    offset: query.offset,
  });

  return c.json({
    tasks,
    pagination: {
      limit: query.limit,
      offset: query.offset,
    },
  });
});

/**
 * POST /api/v1/tasks
 * Create a new task
 */
tasksRouter.post('/', validateBody(createBodySchema), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof createBodySchema>;

  const task = await taskService.create(body);

  return c.json({ task }, 201);
});

/**
 * GET /api/v1/tasks/:id
 * Get task details
 */
tasksRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const task = await taskService.getById(id);
  return c.json({ task });
});

/**
 * PATCH /api/v1/tasks/:id
 * Update a task
 */
tasksRouter.patch('/:id', validateBody(updateBodySchema), async (c) => {
  const id = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof updateBodySchema>;

  const task = await taskService.update(id, body);

  return c.json({ task });
});

/**
 * POST /api/v1/tasks/:id/claim
 * Claim a task (assign to self and start)
 */
tasksRouter.post('/:id/claim', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  const task = await taskService.claim(id, userId);

  return c.json({ task });
});

/**
 * POST /api/v1/tasks/:id/complete
 * Complete a task
 */
tasksRouter.post('/:id/complete', validateBody(completeBodySchema), async (c) => {
  const id = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof completeBodySchema>;

  const task = await taskService.complete(id, body.notes);

  return c.json({ task });
});

export { tasksRouter };
