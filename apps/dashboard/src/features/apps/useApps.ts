import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function useAppMutation<V, TData = unknown>(fn: (v: V) => Promise<TData>, id: string) {
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
      api.post<AppDetail>(`/api/app/apps/${id}/${enabled ? 'enable' : 'disable'}`),
    id,
  );

export const useSaveAppConfig = (id: string) =>
  useAppMutation(
    (config: Record<string, unknown>) =>
      api.put<AppDetail>(`/api/app/apps/${id}/config`, { config }),
    id,
  );

/** Live connectivity test — actually hits the integration (e.g. Anthropic).
 *  Returns `{ok, detail?}`; HTTP 200 even when ok=false. The server persists
 *  the result in `app_configs.last_error`, so we invalidate the app query
 *  to surface it everywhere immediately. */
export function useCheckApp(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; detail?: string }>(`/api/app/apps/${id}/check`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app', id] });
      qc.invalidateQueries({ queryKey: ['apps'] });
    },
  });
}
