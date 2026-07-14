import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessProfile } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Single-row business profile. Server lazy-seeds defaults — GET always
 *  resolves to a usable shape, even on a fresh install. */

const KEY = ['business'] as const;

export function useBusiness() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<BusinessProfile>('/api/app/business'),
  });
}

export function useSaveBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: BusinessProfile) =>
      api.put<BusinessProfile>('/api/app/business', profile),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
