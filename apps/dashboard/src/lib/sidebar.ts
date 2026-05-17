import { create } from 'zustand';

function initialCollapsed(): boolean {
  return localStorage.getItem('sidebar') !== 'expanded';
}

interface SidebarState {
  /** Desktop: collapsed icon-rail vs expanded. Persisted. */
  collapsed: boolean;
  toggle: () => void;
  /** Mobile: off-canvas drawer open state. Not persisted. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  collapsed: initialCollapsed(),
  toggle: () => {
    const next = !get().collapsed;
    localStorage.setItem('sidebar', next ? 'collapsed' : 'expanded');
    set({ collapsed: next });
  },
  mobileOpen: false,
  setMobileOpen: (open) => set({ mobileOpen: open }),
}));
