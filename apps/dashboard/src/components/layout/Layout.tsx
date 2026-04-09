import { useEffect, useState, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
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
  AlertTriangle,
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
  /** Permission required to see this item (optional) */
  permission?: string;
  /** Whether the item is disabled (computed from permission) */
  disabled?: boolean;
}

interface NavSection {
  id?: string;
  title?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  items: NavItem[];
  /** Permission required to see this section (optional) */
  permission?: string;
  /** Whether the section is disabled (computed from permission) */
  disabled?: boolean;
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, isAuthenticated, logout, checkAuth } = useAuth();
  const { can } = usePermissions();
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
    const spinnerBoxes = [
      // Clockwise from top-left
      "M163.333 30C174.379 30 183.333 38.9543 183.333 50V61.1113C183.333 72.1569 174.379 81.1113 163.333 81.1113H152.223C141.177 81.1113 132.223 72.1569 132.223 61.1113V50C132.223 38.9543 141.177 30 152.223 30H163.333Z",
      "M265.556 30C276.601 30.0001 285.556 38.9543 285.556 50V61.1113C285.556 72.1569 276.601 81.1113 265.556 81.1113H254.444C243.399 81.1113 234.444 72.1569 234.444 61.1113V50C234.444 38.9543 243.399 30.0001 254.444 30H265.556Z",
      "M367.777 30C378.823 30 387.777 38.9543 387.777 50V61.1113C387.777 72.1569 378.823 81.1113 367.777 81.1113H356.667C345.621 81.1113 336.667 72.1569 336.667 61.1113V50C336.667 38.9543 345.621 30 356.667 30H367.777Z",
      "M470 132.223C481.046 132.223 490 141.177 490 152.223V163.333C490 174.379 481.046 183.333 470 183.333H458.889C447.843 183.333 438.889 174.379 438.889 163.333V152.223C438.889 141.177 447.843 132.223 458.889 132.223H470Z",
      "M470 234.444C481.046 234.444 490 243.399 490 254.444V265.556C490 276.601 481.046 285.556 470 285.556H458.889C447.843 285.556 438.889 276.601 438.889 265.556V254.444C438.889 243.399 447.843 234.444 458.889 234.444H470Z",
      "M470 336.667C481.046 336.667 490 345.621 490 356.667V367.777C490 378.823 481.046 387.777 470 387.777H458.889C447.843 387.777 438.889 378.823 438.889 367.777V356.667C438.889 345.621 447.843 336.667 458.889 336.667H470Z",
      "M367.777 438.889C378.823 438.889 387.777 447.843 387.777 458.889V470C387.777 481.046 378.823 490 367.777 490H356.667C345.621 490 336.667 481.046 336.667 470V458.889C336.667 447.843 345.621 438.889 356.667 438.889H367.777Z",
      "M265.556 438.889C276.601 438.889 285.556 447.843 285.556 458.889V470C285.556 481.046 276.601 490 265.556 490H254.444C243.399 490 234.444 481.046 234.444 470V458.889C234.444 447.843 243.399 438.889 254.444 438.889H265.556Z",
      "M163.333 438.889C174.379 438.889 183.333 447.843 183.333 458.889V470C183.333 481.046 174.379 490 163.333 490H152.223C141.177 490 132.223 481.046 132.223 470V458.889C132.223 447.843 141.177 438.889 152.223 438.889H163.333Z",
      "M61.1113 336.667C72.1569 336.667 81.1113 345.621 81.1113 356.667V367.777C81.1113 378.823 72.1569 387.777 61.1113 387.777H50C38.9543 387.777 30 378.823 30 367.777V356.667C30 345.621 38.9543 336.667 50 336.667H61.1113Z",
      "M61.1113 234.444C72.1569 234.444 81.1113 243.399 81.1113 254.444V265.556C81.1113 276.601 72.1569 285.556 61.1113 285.556H50C38.9544 285.556 30.0001 276.601 30 265.556V254.444C30.0001 243.399 38.9543 234.444 50 234.444H61.1113Z",
      "M61.1113 132.223C72.1569 132.223 81.1113 141.177 81.1113 152.223V163.333C81.1113 174.379 72.1569 183.333 61.1113 183.333H50C38.9543 183.333 30 174.379 30 163.333V152.223C30 141.177 38.9543 132.223 50 132.223H61.1113Z",
    ];
    return (
      <div className="min-h-screen bg-muted aurora-layout flex flex-col items-center justify-center gap-4">
        <svg width="80" height="80" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="aurora-logo" x1="0" y1="0" x2="520" y2="520" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="hsl(210, 100%, 45%)" />
              <stop offset="35%"  stopColor="hsl(185, 100%, 37%)" />
              <stop offset="65%"  stopColor="hsl(160, 92%,  36%)" />
              <stop offset="100%" stopColor="hsl(140, 88%,  33%)" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes butler-dot {
              0%      { opacity: 1;    }
              8.33%   { opacity: 0.65; }
              16.66%  { opacity: 0.3;  }
              25%     { opacity: 0.05; }
              66.66%  { opacity: 0.05; }
              75%     { opacity: 0.25; }
              83.33%  { opacity: 0.55; }
              91.67%  { opacity: 0.82; }
              100%    { opacity: 1;    }
            }
            @keyframes butler-beam {
              0%, 100% { opacity: 0.5;  }
              50%      { opacity: 1;    }
            }
            @keyframes aurora-hue {
              0%   { filter: hue-rotate(0deg);   }
              100% { filter: hue-rotate(360deg); }
            }
          `}</style>
          {/* Main body: rounded card + JB letters — aurora fill + beam pulse */}
          <path fill="url(#aurora-logo)" style={{ animation: 'butler-beam 2s ease-in-out infinite' }} d="M343.333 106.667C381.993 106.667 413.333 138.007 413.333 176.667V343.333C413.333 381.993 381.993 413.333 343.333 413.333H176.667C138.007 413.333 106.667 381.993 106.667 343.333V176.667C106.667 138.007 138.007 106.667 176.667 106.667H343.333ZM213.657 183.728V284.466C213.611 289.503 212.817 293.747 211.278 297.198C209.786 300.649 207.594 303.261 204.702 305.033C201.811 306.759 198.289 307.622 194.139 307.622C190.314 307.622 186.933 306.875 183.995 305.383C181.057 303.89 178.748 301.745 177.069 298.947C175.437 296.149 174.597 292.814 174.551 288.943H148.736C148.736 297.758 150.695 305.127 154.612 311.05C158.53 316.973 163.824 321.45 170.493 324.481C177.209 327.466 184.764 328.959 193.159 328.959C202.347 328.959 210.392 327.186 217.295 323.642C224.244 320.051 229.654 314.944 233.524 308.321C237.395 301.652 239.355 293.7 239.401 284.466V183.728H213.657ZM261.649 183.728V327H319.644C330.604 327 339.698 325.297 346.927 321.893C354.156 318.488 359.566 313.848 363.157 307.972C366.748 302.049 368.544 295.379 368.544 287.964C368.544 280.688 367.051 274.485 364.066 269.354C361.082 264.224 357.234 260.26 352.523 257.462C347.86 254.617 342.986 253.055 337.902 252.775V251.376C342.566 250.257 346.787 248.415 350.564 245.85C354.342 243.285 357.35 239.95 359.589 235.846C361.828 231.695 362.947 226.704 362.947 220.874C362.947 213.785 361.222 207.442 357.771 201.846C354.366 196.249 349.212 191.842 342.31 188.624C335.454 185.359 326.849 183.728 316.495 183.728H261.649ZM316.216 263.339C321.579 263.339 326.196 264.341 330.067 266.347C333.938 268.305 336.923 271.011 339.021 274.462C341.12 277.866 342.17 281.691 342.17 285.935C342.17 291.624 340.071 296.289 335.874 299.927C331.723 303.518 324.937 305.313 315.517 305.313H287.604V263.339H316.216ZM313.837 205.134C321.485 205.134 327.245 206.93 331.116 210.521C335.034 214.112 336.993 218.682 336.993 224.232C336.993 228.43 335.943 232.067 333.845 235.146C331.793 238.177 328.971 240.533 325.38 242.212C321.789 243.844 317.754 244.66 313.277 244.66H287.604V205.134H313.837Z" />
          {/* Animated spinner boxes — aurora fill + hue-cycling */}
          {spinnerBoxes.map((d, i) => (
            <path
              key={i}
              fill="url(#aurora-logo)"
              d={d}
              style={{
                animation: 'butler-dot 1.2s linear infinite',
                animationDelay: `${i * 0.1 - 1.2}s`,
              }}
            />
          ))}
        </svg>
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
        { path: '/inbox', label: t('nav.inbox'), icon: <MessageSquare size={20} />, badge: escalatedConversations, permission: PERMISSIONS.CONVERSATIONS_VIEW },
        { path: '/tasks', label: t('nav.tasks'), icon: <ClipboardList size={20} />, badge: pendingTasks, permission: PERMISSIONS.TASKS_VIEW },
        { path: '/review-center', label: t('nav.approvals'), icon: <ListTodo size={20} />, badge: pendingApprovals, permission: PERMISSIONS.APPROVALS_VIEW },
      ],
    },
    {
      title: t('nav.operations'),
      items: [
        { path: '/guests', label: t('nav.guests'), icon: <Users size={20} />, permission: PERMISSIONS.GUESTS_VIEW },
        { path: '/reservations', label: t('nav.reservations'), icon: <CalendarDays size={20} />, permission: PERMISSIONS.RESERVATIONS_VIEW },
      ],
    },
    {
      id: 'content',
      title: t('nav.content'),
      icon: <FileText size={20} />,
      collapsible: true,
      permission: PERMISSIONS.KNOWLEDGE_VIEW,
      items: [
        { path: '/tools/knowledge-base', label: t('nav.knowledgeBase'), icon: <BookOpen size={20} />, permission: PERMISSIONS.KNOWLEDGE_VIEW },
        { path: '/tools/site-scraper', label: t('nav.siteScraper'), icon: <Globe size={20} />, permission: PERMISSIONS.KNOWLEDGE_MANAGE },
      ],
    },
    {
      id: 'engine',
      title: t('nav.engine'),
      icon: <Network size={20} />,
      collapsible: true,
      permission: PERMISSIONS.SETTINGS_VIEW,
      items: [
        { path: '/engine/apps', label: t('nav.apps'), icon: <Puzzle size={20} />, permission: PERMISSIONS.SETTINGS_VIEW },
        { path: '/engine/automations', label: t('nav.automations'), icon: <Zap size={20} />, permission: PERMISSIONS.AUTOMATIONS_VIEW },
        { path: '/engine/autonomy', label: t('nav.autonomy'), icon: <SlidersHorizontal size={20} />, permission: PERMISSIONS.SETTINGS_VIEW },
      ],
    },
  ];

  // Mark sections and items as disabled based on permissions (but keep them visible)
  const filteredNavSections = navSections.map((section) => ({
    ...section,
    disabled: section.permission ? !can(section.permission) : false,
    items: section.items.map((item) => ({
      ...item,
      disabled: item.permission ? !can(item.permission) : false,
    })),
  }));

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="h-screen bg-background aurora-layout flex overflow-hidden relative">
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
          'glass-noise relative overflow-hidden border-e border-gray-400/20 bg-white/60 backdrop-blur-lg dark:bg-black/30 flex flex-col h-screen flex-shrink-0 transition-all duration-200',
          // Mobile: fixed overlay
          'fixed sm:relative z-50 sm:z-auto',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
          // Width based on collapsed state
          effectiveCollapsed ? 'w-56 sm:w-16' : 'w-56'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-400/20">
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
              'absolute bg-primary rounded-md pointer-events-none',
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
          {filteredNavSections.map((section, sectionIndex) => {
            const isExpanded = section.id ? expandedSections[section.id] : true;
            const hasActiveItem = section.items.some((item) => isActive(item.path));

            return (
              <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-2' : ''}>
                {section.title && section.collapsible ? (
                  // Collapsible section header
                  <>
                    {!effectiveCollapsed ? (
                      section.disabled ? (
                        <span
                          className="flex items-center gap-3 w-full mx-2 px-3 py-2 rounded-md cursor-not-allowed opacity-50"
                          style={{ width: 'calc(100% - 16px)' }}
                        >
                          <span className="text-muted-foreground">{section.icon}</span>
                          <span className="text-sm font-medium text-muted-foreground">{section.title}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => section.id && toggleSection(section.id, section.items[0]?.path)}
                          className={`flex items-center gap-3 w-full mx-2 px-3 py-2 rounded-md transition-colors ${
                            hasActiveItem && !isExpanded
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                          style={{ width: 'calc(100% - 16px)' }}
                        >
                          <span className="text-muted-foreground">{section.icon}</span>
                          <span className="text-sm font-medium">{section.title}</span>
                        </button>
                      )
                    ) : (
                      <Tooltip content={section.title} side="right">
                        {section.disabled ? (
                          <span
                            className="flex items-center justify-center mx-auto p-2 w-fit rounded-md cursor-not-allowed opacity-50"
                          >
                            <span className="text-muted-foreground">{section.icon}</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => section.id && toggleSection(section.id, section.items[0]?.path)}
                            className={`flex items-center justify-center mx-auto p-2 w-fit rounded-md transition-colors ${
                              hasActiveItem && !isExpanded
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                          >
                            <span className={isExpanded ? 'text-muted-foreground/50' : 'text-muted-foreground'}>{section.icon}</span>
                          </button>
                        )}
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
                    {effectiveCollapsed && <div className="mx-3 mb-2 border-t border-gray-400/20" />}
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
                              {item.disabled ? (
                                <span
                                  className={`flex items-center gap-3 rounded-md relative z-10 cursor-not-allowed opacity-50 ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'mx-2 px-3 py-2'} ${section.collapsible && !effectiveCollapsed ? 'ms-5' : ''}`}
                                >
                                  {(!section.collapsible || effectiveCollapsed) && (
                                    <span className="text-muted-foreground">
                                      {item.icon}
                                    </span>
                                  )}
                                  {!effectiveCollapsed && (
                                    <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                                  )}
                                </span>
                              ) : (
                                <Link
                                  to={item.path}
                                  data-nav-active={active || undefined}
                                  className={`flex items-center gap-3 rounded-md transition-colors relative z-10 ${
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
                              )}
                            </Tooltip>
                          </li>
                        );
                      });
                    })()}
                    {/* Divider after submenu in collapsed mode */}
                    {section.collapsible && effectiveCollapsed && (
                      <li className="pt-1 mt-1 border-t border-gray-400/20 mx-4" />
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="flex-shrink-0" ref={userMenuRef}>
          <div className={`overflow-hidden transition-all duration-200 space-y-1 py-1 ${userMenuOpen ? 'max-h-64 border-t border-gray-400/20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]' : 'max-h-0'}`}>
            <DropdownMenu className={effectiveCollapsed ? 'flex justify-center' : 'block w-full'}>
              <Tooltip content={effectiveCollapsed ? t('common.language') : undefined} side="right">
                <span className={effectiveCollapsed ? 'flex justify-center' : 'block'}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`flex items-center gap-3 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
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
                className={`flex items-center gap-3 rounded-md cursor-pointer transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
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
                  navigate('/settings');
                }}
                className={`flex items-center gap-3 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
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
                className={`flex items-center gap-3 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${effectiveCollapsed ? 'justify-center p-2 w-fit mx-auto' : 'w-[calc(100%-1rem)] mx-2 px-3 py-2'}`}
              >
                <Power size={20} />
                {!effectiveCollapsed && <span className="text-sm font-medium">{t('common.logout')}</span>}
              </button>
            </Tooltip>
          </div>
          <Tooltip content={effectiveCollapsed ? user?.name : undefined} side="right">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-2 w-full p-3 border-t border-gray-400/20 text-muted-foreground hover:bg-muted transition-colors ${effectiveCollapsed ? 'justify-center' : ''}`}
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
            navSections={filteredNavSections}
            isActive={isActive}
            t={t}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
          <EmailVerificationBanner />
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
  const isSettingsPage = location.pathname.startsWith('/settings');
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
    <header className="glass-noise relative border-b border-gray-400/20 bg-white/60 backdrop-blur-lg dark:bg-black/30 h-14 flex-shrink-0 flex items-center justify-between px-2 sm:px-6 overflow-hidden">
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

function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const daysLeft = useMemo(() => {
    if (!user?.emailVerificationDeadline) return null;
    const deadline = new Date(user.emailVerificationDeadline).getTime();
    const now = Date.now();
    const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }, [user?.emailVerificationDeadline]);

  // Don't show if verified, dismissed, or no deadline (instant mode users can't log in anyway)
  if (!user || user.emailVerified || dismissed || daysLeft === null) {
    return null;
  }

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post('/auth/resend-verification', {});
      setResent(true);
    } catch {
      // Silently fail - user can try again
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="bg-warning border-b border-warning-border px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-warning-foreground min-w-0">
        <AlertTriangle size={16} className="flex-shrink-0" />
        <span className="truncate">
          {t('auth.verifyEmailBanner', { count: daysLeft })}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {resent ? (
          <span className="text-xs text-muted-foreground">{t('auth.verificationResent')}</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {t('auth.resendVerification')}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground p-0.5"
          aria-label={t('common.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
