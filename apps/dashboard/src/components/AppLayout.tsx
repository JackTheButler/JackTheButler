import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';

/** Persistent shell: the Sidebar mounts once and stays mounted while routes
 *  swap via <Outlet/> — so the active-nav indicator can animate between
 *  pages instead of remounting on every navigation. */
export function AppLayout() {
  return (
    <div className="flex h-full pt-14 md:pt-0">
      <Sidebar />
      <Outlet />
    </div>
  );
}
