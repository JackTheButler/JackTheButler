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
import { Input } from '@/components/ui/input';
import { IntegrationIcon, CategoryIcon } from '@/components/IntegrationIcon';

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

function IntegrationCard({ integration }: { integration: Integration }) {
  const activeProvider = integration.providers.find(
    (p) => p.id === integration.activeProvider || p.enabled
  );

  return (
    <Link to={`/settings/integrations/${integration.id}`}>
      <Card className="card-hover cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-muted/50 group-hover:bg-muted transition-colors">
                <IntegrationIcon id={integration.id} size="lg" />
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
                    <IntegrationIcon id={activeProvider.id} size="sm" />
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

function StatsCard({
  label,
  value,
  icon: Icon,
  variant,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  variant: 'success' | 'warning' | 'error' | 'default';
}) {
  const colors = {
    success: 'text-green-600 bg-green-50',
    warning: 'text-yellow-600 bg-yellow-50',
    error: 'text-red-600 bg-red-50',
    default: 'text-muted-foreground bg-muted',
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
      <div className={cn('p-2 rounded-lg', colors[variant])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function IntegrationsPage() {
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
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Connect and manage external services for your hotel
        </p>
      </div>

      {/* Stats */}
      {!isLoading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard label="Connected" value={stats.connected} icon={CheckCircle2} variant="success" />
          <StatsCard label="Ready to Test" value={stats.configured} icon={Zap} variant="warning" />
          <StatsCard label="Errors" value={stats.errors} icon={AlertCircle} variant="error" />
          <StatsCard label="Total" value={stats.total} icon={Settings2} variant="default" />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-medium">Failed to load integrations</p>
          <p className="text-muted-foreground">Please try again later</p>
        </Card>
      ) : filteredIntegrations.length === 0 ? (
        <Card className="p-8 text-center">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">No integrations found</p>
          <p className="text-muted-foreground">Try a different search term</p>
        </Card>
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
                  <IntegrationCard key={integration.id} integration={integration} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
