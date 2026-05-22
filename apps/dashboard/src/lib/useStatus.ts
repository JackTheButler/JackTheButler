import { useQuery } from '@tanstack/react-query';
import type { SystemStatus } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Workspace status (connected providers + coarse health). Readable by all
 *  staff, so role-restricted pages can render correct hints without the
 *  admin-only Apps endpoint. */
export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<SystemStatus>('/api/app/status'),
  });
}
