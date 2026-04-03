/**
 * Webhook Logger Middleware
 *
 * Logs every inbound webhook request to app_logs after the response is sent.
 * Runs after next() so the response status code is available.
 * Errors are swallowed — a log failure must never break webhook delivery.
 *
 * @module gateway/middleware/webhook-logger
 */

import type { MiddlewareHandler } from 'hono';
import { writeAppLog } from '@/monitoring/instrumentation.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('gateway:webhook-logger');

/**
 * Infer appId and providerId from the webhook path.
 * Extend this map when new webhook integrations are added.
 */
function getWebhookIdentity(path: string): { appId: string; providerId: string } {
  if (path.startsWith('/webhooks/whatsapp')) return { appId: 'channel', providerId: 'whatsapp-meta' };
  if (path.startsWith('/webhooks/sms')) return { appId: 'channel', providerId: 'sms-twilio' };
  if (path.startsWith('/webhooks/pms')) return { appId: 'pms', providerId: 'pms-mews' };
  return { appId: 'channel', providerId: 'unknown' };
}

export const webhookLogger: MiddlewareHandler = async (c, next) => {
  const t0 = Date.now();
  await next();
  const latencyMs = Date.now() - t0;
  const status = c.res.status >= 200 && c.res.status < 300 ? 'success' : 'failed';
  const { appId, providerId } = getWebhookIdentity(c.req.path);

  try {
    const httpStatus = c.res.status;
    const rejectionReason =
      httpStatus === 401 ? 'signature_invalid' :
      httpStatus === 403 ? 'forbidden' :
      httpStatus === 400 ? 'bad_request' :
      undefined;

    writeAppLog(
      appId,
      providerId,
      'webhook_received',
      status,
      {
        path: c.req.path,
        method: c.req.method,
        httpStatus,
        ...(rejectionReason && { rejectionReason }),
      },
      status === 'failed' ? `HTTP ${httpStatus}` : undefined,
      latencyMs
    );
  } catch (err) {
    log.warn({ err }, 'Webhook log write failed');
  }
};
