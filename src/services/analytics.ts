/**
 * Analytics Service
 *
 * Aggregates time-series metrics for the dashboard overview.
 * All queries accept an explicit date range and UTC offset so callers can
 * request today, last 7 days, last 30 days, or any custom window in the
 * hotel's local timezone.
 */

import { sql, and, eq, type AnyColumn, type SQL } from 'drizzle-orm';
import { db, messages, conversations, guests } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('analytics');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRange {
  /** YYYY-MM-DD in the hotel's local timezone */
  from: string;
  /** YYYY-MM-DD in the hotel's local timezone, inclusive */
  to: string;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface MetricResult {
  /** Aggregate value over the primary range */
  value: number;
  /** Aggregate value over the compare range (if provided) */
  compareValue: number | null;
  /** Percentage change: ((value - compareValue) / compareValue) * 100, 1 decimal */
  delta: number | null;
  /** Daily breakdown for the primary range */
  series: SeriesPoint[];
}

export interface AnalyticsOverview {
  totalMessages: MetricResult;
  activeGuests: MetricResult;
  newGuests: MetricResult;
}

export interface OverviewOptions {
  range: DateRange;
  compareRange?: DateRange | undefined;
  /** UTC offset in minutes, e.g. 300 for UTC+5, -330 for UTC-5:30. Defaults to 0. */
  utcOffsetMinutes?: number | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctDelta(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10; // 1 decimal
}

/**
 * Returns SQLite modifier strings for local-time conversions.
 * Returns null for both when offset is 0 so callers can skip the datetime() wrapper.
 *
 * offsetMod    — e.g. '+300 minutes' — added to UTC col to get local date
 * negOffsetMod — e.g. '-300 minutes' — subtracted from a local date string to get UTC
 */
function offsetModifiers(utcOffsetMinutes: number): { offsetMod: string | null; negOffsetMod: string | null } {
  if (utcOffsetMinutes === 0) return { offsetMod: null, negOffsetMod: null };
  const sign = utcOffsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(utcOffsetMinutes);
  const negSign = utcOffsetMinutes > 0 ? '-' : '+';
  return {
    offsetMod: `${sign}${abs} minutes`,
    negOffsetMod: `${negSign}${abs} minutes`,
  };
}

/** Fill every date in the range with 0 for days that have no data rows */
function toSeries(rows: { date: string; value: number }[], range: DateRange): SeriesPoint[] {
  const map = new Map(rows.map((r) => [r.date, r.value]));
  const series: SeriesPoint[] = [];
  const cursor = new Date(range.from + 'T00:00:00Z');
  const end = new Date(range.to + 'T00:00:00Z');
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    series.push({ date: d, value: map.get(d) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

type ColRef = AnyColumn | SQL<unknown>;

/**
 * SQL expression that buckets a UTC timestamp column into a local date string.
 * When offsetMod is null (UTC hotel) it skips the datetime() wrapper.
 *
 * Note: timestamps are stored as ISO-8601 ('2026-04-05T10:30:00.000Z').
 * Wrapping in datetime() normalises them to SQLite format before strftime.
 */
function localDateExpr(col: ColRef, offsetMod: string | null) {
  return offsetMod
    ? sql<string>`strftime('%Y-%m-%d', datetime(${col}, ${offsetMod}))`
    : sql<string>`strftime('%Y-%m-%d', ${col})`;
}

/**
 * WHERE predicate: col >= start of localDate in UTC.
 * Uses datetime(col) on the left so the ISO-8601 'T' vs SQLite ' ' format
 * mismatch does not corrupt boundary comparisons.
 */
function afterLocalDate(col: ColRef, localDate: string, negOffsetMod: string | null) {
  return negOffsetMod
    ? sql`datetime(${col}) >= datetime(${localDate}, ${negOffsetMod})`
    : sql`datetime(${col}) >= ${localDate}`;
}

/** WHERE predicate: col < start of the day after localDate in UTC */
function beforeNextLocalDay(col: ColRef, localDate: string, negOffsetMod: string | null) {
  return negOffsetMod
    ? sql`datetime(${col}) < datetime(${localDate}, '+1 day', ${negOffsetMod})`
    : sql`datetime(${col}) < date(${localDate}, '+1 day')`;
}

// ---------------------------------------------------------------------------
// Individual metric queries
// ---------------------------------------------------------------------------

async function queryTotalMessages(
  range: DateRange,
  offsetMod: string | null,
  negOffsetMod: string | null,
): Promise<{ total: number; series: SeriesPoint[] }> {
  const dateExpr = localDateExpr(messages.createdAt, offsetMod);

  const rows = await db
    .select({ date: dateExpr, value: sql<number>`cast(count(*) as integer)` })
    .from(messages)
    .where(and(
      eq(messages.direction, 'inbound'),
      afterLocalDate(messages.createdAt, range.from, negOffsetMod),
      beforeNextLocalDay(messages.createdAt, range.to, negOffsetMod),
    ))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return { total: rows.reduce((s, r) => s + r.value, 0), series: toSeries(rows, range) };
}

async function queryActiveGuests(
  range: DateRange,
  offsetMod: string | null,
  negOffsetMod: string | null,
): Promise<{ total: number; series: SeriesPoint[] }> {
  const dateExpr = localDateExpr(messages.createdAt, offsetMod);
  const whereClause = and(
    eq(messages.direction, 'inbound'),
    sql`${conversations.guestId} is not null`,
    afterLocalDate(messages.createdAt, range.from, negOffsetMod),
    beforeNextLocalDay(messages.createdAt, range.to, negOffsetMod),
  );

  // Daily series and de-duplicated total run as separate queries —
  // COUNT(DISTINCT) across the whole period cannot be derived from daily counts.
  const [rows, totalRow] = await Promise.all([
    db
      .select({ date: dateExpr, value: sql<number>`cast(count(distinct ${conversations.guestId}) as integer)` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(whereClause)
      .groupBy(dateExpr)
      .orderBy(dateExpr),

    db
      .select({ value: sql<number>`cast(count(distinct ${conversations.guestId}) as integer)` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(whereClause),
  ]);

  return { total: totalRow[0]?.value ?? 0, series: toSeries(rows, range) };
}

async function queryNewGuests(
  range: DateRange,
  offsetMod: string | null,
  negOffsetMod: string | null,
): Promise<{ total: number; series: SeriesPoint[] }> {
  const dateExpr = localDateExpr(guests.createdAt, offsetMod);

  const rows = await db
    .select({ date: dateExpr, value: sql<number>`cast(count(*) as integer)` })
    .from(guests)
    .where(and(
      afterLocalDate(guests.createdAt, range.from, negOffsetMod),
      beforeNextLocalDay(guests.createdAt, range.to, negOffsetMod),
    ))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return { total: rows.reduce((s, r) => s + r.value, 0), series: toSeries(rows, range) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAnalyticsOverview(opts: OverviewOptions): Promise<AnalyticsOverview> {
  const { range, compareRange, utcOffsetMinutes = 0 } = opts;
  const { offsetMod, negOffsetMod } = offsetModifiers(utcOffsetMinutes);

  log.debug({ range, compareRange, utcOffsetMinutes }, 'Fetching analytics overview');

  // Note: better-sqlite3 is synchronous, so these resolve sequentially despite Promise.all.
  const [msgs, activeGuests, newGuests] = await Promise.all([
    queryTotalMessages(range, offsetMod, negOffsetMod),
    queryActiveGuests(range, offsetMod, negOffsetMod),
    queryNewGuests(range, offsetMod, negOffsetMod),
  ]);

  let cmp: [
    Awaited<ReturnType<typeof queryTotalMessages>>,
    Awaited<ReturnType<typeof queryActiveGuests>>,
    Awaited<ReturnType<typeof queryNewGuests>>,
  ] | null = null;

  if (compareRange) {
    cmp = await Promise.all([
      queryTotalMessages(compareRange, offsetMod, negOffsetMod),
      queryActiveGuests(compareRange, offsetMod, negOffsetMod),
      queryNewGuests(compareRange, offsetMod, negOffsetMod),
    ]);
  }

  return {
    totalMessages: {
      value:        msgs.total,
      compareValue: cmp?.[0].total ?? null,
      delta:        pctDelta(msgs.total, cmp?.[0].total ?? null),
      series:       msgs.series,
    },
    activeGuests: {
      value:        activeGuests.total,
      compareValue: cmp?.[1].total ?? null,
      delta:        pctDelta(activeGuests.total, cmp?.[1].total ?? null),
      series:       activeGuests.series,
    },
    newGuests: {
      value:        newGuests.total,
      compareValue: cmp?.[2].total ?? null,
      delta:        pctDelta(newGuests.total, cmp?.[2].total ?? null),
      series:       newGuests.series,
    },
  };
}
