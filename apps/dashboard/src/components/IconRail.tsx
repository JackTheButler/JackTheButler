import { Inbox, BookOpen, Blocks, Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const NAV = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'kb', label: 'Knowledge', icon: BookOpen },
  { key: 'apps', label: 'Apps', icon: Blocks },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function IconRail({ active = 'inbox' }: { active?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <nav className="flex w-16 flex-col items-center border-r border-line bg-panel py-4">
      <div className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-accent text-sm font-bold text-on-accent">
        J
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active;
          return (
            <button
              key={key}
              title={label}
              className={`group relative grid h-11 w-11 place-items-center rounded-xl transition-colors ${
                on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={2} />
            </button>
          );
        })}
      </div>
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        aria-label="Toggle theme"
        className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="mt-2 grid h-9 w-9 place-items-center rounded-full bg-surface text-xs font-semibold text-muted">
        AK
      </div>
    </nav>
  );
}
