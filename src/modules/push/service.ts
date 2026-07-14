import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import type { PushNotificationPayload } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { pushSubscriptions, staff, type PushSubscriptionRow } from '@/db/schema/index.js';
import { config } from '@/config.js';
import { logger } from '@/core/logger.js';

/**
 * Web Push transport. Owns subscription storage and delivery only — it has no
 * idea *why* a notification is sent. Domain code (push/notifications.ts) decides
 * the recipients and copy, then calls sendToStaff/broadcastToActiveStaff. This
 * keeps the transport reusable for any future notification source.
 */

/** Shape the browser hands us from `pushManager.subscribe()`. */
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let vapidReady = false;

/** Lazily wire VAPID into web-push the first time we need to send. Returns
 *  false when push isn't configured, so callers can no-op cleanly. */
function ensureVapid(): boolean {
  if (!config.push) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
    vapidReady = true;
  }
  return true;
}

export const isPushEnabled = (): boolean => config.push !== null;
export const vapidPublicKey = (): string | null => config.push?.publicKey ?? null;

/** Upsert a subscription by endpoint (a device may re-subscribe). */
export function saveSubscription(
  staffId: string,
  sub: WebPushSubscription,
  userAgent?: string | null,
): void {
  db.insert(pushSubscriptions)
    .values({
      id: randomUUID(),
      staffId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { staffId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null },
    })
    .run();
}

export function removeSubscription(endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

/** Deliver to one staff member's devices. */
export async function sendToStaff(staffId: string, payload: PushNotificationPayload): Promise<void> {
  if (!ensureVapid()) return;
  const subs = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.staffId, staffId))
    .all();
  await dispatch(subs, payload);
}

/** Deliver to every *active* staff member (optionally excluding one, e.g. the
 *  actor). Used for team-wide alerts like "a thread needs a human". */
export async function broadcastToActiveStaff(
  payload: PushNotificationPayload,
  opts: { excludeStaffId?: string } = {},
): Promise<void> {
  if (!ensureVapid()) return;
  const rows = db
    .select({ sub: pushSubscriptions })
    .from(pushSubscriptions)
    .innerJoin(staff, eq(staff.id, pushSubscriptions.staffId))
    .where(eq(staff.status, 'active'))
    .all();
  const subs = rows
    .map((r) => r.sub)
    .filter((s) => s.staffId !== opts.excludeStaffId);
  await dispatch(subs, payload);
}

/** Encrypt + POST to each endpoint; prune the ones the push service has
 *  retired (404/410). Failures never throw to the caller. */
async function dispatch(subs: PushSubscriptionRow[], payload: PushNotificationPayload): Promise<void> {
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          removeSubscription(s.endpoint); // gone — drop it
        } else {
          logger.warn({ status, endpoint: s.endpoint }, 'web push send failed');
        }
      }
    }),
  );
}
