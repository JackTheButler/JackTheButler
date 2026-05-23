import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffMember, StaffRole } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Team / staff data layer. Admin-only endpoints (the Team page is admin-only). */

const KEY = ['staff'] as const;

export function useTeam() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ members: StaffMember[] }>('/api/app/staff'),
  });
}

export interface InviteResult {
  member: StaffMember;
  token: string;
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: StaffRole }) =>
      api.post<InviteResult>('/api/app/staff/invite', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: StaffRole }) =>
      api.post<StaffMember>(`/api/app/staff/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'disable' | 'enable' }) =>
      api.post<StaffMember>(`/api/app/staff/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Cancel a pending invite — hard-deletes the not-yet-joined row. */
export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/app/staff/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
