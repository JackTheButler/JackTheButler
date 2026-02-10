import { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PageActionsProvider, usePageActions, PageAction } from '@/contexts/PageActionsContext';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Home,
  MessageSquare,
  ClipboardList,
  ListTodo,
  Puzzle,
  Zap,
  SlidersHorizontal,
  ChevronUp,
  Power,
  User,
  Users,
  CalendarDays,
  Settings,
  Globe,
  FileText,
  BookOpen,
  PanelLeft,
  Network,
  Menu,
  X,
  MoreVertical,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // Track mobile breakpoint
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effective collapsed state - always expanded on mobile
  const effectiveCollapsed = !isMobile && collapsed;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-expanded-sections');
    return saved ? JSON.parse(saved) : { content: false, engine: false };
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ top: number; left: number; width: number; height: number; opacity: number }>({ top: 0, left: 0, width: 0, height: 0, opacity: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [sectionAnimating, setSectionAnimating] = useState(false);
  const [collapseAnimating, setCollapseAnimating] = useState(false);
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
    // Once expanded, clicking the header does nothing
    if (expandedSections[sectionId]) return;
    const next = { ...expandedSections, [sectionId]: true };
    localStorage.setItem('sidebar-expanded-sections', JSON.stringify(next));
    setSectionAnimating(true);
    setExpandedSections(next);
    if (firstItemPath) {
      navigate(firstItemPath);
    }
  };

  const toggleCollapsed = () => {
    setCollapseAnimating(true);
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

  // Update indicator position when active item changes
  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeLink = navRef.current.querySelector('[data-nav-active="true"]') as HTMLElement;
    if (activeLink && activeLink.offsetHeight > 0) {
      const navRect = navRef.current.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      setIndicatorStyle({
        top: linkRect.top - navRect.top + navRef.current.scrollTop,
        left: linkRect.left - navRect.left,
        width: linkRect.width,
        height: linkRect.height,
        opacity: 1,
      });
    } else {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, []);

  useLayoutEffect(() => {
    if (sectionAnimating || collapseAnimating) {
      // Hide indicator during animation, then show after animation completes
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
      setTransitionsEnabled(false);
      const timer = setTimeout(() => {
        setSectionAnimating(false);
        setCollapseAnimating(false);
        updateIndicator();
        // Re-enable transitions after paint
        setTimeout(() => setTransitionsEnabled(true), 50);
      }, 210);
      return () => clearTimeout(timer);
    } else if (!indicatorReady) {
      // Wait for layout to settle on initial page load (including section expansion)
      const timer = setTimeout(() => {
        setIndicatorReady(true);
        updateIndicator();
        // Enable transitions after paint so initial position has no animation
        setTimeout(() => setTransitionsEnabled(true), 50);
      }, 250);
      return () => clearTimeout(timer);
    } else {
      updateIndicator();
    }
  }, [location.pathname, collapsed, expandedSections, updateIndicator, indicatorReady, sectionAnimating, collapseAnimating]);

  // Also update on scroll and resize
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    nav.addEventListener('scroll', updateIndicator);
    window.addEventListener('resize', updateIndicator);
    return () => {
      nav.removeEventListener('scroll', updateIndicator);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [updateIndicator]);

  // Close mobile menu when navigating
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Auto-expand active section and collapse others when navigating
  useEffect(() => {
    const collapsibleSections = [
      { id: 'content', paths: ['/tools/knowledge-base', '/tools/site-scraper'] },
      { id: 'engine', paths: ['/engine/apps', '/engine/automations', '/engine/autonomy'] },
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
        { path: '/review-center', label: t('nav.approvals'), icon: <ListTodo size={20} />, badge: pendingApprovals },
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
      id: 'content',
      title: t('nav.content'),
      icon: <FileText size={20} />,
      collapsible: true,
      items: [
        { path: '/tools/knowledge-base', label: t('nav.knowledgeBase'), icon: <BookOpen size={20} /> },
        { path: '/tools/site-scraper', label: t('nav.siteScraper'), icon: <Globe size={20} /> },
      ],
    },
    {
      id: 'engine',
      title: t('nav.engine'),
      icon: <Network size={20} />,
      collapsible: true,
      items: [
        { path: '/engine/apps', label: t('nav.apps'), icon: <Puzzle size={20} /> },
        { path: '/engine/automations', label: t('nav.automations'), icon: <Zap size={20} /> },
        { path: '/engine/autonomy', label: t('nav.autonomy'), icon: <SlidersHorizontal size={20} /> },
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
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-card border-e flex flex-col h-screen flex-shrink-0 transition-all duration-200',
          // Mobile: fixed overlay
          'fixed sm:relative z-50 sm:z-auto',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
          // Width based on collapsed state
          effectiveCollapsed ? 'w-56 sm:w-16' : 'w-56'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b">
          {!effectiveCollapsed ? (
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt={t('layout.butler')} className="w-6 h-6 dark:invert" />
              <span className="font-semibold text-foreground">{t('layout.butler')}</span>
            </div>
          ) : (
            <img src="/logo.svg" alt={t('layout.butler')} className="w-6 h-6 mx-auto dark:invert" />
          )}
        </div>

        {/* Navigation */}
        <nav ref={navRef} className="flex-1 py-4 overflow-y-auto relative">
          {/* Sliding indicator */}
          <div
            className={cn(
              'absolute bg-primary rounded-lg pointer-events-none',
              transitionsEnabled && 'transition-all duration-200'
            )}
            style={{
              top: indicatorStyle.top,
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              height: indicatorStyle.height,
              opacity: indicatorStyle.opacity,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          {navSections.map((section, sectionIndex) => {
            const isExpanded = section.id ? expandedSections[section.id] : true;
            const hasActiveItem = section.items.some((item) => isActive(item.path));

            return (
              <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-2' : ''}>
                {section.title && section.collapsible ? (
                  // Collapsible section header
                  <>
                    {!effectiveCollapsed ? (
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
                    {!effectiveCollapsed && (
                      <div className="px-4 mb-2">
                        <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                          {section.title}
                        </span>
                      </div>
                    )}
                    {effectiveCollapsed && <div className="mx-3 mb-2 border-t border-border" />}
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
                  <ul className={`space-y-1 ${section.collapsible ? 'overflow-hidden mt-1' : ''} ${section.collapsible && !effectiveCollapsed ? 'ms-5' : ''}`}>
                    {(() => {
                      const activeIndex = section.items.findIndex((item) => isActive(item.path));
                      return section.items.map((item, index) => {
                        const active = isActive(item.path);
                        const showLine = section.collapsible && !effectiveCollapsed && activeIndex >= 0 && index <= activeIndex;
                        return (
                          <li key={item.path} className={section.collapsible && !effectiveCollapsed ? 'relative' : ''}>
                            {/* Vertical line segment - only show up to active item */}
                            {showLine && (
                              <div
                                className={`absolute start-2.5 w-px bg-foreground ${
                                  index === 0 ? 'top-0' : '-top-1'
                                } ${
                                  index === activeIndex ? 'bottom-1/2' : '-bottom-1'
                                }`}
                              />
                            )}
                            {/* Horizontal connector to active item */}
                            {section.collapsible && !effectiveCollapsed && active && (
                              <div className="absolute start-2.5 top-1/2 -translate-y-1/2 w-5 h-px bg-foreground" />
                            )}
                            <Tooltip content={effectiveCollapsed ? item.label : null} side="right">
                              <Link
                                to={item.path}
                                data-nav-active={active || undefined}
                                className={`flex items-center gap-3 rounded-lg transition-colors relative z-10 ${
                                  active
                                    ? 'text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                } ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'mx-2 px-3 py-2'} ${section.collapsible && !effectiveCollapsed ? 'ms-5' : ''}`}
                              >
                                {(!section.collapsible || effectiveCollapsed) && (
                                  <span className={`relative ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                    {item.icon}
                                    {effectiveCollapsed && item.badge && item.badge > 0 && (
                                      <span className={`absolute -top-1 -end-1 min-w-[16px] h-4 px-1 text-[10px] font-medium rounded-full flex items-center justify-center ${
                                        active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                                      }`}>
                                        {item.badge > 99 ? '99+' : item.badge}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!effectiveCollapsed && (
                                  <>
                                    <span className="text-sm font-medium">{item.label}</span>
                                    {item.badge && item.badge > 0 && (
                                      <span className={`ms-auto min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full flex items-center justify-center ${
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
                    {section.collapsible && effectiveCollapsed && (
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
            <DropdownMenu className={effectiveCollapsed ? 'flex justify-center' : 'block w-full'}>
              <Tooltip content={effectiveCollapsed ? t('common.language') : undefined} side="right">
                <span className={effectiveCollapsed ? 'flex justify-center' : 'block'}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
                    >
                      <Globe size={20} />
                      {!effectiveCollapsed && <span className="text-sm font-medium">{currentLanguage.label}</span>}
                    </button>
                  </DropdownMenuTrigger>
                </span>
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
            <Tooltip content={effectiveCollapsed ? (isDark ? t('common.switchToLight') : t('common.switchToDark')) : undefined} side="right">
              <div
                onClick={toggleTheme}
                className={`flex items-center gap-3 rounded-lg cursor-pointer transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <span ref={themeToggleRef}>
                  <ThemeToggle size="sm" iconOnly />
                </span>
                {!effectiveCollapsed && <span className="text-sm font-medium">{isDark ? t('common.switchToLight') : t('common.switchToDark')}</span>}
              </div>
            </Tooltip>
            <Tooltip content={effectiveCollapsed ? t('common.settings') : undefined} side="right">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/engine');
                }}
                className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <Settings size={20} />
                {!effectiveCollapsed && <span className="text-sm font-medium">{t('common.settings')}</span>}
              </button>
            </Tooltip>
            <Tooltip content={effectiveCollapsed ? t('common.logout') : undefined} side="right">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  handleLogout();
                }}
                className={`flex items-center gap-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <Power size={20} />
                {!effectiveCollapsed && <span className="text-sm font-medium">{t('common.logout')}</span>}
              </button>
            </Tooltip>
          </div>
          <Tooltip content={effectiveCollapsed ? user?.name : undefined} side="right">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-2 w-full p-3 border-t text-muted-foreground hover:bg-muted transition-colors ${effectiveCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-muted-foreground" />
              </div>
              {!effectiveCollapsed && (
                <>
                  <span className="flex-1 text-start text-sm truncate">{user?.name}</span>
                  <ChevronUp size={14} className={`text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* Sidebar toggle button - positioned on border at header level (desktop only) */}
      <button
        onClick={toggleCollapsed}
        className="hidden sm:flex absolute w-6 h-6 items-center justify-center bg-card border rounded-full shadow-sm text-muted-foreground hover:text-foreground z-10 transition-all duration-200"
        style={{ insetInlineStart: effectiveCollapsed ? 'calc(4rem - 12px)' : 'calc(14rem - 12px)', top: 'calc(1.75rem - 12px)' }}
        title={effectiveCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
      >
        <PanelLeft size={14} className={cn('transition-transform duration-200', effectiveCollapsed ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180')} />
      </button>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <PageActionsProvider>
          <HeaderBar
            navSections={navSections}
            isActive={isActive}
            t={t}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
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
  t,
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  navSections: NavSection[];
  isActive: (path: string) => boolean;
  t: (key: string) => string;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}) {
  const { actions } = usePageActions() as { actions: PageAction[] };
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isSettingsPage = location.pathname === '/engine';
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
    <header className="bg-card border-b h-14 flex-shrink-0 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1 className="text-lg font-medium text-foreground items-center gap-2 hidden sm:flex">
          {activeItem && (
            <span className="text-muted-foreground">{activeItem.icon}</span>
          )}
          {getPageTitle()}
        </h1>
      </div>
      {/* Home page: show theme/language toggles on all screen sizes */}
      {isHomePage && (
        <div className="flex sm:hidden items-center gap-2">
          <LanguageToggle iconOnly />
          <ThemeToggle />
        </div>
      )}

      {/* Desktop: show actions inline */}
      <div className="hidden sm:flex items-center gap-2">
        {isHomePage && (
          <>
            <LanguageToggle />
            <ThemeToggle />
          </>
        )}
        {actions.map((action) => {
          const ActionIcon = action.icon;
          const button = (
            <Button
              key={action.id}
              size="sm"
              variant={action.variant || 'default'}
              onClick={action.href ? undefined : action.onClick}
              disabled={action.disabled}
              loading={action.loading}
            >
              {ActionIcon && <ActionIcon className="w-4 h-4 me-1.5" />}
              {action.label}
            </Button>
          );
          return action.href ? (
            <Link key={action.id} to={action.href}>{button}</Link>
          ) : (
            button
          );
        })}
      </div>

      {/* Mobile: show actions in dropdown */}
      {actions.length > 0 && (
        <DropdownMenu className="sm:hidden">
          <DropdownMenuTrigger asChild>
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {[...actions].reverse().map((action) => {
              const ActionIcon = action.icon;
              if (action.href) {
                return (
                  <Link key={action.id} to={action.href}>
                    <DropdownMenuItem disabled={action.disabled}>
                      {ActionIcon && <ActionIcon className="w-4 h-4 me-2" />}
                      {action.label}
                    </DropdownMenuItem>
                  </Link>
                );
              }
              return (
                <DropdownMenuItem
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {ActionIcon && <ActionIcon className="w-4 h-4 me-2" />}
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
