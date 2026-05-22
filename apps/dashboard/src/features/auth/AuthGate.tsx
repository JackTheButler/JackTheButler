import type { ReactNode } from 'react';
import { Loading } from '@/components/Loading';
import { useSession } from './useAuth';
import { LoginScreen, SetupScreen } from './AuthScreens';

/** Gate the whole app: loading → first-install setup → login → app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') {
    // Delay-show + full-height centering; a fast session check shows nothing.
    return (
      <div className="grid min-h-full place-items-center">
        <Loading size={72} />
      </div>
    );
  }
  if (status === 'needsSetup') return <SetupScreen />;
  if (status === 'unauthed') return <LoginScreen />;
  return <>{children}</>;
}
