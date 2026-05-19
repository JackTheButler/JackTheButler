import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Check, AlertCircle, Info, X } from 'lucide-react';
import { cn } from './cn';

/**
 * Toast primitive (sonner-style). Imperative `toast.*` API backed by a
 * zustand store; mount <Toaster/> once at the app root. Toasts collapse
 * into a single overlapping stack — newest in front, older ones scaled
 * and tucked behind — with smooth enter/exit transitions.
 */

type Variant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
  leaving: boolean;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, variant: Variant) => void;
  beginDismiss: (id: number) => void;
}

const DURATION = 3500;
const EXIT_MS = 240;
const MAX_VISIBLE = 3;
let nextId = 1;

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, variant) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, leaving: false }] }));
    setTimeout(() => get().beginDismiss(id), DURATION);
  },
  beginDismiss: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      EXIT_MS,
    );
  },
}));

export const toast = {
  success: (m: string) => useToastStore.getState().push(m, 'success'),
  error: (m: string) => useToastStore.getState().push(m, 'error'),
  info: (m: string) => useToastStore.getState().push(m, 'info'),
};

const ICON = { success: Check, error: AlertCircle, info: Info } as const;
const ACCENT = {
  success: 'text-accent',
  error: 'text-red-600',
  info: 'text-muted',
} as const;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function ToastRow({
  toast: t,
  depth,
  onClose,
}: {
  toast: ToastItem;
  depth: number; // 0 = newest / front
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hidden = depth >= MAX_VISIBLE;
  const transform = !entered
    ? 'translateX(-50%) translateY(-18px) scale(0.95)'
    : t.leaving
      ? 'translateX(-50%) translateY(-10px) scale(0.92)'
      : `translateX(-50%) translateY(${depth * 12}px) scale(${1 - depth * 0.045})`;
  const opacity = !entered || t.leaving ? 0 : hidden ? 0 : 1;

  const Icon = ICON[t.variant];
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        zIndex: 1000 - depth,
        transform,
        opacity,
        pointerEvents: hidden || t.leaving ? 'none' : 'auto',
        transition: `transform 280ms ${EASE}, opacity 220ms ${EASE}`,
      }}
      className="flex w-[min(92vw,24rem)] items-start gap-2.5 rounded-xl border border-line bg-panel px-3.5 py-3 text-sm shadow-lg"
    >
      <Icon size={16} className={cn('mt-0.5 shrink-0', ACCENT[t.variant])} />
      <span className="min-w-0 flex-1 break-words">{t.message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 text-muted transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const beginDismiss = useToastStore((s) => s.beginDismiss);
  const last = toasts.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[2147483600] h-0">
      {toasts.map((t, i) => (
        <ToastRow
          key={t.id}
          toast={t}
          depth={last - i}
          onClose={() => beginDismiss(t.id)}
        />
      ))}
    </div>
  );
}
