import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardSocket } from '@/features/inbox/useConversations';

/** Persistent shell: the Sidebar mounts once and stays mounted while routes
 *  swap via <Outlet/> — so the active-nav indicator can animate between
 *  pages instead of remounting on every navigation. One app-wide dashboard
 *  socket lives here so live updates (and the Inbox badge) work everywhere. */
export function AppLayout() {
  useDashboardSocket();
  return (
    <div className="flex h-full pt-14 md:pt-0">
      <Sidebar />
      <Outlet />
    </div>
  );
}
