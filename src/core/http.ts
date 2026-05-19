import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError } from '@/core/errors.js';
import { logger } from '@/core/logger.js';

/** Single error handler for the whole app. AppError → its code/status;
 *  anything else → 500 (logged). Routes never format errors themselves. */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const body: { error: string; details?: unknown } = { error: err.code };
    if (err.details !== undefined) body.details = err.details;
    return c.json(body, err.status as ContentfulStatusCode);
  }
  logger.error(err);
  return c.json({ error: 'internal_error' }, 500);
};
