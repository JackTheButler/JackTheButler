import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PageActionsProvider, usePageActions } from '@/contexts/PageActionsContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Home,
  MessageSquare,
  ClipboardList,
  Bell,
  Puzzle,
  Zap,
  SlidersHorizontal,
  ChevronUp,
  LogOut,
  User,
  Users,
  CalendarDays,
  Settings,
  Globe,
  Wrench,
  BookOpen,
  PanelLeft,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { useTheme } from '@/contexts/ThemeContext';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavSection {
  id?: string;
  title?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  items: NavItem[];
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, isAuthenticated, logout, checkAuth } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-expanded-sections');
    return saved ? JSON.parse(saved) : { tools: false, settings: false };
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const themeToggleRef = useRef<HTMLDivElement>(null);
  const toggleTheme = async () => {
    const newTheme = isDark ? 'light' : 'dark';
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }
    const el = themeToggleRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty('--theme-toggle-x', `${rect.left + rect.width / 2}px`);
      document.documentElement.style.setProperty('--theme-toggle-y', `${rect.top + rect.height / 2}px`);
    }
    await document.startViewTransition(() => setTheme(newTheme)).ready;
  };

  // Connect to WebSocket for real-time updates
  useWebSocket();

  // Fetch task stats for badge (initial load - WebSocket pushes updates)
  const { data: taskStats } = useQuery({
    queryKey: ['taskStats'],
    queryFn: () => api.get<{ pending: number; inProgress: number; completed: number; total: number }>('/tasks/stats'),
    staleTime: Infinity,
    enabled: isAuthenticated,
  });

  // Fetch approval stats for badge (initial load - WebSocket pushes updates)
  const { data: approvalStats } = useQuery({
    queryKey: ['approvalStats'],
    queryFn: () => api.get<{ stats: { pending: number } }>('/approvals/stats'),
    staleTime: Infinity,
    enabled: isAuthenticated,
  });

  // Fetch conversation stats for badge (initial load - WebSocket pushes updates)
  const { data: conversationStats } = useQuery({
    queryKey: ['conversationStats'],
    queryFn: () => api.get<{ escalated: number }>('/conversations/stats'),
    staleTime: Infinity,
    enabled: isAuthenticated,
  });

  const toggleSection = (sectionId: string, firstItemPath?: string) => {
    const isOpening = !expandedSections[sectionId];
    const next = { ...expandedSections, [sectionId]: isOpening };
    localStorage.setItem('sidebar-expanded-sections', JSON.stringify(next));
    setExpandedSections(next);
    // Navigate to first item when opening
    if (isOpening && firstItemPath) {
      navigate(firstItemPath);
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Auto-expand active section and collapse others when navigating
  useEffect(() => {
    const collapsibleSections = [
      { id: 'tools', paths: ['/tools/knowledge-base', '/tools/site-scraper'] },
      { id: 'settings', paths: ['/settings/extensions', '/settings/automations', '/settings/autonomy'] },
    ];

    const newExpandedState: Record<string, boolean> = {};
    let hasChanges = false;

    collapsibleSections.forEach((section) => {
      const hasActiveItem = section.paths.some((path) => location.pathname.startsWith(path));
      newExpandedState[section.id] = hasActiveItem;
      if (expandedSections[section.id] !== hasActiveItem) {
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setExpandedSections(newExpandedState);
      localStorage.setItem('sidebar-expanded-sections', JSON.stringify(newExpandedState));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const { t, i18n } = useTranslation();
  const currentLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pendingTasks = taskStats?.pending || undefined;
  const pendingApprovals = approvalStats?.stats?.pending || undefined;
  const escalatedConversations = conversationStats?.escalated || undefined;

  const navSections: NavSection[] = [
    {
      items: [
        { path: '/', label: t('nav.home'), icon: <Home size={20} /> },
        { path: '/inbox', label: t('nav.inbox'), icon: <MessageSquare size={20} />, badge: escalatedConversations },
        { path: '/tasks', label: t('nav.tasks'), icon: <ClipboardList size={20} />, badge: pendingTasks },
        { path: '/approvals', label: t('nav.approvals'), icon: <Bell size={20} />, badge: pendingApprovals },
      ],
    },
    {
      title: t('nav.operations'),
      items: [
        { path: '/guests', label: t('nav.guests'), icon: <Users size={20} /> },
        { path: '/reservations', label: t('nav.reservations'), icon: <CalendarDays size={20} /> },
      ],
    },
    {
      id: 'tools',
      title: t('nav.tools'),
      icon: <Wrench size={20} />,
      collapsible: true,
      items: [
        { path: '/tools/knowledge-base', label: t('nav.knowledgeBase'), icon: <BookOpen size={20} /> },
        { path: '/tools/site-scraper', label: t('nav.siteScraper'), icon: <Globe size={20} /> },
      ],
    },
    {
      id: 'settings',
      title: t('nav.settings'),
      icon: <Settings size={20} />,
      collapsible: true,
      items: [
        { path: '/settings/extensions', label: t('nav.extensions'), icon: <Puzzle size={20} /> },
        { path: '/settings/automations', label: t('nav.automations'), icon: <Zap size={20} /> },
        { path: '/settings/autonomy', label: t('nav.autonomy'), icon: <SlidersHorizontal size={20} /> },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden relative">
      {/* Sidebar */}
      <aside
        className={`bg-card border-e flex flex-col h-screen flex-shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt={t('layout.butler')} className="w-6 h-6 dark:invert" />
              <span className="font-semibold text-foreground">{t('layout.butler')}</span>
            </div>
          ) : (
            <img src="/logo.svg" alt={t('layout.butler')} className="w-6 h-6 mx-auto dark:invert" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navSections.map((section, sectionIndex) => {
            const isExpanded = section.id ? expandedSections[section.id] : true;
            const hasActiveItem = section.items.some((item) => isActive(item.path));

            return (
              <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-2' : ''}>
                {section.title && section.collapsible ? (
                  // Collapsible section header
                  <>
                    {!collapsed ? (
                      <button
                        onClick={() => section.id && toggleSection(section.id, section.items[0]?.path)}
                        className={`flex items-center gap-3 w-full mx-2 px-3 py-2 rounded-lg transition-colors ${
                          hasActiveItem && !isExpanded
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        style={{ width: 'calc(100% - 16px)' }}
                      >
                        <span className="text-muted-foreground">{section.icon}</span>
                        <span className="text-sm font-medium">{section.title}</span>
                      </button>
                    ) : (
                      <Tooltip content={section.title} side="right">
                        <button
                          onClick={() => section.id && toggleSection(section.id, section.items[0]?.path)}
                          className={`flex items-center justify-center mx-auto p-2 w-fit rounded-lg transition-colors ${
                            hasActiveItem && !isExpanded
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <span className={isExpanded ? 'text-muted-foreground/50' : 'text-muted-foreground'}>{section.icon}</span>
                        </button>
                      </Tooltip>
                    )}
                  </>
                ) : section.title ? (
                  // Non-collapsible section header (just a label)
                  <>
                    {!collapsed && (
                      <div className="px-4 mb-2">
                        <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                          {section.title}
                        </span>
                      </div>
                    )}
                    {collapsed && <div className="mx-3 mb-2 border-t border-border" />}
                  </>
                ) : null}

                {/* Section items - show if expanded or not collapsible */}
                <div
                  className={
                    section.collapsible
                      ? `grid transition-[grid-template-rows] duration-200 ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`
                      : ''
                  }
                >
                  <ul className={`space-y-1 ${section.collapsible ? 'overflow-hidden mt-1' : ''} ${section.collapsible && !collapsed ? 'ml-5' : ''}`}>
                    {(() => {
                      const activeIndex = section.items.findIndex((item) => isActive(item.path));
                      return section.items.map((item, index) => {
                        const active = isActive(item.path);
                        const showLine = section.collapsible && !collapsed && activeIndex >= 0 && index <= activeIndex;
                        return (
                          <li key={item.path} className={section.collapsible && !collapsed ? 'relative' : ''}>
                            {/* Vertical line segment - only show up to active item */}
                            {showLine && (
                              <div
                                className={`absolute left-2.5 w-px bg-foreground ${
                                  index === 0 ? 'top-0' : '-top-1'
                                } ${
                                  index === activeIndex ? 'bottom-1/2' : '-bottom-1'
                                }`}
                              />
                            )}
                            {/* Horizontal connector to active item */}
                            {section.collapsible && !collapsed && active && (
                              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-px bg-foreground" />
                            )}
                            <Tooltip content={collapsed ? item.label : null} side="right">
                              <Link
                                to={item.path}
                                className={`flex items-center gap-3 rounded-lg transition-colors ${
                                  active
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                } ${collapsed ? 'justify-center p-2 w-fit mx-auto' : 'mx-2 px-3 py-2'} ${section.collapsible && !collapsed ? 'ml-5' : ''}`}
                              >
                                {(!section.collapsible || collapsed) && (
                                  <span className={`relative ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                    {item.icon}
                                    {collapsed && item.badge && item.badge > 0 && (
                                      <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-medium rounded-full flex items-center justify-center ${
                                        active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                                      }`}>
                                        {item.badge > 99 ? '99+' : item.badge}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!collapsed && (
                                  <>
                                    <span className="text-sm font-medium">{item.label}</span>
                                    {item.badge && item.badge > 0 && (
                                      <span className={`ml-auto min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full flex items-center justify-center ${
                                        active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                                      }`}>
                                        {item.badge > 99 ? '99+' : item.badge}
                                      </span>
                                    )}
                                  </>
                                )}
                              </Link>
                            </Tooltip>
                          </li>
                        );
                      });
                    })()}
                    {/* Divider after submenu in collapsed mode */}
                    {section.collapsible && collapsed && (
                      <li className="pt-1 mt-1 border-t border-border mx-4" />
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="flex-shrink-0" ref={userMenuRef}>
          <div className={`overflow-hidden transition-all duration-200 space-y-1 py-1 ${userMenuOpen ? 'max-h-64 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]' : 'max-h-0'}`}>
            <DropdownMenu className={collapsed ? 'flex justify-center' : 'block w-full'}>
              <Tooltip content={collapsed ? t('common.language') : undefined} side="right">
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
                  >
                    <Globe size={20} />
                    {!collapsed && <span className="text-sm font-medium">{currentLanguage.label}</span>}
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" side="right" className="min-w-[120px]">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={lang.code === i18n.language ? 'bg-muted' : ''}
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip content={collapsed ? (isDark ? t('common.switchToLight') : t('common.switchToDark')) : undefined} side="right">
              <div
                onClick={toggleTheme}
                className={`flex items-center gap-3 rounded-lg cursor-pointer transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <span ref={themeToggleRef}>
                  <ThemeToggle size="sm" iconOnly />
                </span>
                {!collapsed && <span className="text-sm font-medium">{isDark ? t('common.switchToLight') : t('common.switchToDark')}</span>}
              </div>
            </Tooltip>
            <Tooltip content={collapsed ? t('common.settings') : undefined} side="right">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/settings');
                }}
                className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <Settings size={20} />
                {!collapsed && <span className="text-sm font-medium">{t('common.settings')}</span>}
              </button>
            </Tooltip>
            <Tooltip content={collapsed ? t('common.logout') : undefined} side="right">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  handleLogout();
                }}
                className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <LogOut size={20} />
                {!collapsed && <span className="text-sm font-medium">{t('common.logout')}</span>}
              </button>
            </Tooltip>
          </div>
          <Tooltip content={collapsed ? user?.name : undefined} side="right">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-2 w-full p-3 border-t text-muted-foreground hover:bg-muted transition-colors ${collapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-muted-foreground" />
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm truncate">{user?.name}</span>
                  <ChevronUp size={14} className={`text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* Sidebar toggle button - positioned on border at header level */}
      <button
        onClick={toggleCollapsed}
        className="absolute w-6 h-6 flex items-center justify-center bg-card border rounded-full shadow-sm text-muted-foreground hover:text-foreground z-10 transition-all duration-200"
        style={{ insetInlineStart: collapsed ? 'calc(4rem - 12px)' : 'calc(14rem - 12px)', top: 'calc(1.75rem - 12px)' }}
        title={collapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
      >
        <PanelLeft size={14} className={cn('transition-transform duration-200', collapsed ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180')} />
      </button>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <PageActionsProvider>
          <HeaderBar navSections={navSections} isActive={isActive} t={t} />
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </PageActionsProvider>
      </div>
    </div>
  );
}

function HeaderBar({
  navSections,
  isActive,
  t
}: {
  navSections: NavSection[];
  isActive: (path: string) => boolean;
  t: (key: string) => string;
}) {
  const { actions } = usePageActions();
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isSettingsPage = location.pathname === '/settings';
  const activeItem = navSections
    .flatMap((s) => s.items)
    .find((item) => isActive(item.path));

  // Get page title - prioritize active nav item, then check special routes
  const getPageTitle = () => {
    if (activeItem) return activeItem.label;
    if (isSettingsPage) return t('common.settings');
    return t('layout.dashboard');
  };

  return (
    <header className="bg-card border-b h-14 flex-shrink-0 flex items-center justify-between px-6">
      <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
        {activeItem && (
          <span className="text-muted-foreground">{activeItem.icon}</span>
        )}
        {getPageTitle()}
      </h1>
      <div className="flex items-center gap-2">
        {isHomePage && (
          <>
            <LanguageToggle />
            <ThemeToggle />
          </>
        )}
        {actions}
      </div>
    </header>
  );
}
