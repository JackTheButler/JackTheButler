import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Zap,
  Settings2,
} from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppIcon, CategoryIcon } from '@/components';
import { PageContainer, StatsBar, SearchInput, EmptyState } from '@/components';
import { AppCardSkeleton } from '@/components';

type AppStatus = 'not_configured' | 'configured' | 'connected' | 'error' | 'disabled';

interface App {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string | null;
  version: string;
  status: AppStatus;
  enabled: boolean;
  isActive: boolean;
  lastChecked: string | null;
  lastError: string | null;
}

const getStatusConfig = (t: (key: string) => string): Record<
  AppStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: typeof CheckCircle2 }
> => ({
  connected: { label: t('apps.connected'), variant: 'success', icon: CheckCircle2 },
  configured: { label: t('apps.ready'), variant: 'warning', icon: Zap },
  error: { label: t('apps.error'), variant: 'error', icon: AlertCircle },
  disabled: { label: t('apps.disabled'), variant: 'secondary', icon: XCircle },
  not_configured: { label: t('apps.notSetUp'), variant: 'secondary', icon: Settings2 },
});

const getCategoryLabels = (t: (key: string) => string): Record<string, string> => ({
  ai: t('apps.aiProvider'),
  channel: t('apps.communicationChannels'),
  pms: t('apps.hotelSystems'),
});

function StatusIndicator({ status, t }: { status: AppStatus; t: (key: string) => string }) {
  const statusConfig = getStatusConfig(t);
  const config = statusConfig[status] || statusConfig.not_configured;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function AppCard({ app, t }: { app: App; t: (key: string) => string }) {
  return (
    <Link to={`/engine/apps/${app.id}`} className="h-full">
      <Card className="card-hover cursor-pointer group overflow-hidden h-full">
        <div className="flex h-full">
          <CardContent className="p-5 flex-1 w-full">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-foreground/5 group-hover:bg-muted transition-colors">
                <AppIcon id={app.id} size="lg" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{app.name}</h3>
                  {app.status === 'connected' && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{app.description}</p>
                <StatusIndicator status={app.status} t={t} />
              </div>
            </div>

            {app.status === 'error' && app.lastError && (
              <InlineAlert variant="error" className="mt-3 max-h-24 overflow-y-auto break-words scrollbar-hide">
                {app.lastError}
              </InlineAlert>
            )}
          </CardContent>
          <div className="flex items-center px-4 bg-muted/50 group-hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-foreground transition-colors rtl:rotate-180" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function AppsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const categoryLabels = getCategoryLabels(t);

  const { data, isLoading, error } = useQuery({
    queryKey: ['apps'],
    queryFn: () => api.get<{ apps: App[] }>('/apps'),
  });

  const apps = data?.apps || [];

  // Filter apps by search
  const filteredApps = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate stats
  const stats = {
    connected: apps.filter((a) => a.enabled && a.status === 'connected').length,
    configured: apps.filter((a) => a.enabled && a.status === 'configured').length,
    errors: apps.filter((a) => a.enabled && a.status === 'error').length,
    total: apps.filter((a) => a.enabled).length,
  };

  // Group apps by category
  const grouped = filteredApps.reduce(
    (acc, app) => {
      const category = app.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(app);
      return acc;
    },
    {} as Record<string, App[]>
  );

  const categoryOrder = ['ai', 'channel', 'pms'];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <PageContainer>
      {/* Stats */}
      {!isLoading && !error && (
        <StatsBar
          items={[
            { label: t('apps.connected'), value: stats.connected, icon: CheckCircle2, variant: 'success' },
            { label: t('apps.readyToTest'), value: stats.configured, icon: Zap, variant: 'warning' },
            { label: t('apps.errors'), value: stats.errors, icon: AlertCircle, variant: 'error' },
            { label: t('apps.total'), value: stats.total, icon: Settings2, variant: 'default' },
          ]}
        />
      )}

      {/* Search */}
      <div className="max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('apps.searchApps')}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <AppCardSkeleton count={4} />
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title={t('apps.failedToLoad')}
          description={t('approvals.tryAgainLater')}
        />
      ) : filteredApps.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('apps.noApps')}
          description={t('apps.noAppsSearch')}
        />
      ) : (
        <div className="space-y-10">
          {sortedCategories.map((category) => (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-3">
                <CategoryIcon category={category} size="md" className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">{categoryLabels[category] || category}</h2>
                <Badge variant="secondary" className="ms-auto">
                  {grouped[category].length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {grouped[category].map((app) => (
                  <AppCard key={app.id} app={app} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
