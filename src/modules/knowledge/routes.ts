import { Hono, type Context } from 'hono';
import { stream } from 'hono/streaming';
import { AppError } from '@/core/errors.js';
import { requireAdmin, type AuthEnv } from '@/modules/auth/middleware.js';
import { entryBody } from '@/modules/knowledge/schema.js';
import { askKnowledge } from '@/modules/knowledge/ask.js';
import { searchKnowledgeByText, generateReplyFromEntries } from '@/modules/knowledge/copilot.js';
import { z } from 'zod';
import {
  addEntries,
  addEntry,
  checkDuplicates,
  embeddingCounts,
  deleteEntry,
  getEntry,
  getKbTopK,
  getMatchThreshold,
  listEntries,
  setKbTopK,
  setMatchThreshold,
  startReembed,
  updateEntry,
  BULK_MAX,
  MATCH_THRESHOLD_MIN,
  MATCH_THRESHOLD_MAX,
  TOP_K_OPTIONS,
  type TopK,
} from '@/modules/knowledge/service.js';

/** Thin HTTP adapter for KB entries. Entries are open to all staff; the
 *  retrieval *settings* (below) are admin-only. */
export const knowledgeRoutes = new Hono<AuthEnv>();
// KB Settings (match strictness, top-K) is config → admin-only. Registered
// before the route handlers so it gates GET + PUT /settings.
knowledgeRoutes.use('/settings', requireAdmin);

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

function fieldErrors(parsed: z.ZodSafeParseResult<unknown>): Record<string, string> {
  const details: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || '_'] = issue.message;
    }
  }
  return details;
}

const askBody = z.object({ question: z.string().trim().min(1).max(2000) });

// "Ask Jane" — KB test sandbox. Streams NDJSON progress events (phase →
// matches → answer) so the UI shows each step and renders matches before the
// answer. All staff; mirrors live chat retrieval + generation (same settings).
knowledgeRoutes.post('/ask', async (c) => {
  const parsed = askBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  c.header('Content-Type', 'application/x-ndjson');
  c.header('Cache-Control', 'no-store');
  return stream(c, async (s) => {
    await askKnowledge(parsed.data.question, async (event) => {
      await s.write(`${JSON.stringify(event)}\n`);
    });
  });
});

// Agent copilot KB search. Embeds the query + returns a ranked shortlist of
// matches (browse-oriented, looser than chat grounding). All staff.
const searchQueryBody = z.object({ query: z.string().trim().min(1).max(2000) });

knowledgeRoutes.post('/search', async (c) => {
  const parsed = searchQueryBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(await searchKnowledgeByText(parsed.data.query));
});

// Copilot reply generation: draft a reply grounded only in the agent-selected
// entries (by id), in the business default language. All staff.
const generateReplyBody = z.object({
  entryIds: z.array(z.string()).min(1).max(20),
  question: z.string().trim().min(1).max(4000),
});

knowledgeRoutes.post('/generate-reply', async (c) => {
  const parsed = generateReplyBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(await generateReplyFromEntries(parsed.data.entryIds, parsed.data.question));
});

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

/** Bulk import. Inserts approved-but-unembedded entries (the re-embed-missing
 *  flow backfills vectors) and skips normalized-duplicate questions. The
 *  client sends large files in sequential batches of ≤ BULK_MAX; retries are
 *  idempotent (dupes come back as `skipped`). */
const bulkBody = z.object({ entries: z.array(entryBody).min(1).max(BULK_MAX) });

knowledgeRoutes.post('/entries/bulk', async (c) => {
  const parsed = bulkBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400, fieldErrors(parsed));
  return c.json(addEntries(parsed.data.entries), 201);
});

/** Duplicate pre-check for the import preview. Read-only: returns, per
 *  question (index-aligned), whether a normalized match already exists. */
const checkBody = z.object({ questions: z.array(z.string()).min(1).max(BULK_MAX) });

knowledgeRoutes.post('/entries/check', async (c) => {
  const parsed = checkBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(await checkDuplicates(parsed.data.questions));
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
 *  - matchThreshold: cosine-similarity floor a question must clear to use an entry.
 *  - topK: how many top matches to feed the AI.
 *  PUT accepts either or both; each present field is applied. */
const settingsBody = z
  .object({
    matchThreshold: z.number().min(MATCH_THRESHOLD_MIN).max(MATCH_THRESHOLD_MAX).optional(),
    topK: z
      .number()
      .refine((n): n is TopK => (TOP_K_OPTIONS as readonly number[]).includes(n))
      .optional(),
  })
  .refine((b) => b.matchThreshold !== undefined || b.topK !== undefined, {
    message: 'no settings provided',
  });

const settings = () => ({ matchThreshold: getMatchThreshold(), topK: getKbTopK() });

knowledgeRoutes.get('/settings', (c) => c.json(settings()));

knowledgeRoutes.put('/settings', async (c) => {
  const parsed = settingsBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  if (parsed.data.matchThreshold !== undefined) setMatchThreshold(parsed.data.matchThreshold);
  if (parsed.data.topK) setKbTopK(parsed.data.topK);
  return c.json(settings());
});
