import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StaffRole } from '@janetheoperator/shared';
import { api, ApiError } from '@/lib/api';
import { clearPersistedQueries } from '@/lib/queryPersist';

export interface User {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

interface SessionData {
  needsSetup: boolean;
  user: User | null;
}

const SESSION_KEY = ['session'] as const;

async function fetchSession(): Promise<SessionData> {
  const { needsSetup } = await api.get<{ needsSetup: boolean }>('/api/auth/setup-status');
  if (needsSetup) return { needsSetup: true, user: null };
  try {
    const { user } = await api.get<{ user: User }>('/api/auth/me');
    return { needsSetup: false, user };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { needsSetup: false, user: null };
    throw e;
  }
}

export type SessionStatus = 'loading' | 'needsSetup' | 'unauthed' | 'authed';

export function useSession() {
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession });
  const status: SessionStatus = !query.data
    ? 'loading'
    : query.data.needsSetup
      ? 'needsSetup'
      : query.data.user
        ? 'authed'
        : 'unauthed';
  return { status, user: query.data?.user ?? null } as const;
}

function useSessionMutation<V>(mutationFn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

export const useLogin = () =>
  useSessionMutation((v: { email: string; password: string }) =>
    api.post('/api/auth/login', v),
  );

export const useSetup = () =>
  useSessionMutation((v: { name: string; email: string; password: string }) =>
    api.post('/api/auth/setup', v),
  );

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      // Drop cached data (and its persisted copy) so it can't rehydrate for the
      // next agent on this device.
      clearPersistedQueries();
      qc.clear();
    },
  });
};

export const useAcceptInvite = () =>
  useSessionMutation((v: { token: string; name: string; password: string }) =>
    api.post('/api/auth/accept-invite', v),
  );

/** Resolve an invite token to its email so the accept page can show it.
 *  Errors (404) mean the token is invalid or already used. */
export const useInvitePreview = (token: string) =>
  useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<{ email: string; role: StaffRole }>(`/api/auth/invite?token=${token}`),
    enabled: token.length > 0,
    retry: false,
  });

/** Update your own display name. Invalidates the session so the new name
 *  shows everywhere (sidebar, etc.). */
export const useUpdateName = () =>
  useSessionMutation((v: { name: string }) => api.put('/api/app/account', v));

/** Change your own password. Not a session mutation — the session is unchanged. */
export const useChangePassword = () =>
  useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) =>
      api.post('/api/app/account/password', v),
  });
