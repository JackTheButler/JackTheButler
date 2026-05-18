import type { ReactNode } from 'react';

/** Scrollable content area for non-Inbox pages. The Sidebar is provided
 *  once by AppLayout; this is just the page's main region. */
export function PageShell({ children }: { children: ReactNode }) {
  return <main className="flex-1 overflow-y-auto">{children}</main>;
}
