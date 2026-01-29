import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Zap,
  Settings2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExtensionIcon, CategoryIcon } from '@/components';
import { PageContainer, StatsBar, SearchInput, EmptyState } from '@/components';

type IntegrationStatus = 'not_configured' | 'configured' | 'connected' | 'error' | 'disabled';

interface Provider {
  id: string;
  name: string;
  status: IntegrationStatus;
  enabled: boolean;
  lastChecked: string | null;
  lastError: string | null;
}

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  required: boolean;
  multiProvider: boolean;
  providers: Provider[];
  activeProvider: string | null;
  status: IntegrationStatus;
}

const statusConfig: Record<
  IntegrationStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: typeof CheckCircle2 }
> = {
  connected: { label: 'Connected', variant: 'success', icon: CheckCircle2 },
  configured: { label: 'Ready', variant: 'warning', icon: Zap },
  error: { label: 'Error', variant: 'error', icon: AlertCircle },
  disabled: { label: 'Disabled', variant: 'secondary', icon: XCircle },
  not_configured: { label: 'Not Set Up', variant: 'secondary', icon: Settings2 },
};

const categoryLabels: Record<string, string> = {
  ai: 'AI Provider',
  channels: 'Communication Channels',
  pms: 'Hotel Systems',
  operations: 'Operations',
};

function StatusIndicator({ status }: { status: IntegrationStatus }) {
  const config = statusConfig[status] || statusConfig.not_configured;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      {status === 'connected' && (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
      )}
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    </div>
  );
}

function ExtensionCard({ integration }: { integration: Integration }) {
  const activeProvider = integration.providers.find(
    (p) => p.id === integration.activeProvider || p.enabled
  );

  return (
    <Link to={`/settings/extensions/${integration.id}`}>
      <Card className="card-hover cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-muted/50 group-hover:bg-muted transition-colors">
                <ExtensionIcon id={integration.id} size="lg" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{integration.name}</h3>
                  {integration.required && (
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  )}
                </div>
                {activeProvider ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <ExtensionIcon id={activeProvider.id} size="sm" />
                    {activeProvider.name}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No provider configured</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusIndicator status={integration.status} />
              <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </div>
          </div>

          {integration.status === 'error' && activeProvider?.lastError && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {activeProvider.lastError}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function ExtensionsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<{ integrations: Integration[] }>('/integrations'),
  });

  const integrations = data?.integrations || [];

  // Filter integrations by search
  const filteredIntegrations = integrations.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.providers.some((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Calculate stats
  const stats = {
    connected: integrations.filter((i) => i.status === 'connected').length,
    configured: integrations.filter((i) => i.status === 'configured').length,
    errors: integrations.filter((i) => i.status === 'error').length,
    total: integrations.length,
  };

  // Group integrations by category
  const grouped = filteredIntegrations.reduce(
    (acc, integration) => {
      const category = integration.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(integration);
      return acc;
    },
    {} as Record<string, Integration[]>
  );

  const categoryOrder = ['ai', 'channels', 'pms', 'operations'];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <PageContainer>
      {/* Stats */}
      {!isLoading && !error && (
        <StatsBar
          items={[
            { label: 'Connected', value: stats.connected, icon: CheckCircle2, variant: 'success' },
            { label: 'Ready to Test', value: stats.configured, icon: Zap, variant: 'warning' },
            { label: 'Errors', value: stats.errors, icon: AlertCircle, variant: 'error' },
            { label: 'Total', value: stats.total, icon: Settings2, variant: 'default' },
          ]}
        />
      )}

      {/* Search */}
      <div className="max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search extensions..."
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Failed to load extensions"
          description="Please try again later"
        />
      ) : filteredIntegrations.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No extensions found"
          description="Try a different search term"
        />
      ) : (
        <div className="space-y-10">
          {sortedCategories.map((category) => (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-3">
                <CategoryIcon category={category} size="md" className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">{categoryLabels[category] || category}</h2>
                <Badge variant="secondary" className="ml-auto">
                  {grouped[category].length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {grouped[category].map((integration) => (
                  <ExtensionCard key={integration.id} integration={integration} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
