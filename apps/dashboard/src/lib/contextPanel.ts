import { create } from 'zustand';

function initialOpen(): boolean {
  return localStorage.getItem('contextPanel') !== 'closed';
}

interface ContextPanelState {
  open: boolean;
  toggle: () => void;
}

export const useContextPanel = create<ContextPanelState>((set, get) => ({
  open: initialOpen(),
  toggle: () => {
    const next = !get().open;
    localStorage.setItem('contextPanel', next ? 'open' : 'closed');
    set({ open: next });
  },
}));
