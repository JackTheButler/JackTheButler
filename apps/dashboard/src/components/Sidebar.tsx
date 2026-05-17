import {
  Inbox,
  BookOpen,
  Blocks,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useSidebar } from '@/lib/sidebar';

const NAV = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'kb', label: 'Knowledge', icon: BookOpen },
  { key: 'apps', label: 'Apps', icon: Blocks },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-sm font-bold text-on-accent">
        J
      </div>
      {!collapsed && <span className="text-sm font-semibold">Jane</span>}
    </div>
  );
}

function NavList({
  collapsed,
  active,
  onNavigate,
}: {
  collapsed: boolean;
  active: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      {NAV.map(({ key, label, icon: Icon }) => {
        const on = key === active;
        return (
          <button
            key={key}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`group flex h-11 items-center rounded-xl transition-colors ${
              collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3'
            } ${on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface hover:text-ink'}`}
          >
            <Icon size={20} strokeWidth={2} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ThemeButton({ collapsed }: { collapsed: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
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
  );
}

function AccountChip({ collapsed }: { collapsed: boolean }) {
  return (
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
  );
}

function DesktopSidebar({ active }: { active: string }) {
  const { collapsed, toggle: toggleSidebar } = useSidebar();
  return (
    <nav
      className={`group relative hidden shrink-0 flex-col border-r border-line bg-panel py-4 transition-[width] duration-200 ease-out md:flex ${
        collapsed ? 'w-16 items-center' : 'w-56 px-3'
      }`}
    >
      <button
        onClick={toggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label="Toggle sidebar"
        className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-line bg-panel text-muted opacity-0 shadow-sm transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
      </button>

      <div className="mb-6">
        <Brand collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} active={active} />
      <ThemeButton collapsed={collapsed} />
      <AccountChip collapsed={collapsed} />
    </nav>
  );
}

function MobileSidebar({ active }: { active: string }) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const close = () => setMobileOpen(false);
  return (
    <div className="md:hidden">
      {/* Slim top bar with hamburger */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-panel px-3">
        <Brand collapsed={false} />
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Backdrop */}
      <div
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Off-canvas drawer */}
      <nav
        className={`fixed inset-y-0 left-0 z-50 flex w-full flex-col bg-panel transition-transform duration-200 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Matches the top navbar's h-14/px-3 exactly so logo + close
            land directly over the navbar's logo + hamburger. */}
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <Brand collapsed={false} />
          <button
            onClick={close}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-1 flex-col px-3 py-4">
          <NavList collapsed={false} active={active} onNavigate={close} />
          <ThemeButton collapsed={false} />
          <AccountChip collapsed={false} />
        </div>
      </nav>
    </div>
  );
}

export function Sidebar({ active = 'inbox' }: { active?: string }) {
  // Both render; Tailwind responsive classes (CSS) decide which is visible.
  return (
    <>
      <DesktopSidebar active={active} />
      <MobileSidebar active={active} />
    </>
  );
}
