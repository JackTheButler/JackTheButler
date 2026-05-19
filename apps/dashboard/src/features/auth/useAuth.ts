import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
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

export const useLogout = () => useSessionMutation(() => api.post('/api/auth/logout'));
