import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { assistantBody } from '@/modules/assistant/schema.js';
import { getAssistant, saveAssistant } from '@/modules/assistant/service.js';

/** Thin HTTP adapter for the single-row assistant profile. */
export const assistantRoutes = new Hono();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

assistantRoutes.get('/', (c) => c.json(getAssistant()));

assistantRoutes.put('/', async (c) => {
  const parsed = assistantBody.safeParse(await body(c));
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || '_'] = issue.message;
    }
    throw new AppError('invalid_input', 400, details);
  }
  return c.json(saveAssistant(parsed.data));
});
