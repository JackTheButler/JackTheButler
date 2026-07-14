import { Hono } from 'hono';
import { getSystemStatus } from '@/modules/status/service.js';

/** Workspace status — connected providers (by name) + coarse health.
 *  Readable by all staff (not admin-gated) so role-restricted pages render
 *  the right hints. */
export const statusRoutes = new Hono();

statusRoutes.get('/', (c) => c.json(getSystemStatus()));
