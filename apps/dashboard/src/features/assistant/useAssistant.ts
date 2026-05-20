import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistantProfile } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Single-row assistant profile. Server lazy-seeds defaults — GET always
 *  resolves to a usable shape, even on a fresh install. */

const KEY = ['assistant'] as const;

export function useAssistant() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<AssistantProfile>('/api/app/assistant'),
  });
}

export function useSaveAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: AssistantProfile) =>
      api.put<AssistantProfile>('/api/app/assistant', profile),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
