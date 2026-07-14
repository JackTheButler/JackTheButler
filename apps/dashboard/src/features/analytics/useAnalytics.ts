import { useQuery } from '@tanstack/react-query';
import type { Breakdowns, KpiStats, LiveStats, TrendStats } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Build the `?from&to&agent` query shared by the historical endpoints. */
function rangeParams(from: string, to: string, agentId?: string | null): string {
  const p = new URLSearchParams({ from, to });
  if (agentId) p.set('agent', agentId);
  return p.toString();
}

/** Live queue stats. Polls so the strip stays current without a socket; the
 *  server scopes the payload to the viewer's role. Admins may pass an `agentId`
 *  to view one agent's queue (ignored by the server for non-admins). */
export function useLiveStats(agentId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'live', agentId ?? 'default'],
    queryFn: () =>
      api.get<LiveStats>(
        `/api/app/analytics/live${agentId ? `?agent=${encodeURIComponent(agentId)}` : ''}`,
      ),
    refetchInterval: 15_000,
  });
}

/** Historical KPIs over `[from, to]` (inclusive YYYY-MM-DD). Admins may pass
 *  `agentId` to scope to one agent (ignored by the server for non-admins). */
export function useKpis(from: string, to: string, agentId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'kpis', from, to, agentId ?? 'default'],
    queryFn: () => api.get<KpiStats>(`/api/app/analytics/kpis?${rangeParams(from, to, agentId)}`),
  });
}

/** Time-bucketed trends over a date range, same scoping as {@link useKpis}. */
export function useTrends(from: string, to: string, agentId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'trends', from, to, agentId ?? 'default'],
    queryFn: () =>
      api.get<TrendStats>(`/api/app/analytics/trends?${rangeParams(from, to, agentId)}`),
  });
}

/** Aggregate breakdowns (workload, channels, heatmap), same scoping. */
export function useBreakdowns(from: string, to: string, agentId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'breakdowns', from, to, agentId ?? 'default'],
    queryFn: () =>
      api.get<Breakdowns>(`/api/app/analytics/breakdowns?${rangeParams(from, to, agentId)}`),
  });
}
