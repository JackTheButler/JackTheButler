import { useQuery } from '@tanstack/react-query';
import type { LiveStats } from '@janetheoperator/shared';
import { api } from '@/lib/api';

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
