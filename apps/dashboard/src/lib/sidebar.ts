import { create } from 'zustand';

function initialCollapsed(): boolean {
  return localStorage.getItem('sidebar') !== 'expanded';
}

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  collapsed: initialCollapsed(),
  toggle: () => {
    const next = !get().collapsed;
    localStorage.setItem('sidebar', next ? 'collapsed' : 'expanded');
    set({ collapsed: next });
  },
}));
