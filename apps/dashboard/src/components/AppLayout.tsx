import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { RealtimeProvider } from '@/lib/realtime';
import { useInboxRealtime } from '@/features/inbox/useConversations';

/** Persistent shell: the Sidebar mounts once and stays mounted while routes
 *  swap via <Outlet/> — so the active-nav indicator can animate between
 *  pages instead of remounting on every navigation.
 *
 *  The one app-wide realtime socket lives here (RealtimeProvider), so live
 *  updates work on every page. Feature-specific subscriptions (inbox, jobs,
 *  …) sit inside the provider and declare their own event interests. */
export function AppLayout() {
  return (
    <RealtimeProvider>
      <AppShell />
    </RealtimeProvider>
  );
}

function AppShell() {
  useInboxRealtime();
  return (
    <div className="flex h-full pt-14 md:pt-0">
      <Sidebar />
      <Outlet />
    </div>
  );
}
