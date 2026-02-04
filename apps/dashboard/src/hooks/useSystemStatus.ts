import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * System issue from the API
 */
export interface SystemIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  action?: {
    label: string;
    route: string;
  };
}

/**
 * Completed setup step from the API
 */
export interface CompletedStep {
  type: string;
  message: string;
}

/**
 * System status response from the API
 */
export interface SystemStatus {
  healthy: boolean;
  issues: SystemIssue[];
  completedSteps: CompletedStep[];
  providers: {
    completion: string | null;
    embedding: string | null;
    completionIsLocal: boolean;
    embeddingIsLocal: boolean;
  };
  extensions: {
    ai: number;
    channel: number;
    pms: number;
    tool: number;
  };
  knowledgeBase: {
    total: number;
    withoutEmbeddings: number;
    needsReindex: boolean;
  };
}

/**
 * Hook to fetch system status
 * Used to display action items and warnings in the dashboard
 */
export function useSystemStatus() {
  const query = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.get<SystemStatus>('/system/status'),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  return {
    ...query,
    isHealthy: query.data?.healthy ?? true,
    issues: query.data?.issues ?? [],
    completedSteps: query.data?.completedSteps ?? [],
    criticalIssues: query.data?.issues?.filter((i) => i.severity === 'critical') ?? [],
    warningIssues: query.data?.issues?.filter((i) => i.severity === 'warning') ?? [],
    infoIssues: query.data?.issues?.filter((i) => i.severity === 'info') ?? [],
    providers: query.data?.providers ?? null,
    extensions: query.data?.extensions ?? null,
    knowledgeBase: query.data?.knowledgeBase ?? null,
  };
}
