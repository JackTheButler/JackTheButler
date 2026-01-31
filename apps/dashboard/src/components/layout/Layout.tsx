import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
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
        { path: '/', label: 'Home', icon: <Home size={20} /> },
        { path: '/inbox', label: 'Inbox', icon: <MessageSquare size={20} />, badge: escalatedConversations },
        { path: '/tasks', label: 'Tasks', icon: <ClipboardList size={20} />, badge: pendingTasks },
        { path: '/approvals', label: 'Approvals', icon: <Bell size={20} />, badge: pendingApprovals },
      ],
    },
    {
      title: 'Operations',
      items: [
        { path: '/guests', label: 'Guests', icon: <Users size={20} /> },
        { path: '/reservations', label: 'Reservations', icon: <CalendarDays size={20} /> },
      ],
    },
    {
      id: 'tools',
      title: 'Tools',
      icon: <Wrench size={20} />,
      collapsible: true,
      items: [
        { path: '/tools/knowledge-base', label: 'Knowledge Base', icon: <BookOpen size={20} /> },
        { path: '/tools/site-scraper', label: 'Site Scraper', icon: <Globe size={20} /> },
      ],
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: <Settings size={20} />,
      collapsible: true,
      items: [
        { path: '/settings/extensions', label: 'Extensions', icon: <Puzzle size={20} /> },
        { path: '/settings/automations', label: 'Automations', icon: <Zap size={20} /> },
        { path: '/settings/autonomy', label: 'Autonomy', icon: <SlidersHorizontal size={20} /> },
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
    <div className="h-screen bg-gray-100 flex overflow-hidden relative">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r flex flex-col h-screen flex-shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="Butler" className="w-6 h-6" />
              <span className="font-semibold text-gray-900">Butler</span>
            </div>
          ) : (
            <img src="/logo.svg" alt="Butler" className="w-6 h-6 mx-auto" />
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
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        style={{ width: 'calc(100% - 16px)' }}
                      >
                        <span className="text-gray-500">{section.icon}</span>
                        <span className="text-sm font-medium">{section.title}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => section.id && toggleSection(section.id, section.items[0]?.path)}
                        className={`flex items-center justify-center mx-2 px-3 py-2 rounded-lg transition-colors w-[calc(100%-16px)] ${
                          hasActiveItem && !isExpanded
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        title={section.title}
                      >
                        <span className="text-gray-500">{section.icon}</span>
                      </button>
                    )}
                  </>
                ) : section.title ? (
                  // Non-collapsible section header (just a label)
                  <>
                    {!collapsed && (
                      <div className="px-4 mb-2">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          {section.title}
                        </span>
                      </div>
                    )}
                    {collapsed && <div className="mx-3 mb-2 border-t border-gray-200" />}
                  </>
                ) : null}

                {/* Section items - show if expanded or not collapsible */}
                {(!section.collapsible || isExpanded) && (
                  <ul className={`space-y-1 ${section.collapsible ? 'mt-1' : ''} ${section.collapsible && !collapsed ? 'ml-5' : ''}`}>
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
                                className={`absolute left-2.5 w-px bg-gray-900 ${
                                  index === 0 ? 'top-0' : '-top-1'
                                } ${
                                  index === activeIndex ? 'bottom-1/2' : '-bottom-1'
                                }`}
                              />
                            )}
                            {/* Horizontal connector to active item */}
                            {section.collapsible && !collapsed && active && (
                              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-px bg-gray-900" />
                            )}
                            <Link
                              to={item.path}
                              className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg transition-colors ${
                                active
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                              } ${collapsed ? 'justify-center' : ''} ${section.collapsible && !collapsed ? 'ml-5' : ''}`}
                              title={collapsed ? item.label : undefined}
                            >
                              {!section.collapsible && (
                                <span className={`relative ${active ? 'text-white' : 'text-gray-500'}`}>
                                  {item.icon}
                                  {collapsed && item.badge && item.badge > 0 && (
                                    <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-medium rounded-full flex items-center justify-center ${
                                      active ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
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
                                      active ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
                                    }`}>
                                      {item.badge > 99 ? '99+' : item.badge}
                                    </span>
                                  )}
                                </>
                              )}
                            </Link>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="flex-shrink-0" ref={userMenuRef}>
          <div className={`overflow-hidden transition-all duration-200 ${userMenuOpen ? 'max-h-40 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]' : 'max-h-0'}`}>
            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/settings');
              }}
              className={`flex items-center gap-2 w-full p-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
            >
              <Settings size={16} className="text-gray-400" />
              {!collapsed && <span>Settings</span>}
            </button>
            <button
              onClick={() => {
                setUserMenuOpen(false);
                handleLogout();
              }}
              className={`flex items-center gap-2 w-full p-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
            >
              <LogOut size={16} className="text-gray-400" />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={`flex items-center gap-2 w-full p-3 border-t text-gray-600 hover:bg-gray-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-gray-500" />
            </div>
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm truncate">{user?.name}</span>
                <ChevronUp size={14} className={`text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Sidebar toggle button - positioned on border at header level */}
      <button
        onClick={toggleCollapsed}
        className="absolute w-6 h-6 flex items-center justify-center bg-white border rounded-full shadow-sm text-gray-400 hover:text-gray-900 z-10 transition-all duration-200"
        style={{ left: collapsed ? 'calc(4rem - 12px)' : 'calc(14rem - 12px)', top: 'calc(1.75rem - 12px)' }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <PanelLeft size={14} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
      </button>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top header - fixed */}
        <header className="bg-white border-b h-14 flex-shrink-0 flex items-center px-6">
          {(() => {
            const activeItem = navSections
              .flatMap((s) => s.items)
              .find((item) => isActive(item.path));
            return (
              <h1 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                {activeItem && (
                  <span className="text-gray-500">{activeItem.icon}</span>
                )}
                {activeItem?.label || 'Dashboard'}
              </h1>
            );
          })()}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
