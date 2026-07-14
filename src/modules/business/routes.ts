import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { requireAdmin, type AuthEnv } from '@/modules/auth/middleware.js';
import { businessBody } from '@/modules/business/schema.js';
import { getBusiness, saveBusiness } from '@/modules/business/service.js';

/** Thin HTTP adapter for the single-row business profile. Admin-only. */
export const businessRoutes = new Hono<AuthEnv>();
businessRoutes.use('*', requireAdmin);

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

businessRoutes.get('/', (c) => c.json(getBusiness()));

businessRoutes.put('/', async (c) => {
  const parsed = businessBody.safeParse(await body(c));
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || '_'] = issue.message;
    }
    throw new AppError('invalid_input', 400, details);
  }
  return c.json(saveBusiness(parsed.data));
});
