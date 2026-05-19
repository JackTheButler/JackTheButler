import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppDetail, AppSummary } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Apps framework data layer (real /api/app/apps — no mock catalog). */

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => api.get<{ apps: AppSummary[] }>('/api/app/apps'),
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['app', id],
    queryFn: () => api.get<AppDetail>(`/api/app/apps/${id}`),
  });
}

function useAppMutation<V>(fn: (v: V) => Promise<unknown>, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      qc.invalidateQueries({ queryKey: ['app', id] });
    },
  });
}

export const useSetAppEnabled = (id: string) =>
  useAppMutation(
    (enabled: boolean) =>
      api.post(`/api/app/apps/${id}/${enabled ? 'enable' : 'disable'}`),
    id,
  );

export const useSaveAppConfig = (id: string) =>
  useAppMutation(
    (config: Record<string, unknown>) =>
      api.put(`/api/app/apps/${id}/config`, { config }),
    id,
  );
