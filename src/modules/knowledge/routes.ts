import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { entryBody } from '@/modules/knowledge/schema.js';
import {
  addEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from '@/modules/knowledge/service.js';

/** Thin HTTP adapter for KB entries. */
export const knowledgeRoutes = new Hono();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

function fieldErrors(parsed: ReturnType<typeof entryBody.safeParse>): Record<string, string> {
  const details: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || '_'] = issue.message;
    }
  }
  return details;
}

knowledgeRoutes.get('/entries', (c) => {
  const topic = c.req.query('topic') ?? undefined;
  const statusParam = c.req.query('status');
  const status = statusParam === 'draft' || statusParam === 'approved' ? statusParam : undefined;
  return c.json({ entries: listEntries({ topic, status }) });
});

knowledgeRoutes.get('/entries/:id', (c) => c.json(getEntry(c.req.param('id'))));

knowledgeRoutes.post('/entries', async (c) => {
  const parsed = entryBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400, fieldErrors(parsed));
  return c.json(await addEntry(parsed.data), 201);
});

knowledgeRoutes.put('/entries/:id', async (c) => {
  const parsed = entryBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400, fieldErrors(parsed));
  return c.json(await updateEntry(c.req.param('id'), parsed.data));
});

knowledgeRoutes.delete('/entries/:id', (c) => {
  deleteEntry(c.req.param('id'));
  return c.json({ ok: true });
});
