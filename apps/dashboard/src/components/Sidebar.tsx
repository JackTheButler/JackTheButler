import { Fragment } from 'react';
import {
  Inbox,
  MessageCircle,
  MessageCircleDashed,
  BookOpen,
  Activity,
  Blocks,
  Bot,
  Users,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LogOut,
  Download,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { useSidebar } from '@/lib/sidebar';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { useSlidingIndicator } from '@/lib/useSlidingIndicator';
import { useSession, useLogout } from '@/features/auth/useAuth';
import { useInboxCount } from '@/features/inbox/useConversations';
import {
  Avatar,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui';
import { JaneLogo } from '@/components/JaneLogo';

// `bottomGroup` items (Assistant, Apps, Settings) form the config section. A
// divider is drawn before the FIRST *visible* one — Assistant for admins,
// Settings for agents (who don't see Assistant/Apps) — so it never disappears.
const NAV = [
  { to: '/', label: 'Inbox', icon: Inbox, end: true },
  { to: '/analytics', label: 'Analytics', icon: Activity },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/team', label: 'Team', icon: Users, adminOnly: true },
  { to: '/assistant', label: 'Assistant', icon: Bot, adminOnly: true, bottomGroup: true },
  { to: '/apps', label: 'Apps', icon: Blocks, adminOnly: true, bottomGroup: true },
  { to: '/settings', label: 'Settings', icon: Settings, bottomGroup: true },
];

// Shared sidebar-row shape (nav item, theme toggle, account chip).
const ROW = 'flex h-11 items-center rounded-xl';
const rowWidth = (collapsed: boolean) =>
  collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3';

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
        <JaneLogo size={20} />
      </div>
      {!collapsed && <span className="text-sm font-semibold">Jane</span>}
    </div>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { user } = useSession();
  // Agents see only Inbox + Knowledge; admins see everything.
  const nav = NAV.filter((item) => !item.adminOnly || user?.role === 'admin');
  const activeIndex = nav.findIndex(({ to, end }) =>
    end ? pathname === to : pathname === to || pathname.startsWith(to + '/'),
  );
  // Divider before the first visible bottom-group item (not if it's first).
  const dividerIndex = nav.findIndex((item) => item.bottomGroup);
  const { containerRef, itemsRef, rect, transition } = useSlidingIndicator(activeIndex);
  const inboxCount = useInboxCount();

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
      }}
      className="relative flex flex-1 flex-col gap-1"
    >
      {rect && (
        <span
          aria-hidden
          className={cn(
            'absolute rounded-xl bg-accent-soft',
            transition && 'transition-[top,left,width,height] duration-200 ease-out',
          )}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      {nav.map(({ to, label, icon: Icon, end }, i) => {
        const badge = to === '/' ? inboxCount : 0;
        return (
          <Fragment key={to}>
            {i === dividerIndex && dividerIndex > 0 && (
              <div
                role="separator"
                className={cn('my-1 h-px bg-line', collapsed ? 'mx-auto w-6' : 'mx-3')}
              />
            )}
            <NavLink
            to={to}
            end={end}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative z-10 transition-colors',
                ROW,
                rowWidth(collapsed),
                isActive ? 'text-accent' : 'text-muted hover:bg-surface hover:text-ink',
              )
            }
          >
            <span className="relative shrink-0">
              <Icon size={20} strokeWidth={2} />
              {collapsed && badge > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </span>
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
            {!collapsed && badge > 0 && (
              <Badge tone="accent" className="ml-auto">
                {badge}
              </Badge>
            )}
            </NavLink>
          </Fragment>
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
      className={cn(ROW, rowWidth(collapsed), 'text-muted hover:bg-surface hover:text-ink')}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      {!collapsed && (
        <span className="text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      )}
    </button>
  );
}

/** One-click PWA install — only rendered on browsers that can prompt and when
 *  the app isn't already installed (see useInstallPrompt). */
function InstallButton({ collapsed }: { collapsed: boolean }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      onClick={promptInstall}
      title="Install app"
      aria-label="Install app"
      className={cn(ROW, rowWidth(collapsed), 'text-muted hover:bg-surface hover:text-ink')}
    >
      <Download size={20} />
      {!collapsed && <span className="text-sm font-medium">Install app</span>}
    </button>
  );
}

function AccountChip({ collapsed }: { collapsed: boolean }) {
  const { user } = useSession();
  const logout = useLogout();
  const name = user?.name ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'mt-2 flex items-center rounded-xl text-left hover:bg-surface',
          rowWidth(collapsed),
          !collapsed && 'py-2',
        )}
        title={collapsed ? name : undefined}
      >
        <Avatar name={name} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem destructive onSelect={() => logout.mutate(undefined)}>
          <LogOut size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopSidebar() {
  const { collapsed, toggle: toggleSidebar } = useSidebar();
  return (
    <nav
      className={cn(
        'group relative hidden shrink-0 flex-col border-r border-line bg-panel py-4 transition-[width] duration-200 ease-out md:flex',
        collapsed ? 'w-16 items-center' : 'w-56 px-3',
      )}
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
      <NavList collapsed={collapsed} />
      <InstallButton collapsed={collapsed} />
      <ThemeButton collapsed={collapsed} />
      <AccountChip collapsed={collapsed} />
    </nav>
  );
}

function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const inboxCount = useInboxCount();
  const close = () => setMobileOpen(false);
  return (
    <div className="md:hidden">
      {/* Slim top bar: logo opens the menu; an inbox shortcut sits on the right. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-panel px-3">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent"
        >
          <JaneLogo size={20} />
        </button>
        <NavLink
          to="/"
          end
          aria-label={inboxCount > 0 ? `Inbox, ${inboxCount} unread` : 'Inbox'}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
        >
          <span className="relative">
            {inboxCount > 0 ? <MessageCircle size={20} /> : <MessageCircleDashed size={20} />}
            {inboxCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent">
                {inboxCount > 9 ? '9+' : inboxCount}
              </span>
            )}
          </span>
        </NavLink>
      </header>

      {/* Backdrop */}
      <div
        onClick={close}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Off-canvas drawer */}
      <nav
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-full flex-col bg-panel transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Matches the top navbar's h-14/px-3 exactly so logo + close
            land directly over the navbar's logo + hamburger. */}
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <Brand collapsed={false} />
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close menu">
            <X size={20} />
          </Button>
        </div>
        <div className="flex flex-1 flex-col px-3 py-4">
          <NavList collapsed={false} onNavigate={close} />
          <InstallButton collapsed={false} />
          <ThemeButton collapsed={false} />
          <AccountChip collapsed={false} />
        </div>
      </nav>
    </div>
  );
}

export function Sidebar() {
  // Both render; Tailwind responsive classes (CSS) decide which is visible.
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}
