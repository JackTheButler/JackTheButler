import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export interface AppHealthItem {
  appId: string;
  category: string;
  name: string;
  status: HealthStatus;
  summary: string;
  activityCount: number | null;
  detail: string;
  avgLatencyMs: number | null;
  latencyTrend: 'up' | 'down' | 'stable' | null;
  lastErrorRaw: string | null;
  partialFailure: string | null;
  errorDescription: string | null;
}

interface SystemHealthResponse {
  apps: AppHealthItem[];
}

export function useSystemHealth({ refetchInterval = 30_000 }: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get<SystemHealthResponse>('/system/health'),
    refetchInterval,
    staleTime: 15_000,
  });
}
