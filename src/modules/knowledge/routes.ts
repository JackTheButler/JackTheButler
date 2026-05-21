import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { entryBody } from '@/modules/knowledge/schema.js';
import { z } from 'zod';
import {
  addEntry,
  embeddingCounts,
  deleteEntry,
  getEntry,
  getKbTopK,
  getMatchStrictness,
  listEntries,
  setKbTopK,
  setMatchStrictness,
  startReembed,
  updateEntry,
  MATCH_STRICTNESS_LEVELS,
  TOP_K_OPTIONS,
  type TopK,
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

/** Embedding counts (missing + total) driving the KB banner + re-embed-all. */
knowledgeRoutes.get('/embedding-counts', (c) => c.json(embeddingCounts()));

/** Start (or rejoin) the re-embed job. `?scope=all` re-embeds every approved
 *  entry (after a model/scheme change); default re-embeds only missing ones.
 *  Returns the Job snapshot; the client tracks live progress over the socket. */
knowledgeRoutes.post('/reembed', (c) => {
  const scope = c.req.query('scope') === 'all' ? 'all' : 'missing';
  return c.json(startReembed(scope));
});

/** KB retrieval settings:
 *  - matchStrictness: how closely a question must match an entry to be used.
 *  - topK: how many top matches to feed the AI.
 *  PUT accepts either or both; each present field is applied. */
const settingsBody = z
  .object({
    matchStrictness: z.enum(MATCH_STRICTNESS_LEVELS).optional(),
    topK: z
      .number()
      .refine((n): n is TopK => (TOP_K_OPTIONS as readonly number[]).includes(n))
      .optional(),
  })
  .refine((b) => b.matchStrictness !== undefined || b.topK !== undefined, {
    message: 'no settings provided',
  });

const settings = () => ({ matchStrictness: getMatchStrictness(), topK: getKbTopK() });

knowledgeRoutes.get('/settings', (c) => c.json(settings()));

knowledgeRoutes.put('/settings', async (c) => {
  const parsed = settingsBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  if (parsed.data.matchStrictness) setMatchStrictness(parsed.data.matchStrictness);
  if (parsed.data.topK) setKbTopK(parsed.data.topK);
  return c.json(settings());
});
