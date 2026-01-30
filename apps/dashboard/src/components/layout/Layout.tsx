import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Home,
  MessageSquare,
  ClipboardList,
  Bell,
  Puzzle,
  Zap,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Globe,
  Wrench,
  BookOpen,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
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

  const navSections: NavSection[] = [
    {
      items: [
        { path: '/', label: 'Home', icon: <Home size={20} /> },
        { path: '/inbox', label: 'Inbox', icon: <MessageSquare size={20} /> },
        { path: '/tasks', label: 'Tasks', icon: <ClipboardList size={20} /> },
        { path: '/approvals', label: 'Approvals', icon: <Bell size={20} /> },
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
    <div className="h-screen bg-gray-100 flex overflow-hidden">
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
                        className={`flex items-center justify-between w-full mx-2 px-3 py-2 rounded-lg transition-colors ${
                          hasActiveItem && !isExpanded
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        style={{ width: 'calc(100% - 16px)' }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">{section.icon}</span>
                          <span className="text-sm font-medium">{section.title}</span>
                        </div>
                        <ChevronDown
                          size={16}
                          className={`text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                        />
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
                                <span className={active ? 'text-white' : 'text-gray-500'}>
                                  {item.icon}
                                </span>
                              )}
                              {!collapsed && (
                                <span className="text-sm font-medium">{item.label}</span>
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

        {/* Collapse toggle */}
        <div className="border-t p-2 flex-shrink-0">
          <button
            onClick={toggleCollapsed}
            className="flex items-center justify-center w-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top header - fixed */}
        <header className="bg-white border-b h-14 flex-shrink-0 flex items-center justify-between px-6">
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

          {/* User menu dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                <User size={12} className="text-gray-500" />
              </div>
              <span>{user?.name}</span>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded shadow-lg py-1 z-50">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    // TODO: Navigate to settings
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <Settings size={14} className="text-gray-400" />
                  <span>Settings</span>
                </button>
                <div className="border-t border-gray-100 my-0.5" />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <LogOut size={14} className="text-gray-400" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
