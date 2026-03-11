import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LogEntry {
  id: string;
  source: string;
  eventType: string;
  status: 'success' | 'failed';
  createdAt: string;
  timeAgo: string;
  latencyMs: number | null;
  errorMessage: string | null;
  details: Record<string, unknown> | null;
}

interface SystemLogsResponse {
  logs: LogEntry[];
  hasMore: boolean;
  offset: number;
}

export interface SystemLogsFilters {
  source: string;
  status: string;
  from: string;
  to: string;
  limit: number;
}

export function useSystemLogs(filters: SystemLogsFilters) {
  return useQuery({
    queryKey: ['system-logs', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.source !== 'all') params.set('source', filters.source);
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to)   params.set('to',   filters.to);
      params.set('limit', String(filters.limit));
      return api.get<SystemLogsResponse>(`/system/logs?${params.toString()}`);
    },
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}
