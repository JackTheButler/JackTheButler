import { create } from 'zustand';

type Theme = 'light' | 'dark';
type Origin = { x: number; y: number };

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function initialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const startup = initialTheme();
applyTheme(startup); // apply before first render to avoid a flash

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Reveal the new theme with a circle expanding from `origin` (the toggle button). */
function animateThemeChange(apply: () => void, origin: Origin) {
  const doc = document as ViewTransitionDoc;

  if (!doc.startViewTransition || reduceMotion()) {
    apply();
    return;
  }

  const { x, y } = origin;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = doc.startViewTransition(apply);
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 480,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  });
}

interface ThemeState {
  theme: Theme;
  toggle: (origin?: Origin) => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: startup,
  toggle: (origin) => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    const apply = () => {
      localStorage.setItem('theme', next);
      applyTheme(next);
      set({ theme: next });
    };
    animateThemeChange(apply, origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  },
}));
