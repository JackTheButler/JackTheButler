/**
 * Analytics Service Tests
 *
 * Characterization tests: seed known conversations/messages/activity-log
 * rows via drizzle and assert the aggregated numbers the service computes.
 * Dates are always relative to "now" (UTC) so the fixtures land in the
 * correct buckets regardless of when the suite runs.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { db } from '@/db/index.js';
import { guests, conversations, messages, activityLog } from '@/db/schema.js';
import { inArray } from 'drizzle-orm';
import { getAnalyticsOverview } from '@/services/analytics.js';
import { generateId } from '@/utils/id.js';

// ---------------------------------------------------------------------------
// Date helpers — everything anchored to "now" in UTC, no hardcoded calendar
// dates.
// ---------------------------------------------------------------------------

function dateNDaysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** YYYY-MM-DD for N days before today (UTC) */
function ymdAgo(n: number): string {
  return dateNDaysAgo(n).toISOString().slice(0, 10);
}

/** Full ISO timestamp for N days before today (UTC), at a given hour */
function isoAgo(n: number, hour = 12): string {
  return `${ymdAgo(n)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

describe('AnalyticsService', () => {
  let guestIds: string[] = [];
  let conversationIds: string[] = [];
  let messageIds: string[] = [];
  let activityLogIds: string[] = [];

  afterEach(async () => {
    if (messageIds.length) await db.delete(messages).where(inArray(messages.id, messageIds));
    if (activityLogIds.length) await db.delete(activityLog).where(inArray(activityLog.id, activityLogIds));
    if (conversationIds.length) await db.delete(conversations).where(inArray(conversations.id, conversationIds));
    if (guestIds.length) await db.delete(guests).where(inArray(guests.id, guestIds));
    guestIds = [];
    conversationIds = [];
    messageIds = [];
    activityLogIds = [];
  });

  async function makeGuest(createdAt: string): Promise<string> {
    const id = generateId('guest');
    await db.insert(guests).values({
      id,
      firstName: 'Analytics',
      lastName: 'Fixture',
      createdAt,
      updatedAt: createdAt,
    });
    guestIds.push(id);
    return id;
  }

  async function makeConversation(guestId: string | null): Promise<string> {
    const id = generateId('conversation');
    await db.insert(conversations).values({
      id,
      guestId,
      channelType: 'webchat',
      channelId: id,
    });
    conversationIds.push(id);
    return id;
  }

  async function makeMessage(
    conversationId: string,
    direction: 'inbound' | 'outbound',
    createdAt: string,
  ): Promise<string> {
    const id = generateId('message');
    await db.insert(messages).values({
      id,
      conversationId,
      direction,
      senderType: direction === 'inbound' ? 'guest' : 'ai',
      content: 'fixture message',
      createdAt,
    });
    messageIds.push(id);
    return id;
  }

  async function makeActivityLog(opts: {
    createdAt: string;
    eventType?: string;
    status?: string;
    escalated?: boolean;
    latencyMs?: number | null;
  }): Promise<string> {
    const id = generateId('alog');
    await db.insert(activityLog).values({
      id,
      source: 'system',
      eventType: opts.eventType ?? 'processor.outcome',
      status: opts.status ?? 'success',
      latencyMs: opts.latencyMs === undefined ? 100 : opts.latencyMs,
      details: JSON.stringify({ escalated: opts.escalated ? 1 : 0 }),
      createdAt: opts.createdAt,
    });
    activityLogIds.push(id);
    return id;
  }

  // A 7-day window covering "today" through 6 days ago.
  const range = { from: ymdAgo(6), to: ymdAgo(0) };

  describe('totalMessages', () => {
    it('counts only inbound messages within the range, bucketed by day', async () => {
      const guestId = await makeGuest(isoAgo(6));
      const convoId = await makeConversation(guestId);

      await makeMessage(convoId, 'inbound', isoAgo(6));
      await makeMessage(convoId, 'inbound', isoAgo(3));
      await makeMessage(convoId, 'inbound', isoAgo(3));
      await makeMessage(convoId, 'inbound', isoAgo(0));
      // Excluded: outbound direction
      await makeMessage(convoId, 'outbound', isoAgo(3));
      // Excluded: outside the range (10 days ago)
      await makeMessage(convoId, 'inbound', isoAgo(10));

      const result = await getAnalyticsOverview({ range });

      expect(result.totalMessages.value).toBe(4);
      expect(result.totalMessages.compareValue).toBeNull();
      expect(result.totalMessages.delta).toBeNull();
      expect(result.totalMessages.series).toHaveLength(7);

      const byDate = Object.fromEntries(result.totalMessages.series.map((p) => [p.date, p.value]));
      expect(byDate[ymdAgo(6)]).toBe(1);
      expect(byDate[ymdAgo(3)]).toBe(2);
      expect(byDate[ymdAgo(0)]).toBe(1);
      // Zero-filled day with no data
      expect(byDate[ymdAgo(5)]).toBe(0);
    });
  });

  describe('autonomyRate', () => {
    it('computes (total - escalated) / total as a percentage, weighted globally', async () => {
      // Day -5: 3 successful outcomes, 1 escalated -> 66.7%
      await makeActivityLog({ createdAt: isoAgo(5), escalated: true });
      await makeActivityLog({ createdAt: isoAgo(5), escalated: false });
      await makeActivityLog({ createdAt: isoAgo(5), escalated: false });
      // Day -2: 2 successful outcomes, 0 escalated -> 100%
      await makeActivityLog({ createdAt: isoAgo(2), escalated: false });
      await makeActivityLog({ createdAt: isoAgo(2), escalated: false });
      // Excluded: not a success
      await makeActivityLog({ createdAt: isoAgo(2), status: 'failed', escalated: false });
      // Excluded: wrong event type
      await makeActivityLog({ createdAt: isoAgo(2), eventType: 'message.saved', escalated: false });
      // Excluded: outside range
      await makeActivityLog({ createdAt: isoAgo(20), escalated: true });

      const result = await getAnalyticsOverview({ range });

      // Global: 5 total, 1 escalated -> (5-1)/5 * 100 = 80.0
      expect(result.autonomyRate.value).toBe(80);

      const byDate = Object.fromEntries(result.autonomyRate.series.map((p) => [p.date, p.value]));
      expect(byDate[ymdAgo(5)]).toBeCloseTo(66.7, 1);
      expect(byDate[ymdAgo(2)]).toBe(100);
      expect(byDate[ymdAgo(4)]).toBe(0);
    });

    it('returns 0 when there are no matching activity log rows', async () => {
      const result = await getAnalyticsOverview({ range });

      expect(result.autonomyRate.value).toBe(0);
      expect(result.autonomyRate.series.every((p) => p.value === 0)).toBe(true);
    });
  });

  describe('avgResponseMs', () => {
    it('computes the weighted average latency across matching rows', async () => {
      // Day -4: 100 + 200 -> per-day avg 150
      await makeActivityLog({ createdAt: isoAgo(4), latencyMs: 100 });
      await makeActivityLog({ createdAt: isoAgo(4), latencyMs: 200 });
      // Day -1: 300 -> per-day avg 300
      await makeActivityLog({ createdAt: isoAgo(1), latencyMs: 300 });
      // Excluded: null latency
      await makeActivityLog({ createdAt: isoAgo(1), latencyMs: null });
      // Excluded: failed status
      await makeActivityLog({ createdAt: isoAgo(1), status: 'failed', latencyMs: 999 });

      const result = await getAnalyticsOverview({ range });

      // Global weighted avg: (100+200+300) / 3 = 200
      expect(result.avgResponseMs.value).toBe(200);

      const byDate = Object.fromEntries(result.avgResponseMs.series.map((p) => [p.date, p.value]));
      expect(byDate[ymdAgo(4)]).toBe(150);
      expect(byDate[ymdAgo(1)]).toBe(300);
      expect(byDate[ymdAgo(3)]).toBe(0);
    });
  });

  describe('activeGuests', () => {
    it('counts distinct guests with inbound messages, globally and per day', async () => {
      const guestA = await makeGuest(isoAgo(6));
      const guestB = await makeGuest(isoAgo(6));
      const convoA = await makeConversation(guestA);
      const convoB = await makeConversation(guestB);
      // Conversation with no linked guest — must be excluded entirely
      const convoNoGuest = await makeConversation(null);

      await makeMessage(convoA, 'inbound', isoAgo(6));
      await makeMessage(convoA, 'inbound', isoAgo(1)); // same guest, different day
      await makeMessage(convoB, 'inbound', isoAgo(1)); // second guest, same day as above
      await makeMessage(convoA, 'outbound', isoAgo(1)); // excluded: outbound
      await makeMessage(convoNoGuest, 'inbound', isoAgo(1)); // excluded: no guest

      const result = await getAnalyticsOverview({ range });

      // Distinct guests over the whole period: guestA, guestB
      expect(result.activeGuests.value).toBe(2);

      const byDate = Object.fromEntries(result.activeGuests.series.map((p) => [p.date, p.value]));
      expect(byDate[ymdAgo(6)]).toBe(1); // guestA only
      expect(byDate[ymdAgo(1)]).toBe(2); // guestA + guestB
      expect(byDate[ymdAgo(0)]).toBe(0);
    });
  });

  describe('newGuests', () => {
    it('counts guests created within the range, bucketed by day', async () => {
      await makeGuest(isoAgo(6));
      await makeGuest(isoAgo(6));
      await makeGuest(isoAgo(2));
      // Excluded: created outside the range
      await makeGuest(isoAgo(15));

      const result = await getAnalyticsOverview({ range });

      expect(result.newGuests.value).toBe(3);

      const byDate = Object.fromEntries(result.newGuests.series.map((p) => [p.date, p.value]));
      expect(byDate[ymdAgo(6)]).toBe(2);
      expect(byDate[ymdAgo(2)]).toBe(1);
      expect(byDate[ymdAgo(0)]).toBe(0);
    });
  });

  describe('compareRange and delta', () => {
    it('computes compareValue and a positive percentage delta', async () => {
      const guestId = await makeGuest(isoAgo(6));
      const convoId = await makeConversation(guestId);

      // Primary range: 4 inbound messages
      await makeMessage(convoId, 'inbound', isoAgo(6));
      await makeMessage(convoId, 'inbound', isoAgo(5));
      await makeMessage(convoId, 'inbound', isoAgo(4));
      await makeMessage(convoId, 'inbound', isoAgo(3));

      // Compare range: the 7 days before the primary range — 2 inbound messages
      const compareRange = { from: ymdAgo(13), to: ymdAgo(7) };
      await makeMessage(convoId, 'inbound', isoAgo(13));
      await makeMessage(convoId, 'inbound', isoAgo(9));

      const result = await getAnalyticsOverview({ range, compareRange });

      expect(result.totalMessages.value).toBe(4);
      expect(result.totalMessages.compareValue).toBe(2);
      // ((4 - 2) / 2) * 100 = 100.0
      expect(result.totalMessages.delta).toBe(100);
    });

    it('returns compareValue 0 (not null) but delta null when the compare period has zero activity', async () => {
      const guestId = await makeGuest(isoAgo(6));
      const convoId = await makeConversation(guestId);
      await makeMessage(convoId, 'inbound', isoAgo(3));

      const compareRange = { from: ymdAgo(13), to: ymdAgo(7) };
      const result = await getAnalyticsOverview({ range, compareRange });

      expect(result.totalMessages.value).toBe(1);
      expect(result.totalMessages.compareValue).toBe(0);
      expect(result.totalMessages.delta).toBeNull();
    });

    it('leaves compareValue and delta null when no compareRange is given', async () => {
      const result = await getAnalyticsOverview({ range });

      expect(result.totalMessages.compareValue).toBeNull();
      expect(result.totalMessages.delta).toBeNull();
      expect(result.autonomyRate.compareValue).toBeNull();
      expect(result.avgResponseMs.compareValue).toBeNull();
      expect(result.activeGuests.compareValue).toBeNull();
      expect(result.newGuests.compareValue).toBeNull();
    });
  });

  describe('utcOffsetMinutes', () => {
    it('buckets a UTC timestamp into the next local day for a positive offset', async () => {
      const guestId = await makeGuest(isoAgo(6));
      const convoId = await makeConversation(guestId);

      // 22:30 UTC + 5:00 offset -> 03:30 the next local day
      await makeMessage(convoId, 'inbound', isoAgo(4, 22));
      // 10:00 UTC + 5:00 offset -> 15:00 the same local day
      await makeMessage(convoId, 'inbound', isoAgo(2, 10));

      const localRange = { from: ymdAgo(4), to: ymdAgo(1) };
      const result = await getAnalyticsOverview({ range: localRange, utcOffsetMinutes: 300 });

      expect(result.totalMessages.value).toBe(2);
      const byDate = Object.fromEntries(result.totalMessages.series.map((p) => [p.date, p.value]));
      // The 22:30 UTC message shifted into the following local day
      const shiftedDate = new Date(`${ymdAgo(4)}T00:00:00Z`);
      shiftedDate.setUTCDate(shiftedDate.getUTCDate() + 1);
      const shiftedYmd = shiftedDate.toISOString().slice(0, 10);
      expect(byDate[shiftedYmd]).toBe(1);
      expect(byDate[ymdAgo(2)]).toBe(1);
    });

    it('buckets a UTC timestamp into the previous local day for a negative offset', async () => {
      const guestId = await makeGuest(isoAgo(6));
      const convoId = await makeConversation(guestId);

      // 01:00 UTC - 2:00 offset -> 23:00 the previous local day
      await makeMessage(convoId, 'inbound', isoAgo(3, 1));

      const localRange = { from: ymdAgo(4), to: ymdAgo(2) };
      const result = await getAnalyticsOverview({ range: localRange, utcOffsetMinutes: -120 });

      expect(result.totalMessages.value).toBe(1);
      const byDate = Object.fromEntries(result.totalMessages.series.map((p) => [p.date, p.value]));
      const shiftedDate = new Date(`${ymdAgo(3)}T00:00:00Z`);
      shiftedDate.setUTCDate(shiftedDate.getUTCDate() - 1);
      const shiftedYmd = shiftedDate.toISOString().slice(0, 10);
      expect(byDate[shiftedYmd]).toBe(1);
    });
  });
});
