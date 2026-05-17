import {
  Inbox,
  BookOpen,
  Blocks,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useSidebar } from '@/lib/sidebar';

const NAV = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'kb', label: 'Knowledge', icon: BookOpen },
  { key: 'apps', label: 'Apps', icon: Blocks },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ active = 'inbox' }: { active?: string }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { collapsed, toggle: toggleSidebar } = useSidebar();

  return (
    <nav
      className={`group relative flex flex-col border-r border-line bg-panel py-4 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-16 items-center' : 'w-56 px-3'
      }`}
    >
      {/* Edge collapse handle — sits on the border, revealed on hover/focus */}
      <button
        onClick={toggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label="Toggle sidebar"
        className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-line bg-panel text-muted opacity-0 shadow-sm transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </button>

      {/* Brand */}
      <div className={`mb-6 flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-sm font-bold text-on-accent">
          J
        </div>
        {!collapsed && <span className="text-sm font-semibold">Jane</span>}
      </div>

      {/* Nav items */}
      <div className="flex flex-1 flex-col gap-1">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active;
          return (
            <button
              key={key}
              title={collapsed ? label : undefined}
              className={`group flex h-11 items-center rounded-xl transition-colors ${
                collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3'
              } ${
                on
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={2} className="shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
            </button>
          );
        })}
      </div>

      {/* Theme toggle */}
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        aria-label="Toggle theme"
        className={`flex h-11 items-center rounded-xl text-muted hover:bg-surface hover:text-ink ${
          collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3'
        }`}
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        {!collapsed && (
          <span className="text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        )}
      </button>

      {/* Account */}
      <div
        className={`mt-2 flex items-center rounded-xl ${
          collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3 py-2'
        }`}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-muted ring-1 ring-line">
          AK
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">Arash K.</div>
            <div className="truncate text-xs text-muted">Support agent</div>
          </div>
        )}
      </div>
    </nav>
  );
}
