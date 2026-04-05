import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { subDays, format } from 'date-fns';

// ---------------------------------------------------------------------------
// Types (mirror the backend response)
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface MetricResult {
  value: number;
  compareValue: number | null;
  delta: number | null;
  series: SeriesPoint[];
}

export interface AnalyticsOverview {
  totalMessages: MetricResult;
  autonomyRate: MetricResult;
  avgResponseMs: MetricResult;
  activeGuests: MetricResult;
  newGuests: MetricResult;
}

// ---------------------------------------------------------------------------
// Preset ranges
// ---------------------------------------------------------------------------

export type RangePreset = 'today' | 'yesterday' | '3d' | '7d' | '14d' | '30d';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function fmt(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

const today = () => fmt(new Date());
const daysAgo = (n: number) => fmt(subDays(new Date(), n));

export function rangeFromPreset(preset: RangePreset): { range: DateRange; compareRange: DateRange } {
  const t = new Date();

  switch (preset) {
    case 'today':
      return {
        range:        { from: today(), to: today() },
        compareRange: { from: daysAgo(1), to: daysAgo(1) },
      };
    case 'yesterday': {
      const y = fmt(subDays(t, 1));
      const d2 = fmt(subDays(t, 2));
      return {
        range:        { from: y, to: y },
        compareRange: { from: d2, to: d2 },
      };
    }
    case '3d':
      return {
        range:        { from: daysAgo(2), to: today() },
        compareRange: { from: daysAgo(5), to: daysAgo(3) },
      };
    case '7d':
      return {
        range:        { from: daysAgo(6), to: today() },
        compareRange: { from: daysAgo(13), to: daysAgo(7) },
      };
    case '14d':
      return {
        range:        { from: daysAgo(13), to: today() },
        compareRange: { from: daysAgo(27), to: daysAgo(14) },
      };
    case '30d':
      return {
        range:        { from: daysAgo(29), to: today() },
        compareRange: { from: daysAgo(59), to: daysAgo(30) },
      };
  }
}

/** Auto-refresh interval by preset — shorter for recent ranges where data changes */
function refetchIntervalFor(preset: RangePreset): number | false {
  switch (preset) {
    case 'today':     return 60_000;       // 1 min — data changes throughout the day
    case 'yesterday': return 5 * 60_000;   // 5 min — mostly stable but may still update
    case '3d':        return 5 * 60_000;
    default:          return false;        // 7d / 14d / 30d — stable, no auto-refresh
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAnalyticsOptions {
  preset?: RangePreset;
  range?: DateRange;
  compareRange?: DateRange;
}

export function useAnalytics({ preset = '7d', range, compareRange }: UseAnalyticsOptions = {}) {
  const resolved = rangeFromPreset(preset);
  const from    = range?.from        ?? resolved.range.from;
  const to      = range?.to          ?? resolved.range.to;
  const cmpFrom = compareRange?.from ?? resolved.compareRange.from;
  const cmpTo   = compareRange?.to   ?? resolved.compareRange.to;

  // Send the browser's UTC offset so the backend groups by local hotel time.
  // getTimezoneOffset() returns the *negation* of the standard UTC offset.
  const utcOffset = -new Date().getTimezoneOffset();

  const query = useQuery({
    queryKey: ['analytics-overview', from, to, cmpFrom, cmpTo, utcOffset],
    queryFn: () =>
      api.get<AnalyticsOverview>(
        `/analytics/overview?from=${from}&to=${to}&compareFrom=${cmpFrom}&compareTo=${cmpTo}&utcOffset=${utcOffset}`
      ),
    staleTime: 60_000,
    refetchInterval: refetchIntervalFor(preset),
  });

  // Return the resolved range so callers don't need to call rangeFromPreset again
  return { ...query, resolvedRange: resolved.range };
}
