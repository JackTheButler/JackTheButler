import type { ReactNode } from 'react';
import { useSession } from './useAuth';
import { LoginScreen, SetupScreen } from './AuthScreens';

/** Gate the whole app: loading → first-install setup → login → app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') {
    return <div className="grid min-h-full place-items-center text-sm text-muted">Loading…</div>;
  }
  if (status === 'needsSetup') return <SetupScreen />;
  if (status === 'unauthed') return <LoginScreen />;
  return <>{children}</>;
}
