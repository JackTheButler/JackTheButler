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
import { ExtensionIcon, CategoryIcon } from '@/components';
import { PageContainer, StatsBar, SearchInput, EmptyState } from '@/components';
import { ExtensionCardSkeleton } from '@/components';

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

const getStatusConfig = (t: (key: string) => string): Record<
  IntegrationStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: typeof CheckCircle2 }
> => ({
  connected: { label: t('extensions.connected'), variant: 'success', icon: CheckCircle2 },
  configured: { label: t('extensions.ready'), variant: 'warning', icon: Zap },
  error: { label: t('extensions.error'), variant: 'error', icon: AlertCircle },
  disabled: { label: t('extensions.disabled'), variant: 'secondary', icon: XCircle },
  not_configured: { label: t('extensions.notSetUp'), variant: 'secondary', icon: Settings2 },
});

const getCategoryLabels = (t: (key: string) => string): Record<string, string> => ({
  ai: t('extensions.aiProvider'),
  channels: t('extensions.communicationChannels'),
  pms: t('extensions.hotelSystems'),
  operations: t('extensions.operations'),
});

function StatusIndicator({ status, t }: { status: IntegrationStatus; t: (key: string) => string }) {
  const statusConfig = getStatusConfig(t);
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

function ExtensionCard({ integration, t }: { integration: Integration; t: (key: string) => string }) {
  const activeProviders = integration.providers.filter((p) => p.enabled);
  const errorProvider = activeProviders.find((p) => p.lastError);

  return (
    <Link to={`/settings/extensions/${integration.id}`}>
      <Card className="card-hover cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-foreground/5 group-hover:bg-muted transition-colors">
              <ExtensionIcon id={integration.id} size="lg" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{integration.name}</h3>
                  {integration.required && (
                    <Badge variant="outline" className="text-xs">{t('common.required')}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusIndicator status={integration.status} t={t} />
                  <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors rtl:rotate-180" />
                </div>
              </div>
              {activeProviders.length > 0 ? (
                <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  {activeProviders.map((provider, index) => (
                    <span key={provider.id} className="flex items-center gap-1">
                      <ExtensionIcon id={provider.id} size="sm" />
                      {provider.name}
                      {index < activeProviders.length - 1 && <span className="text-muted-foreground/50 mx-0.5">•</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('extensions.noProviderConfigured')}</p>
              )}
            </div>
          </div>

          {integration.status === 'error' && errorProvider?.lastError && (
            <InlineAlert variant="error" className="mt-3">
              {errorProvider.lastError}
            </InlineAlert>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function ExtensionsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const categoryLabels = getCategoryLabels(t);

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

  // Calculate stats - count individual providers, not integration groups
  const allProviders = integrations.flatMap((i) => i.providers);
  const stats = {
    connected: allProviders.filter((p) => p.enabled && p.status === 'connected').length,
    configured: allProviders.filter((p) => p.enabled && p.status === 'configured').length,
    errors: allProviders.filter((p) => p.enabled && p.status === 'error').length,
    total: allProviders.filter((p) => p.enabled).length,
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
            { label: t('extensions.connected'), value: stats.connected, icon: CheckCircle2, variant: 'success' },
            { label: t('extensions.readyToTest'), value: stats.configured, icon: Zap, variant: 'warning' },
            { label: t('extensions.errors'), value: stats.errors, icon: AlertCircle, variant: 'error' },
            { label: t('extensions.total'), value: stats.total, icon: Settings2, variant: 'default' },
          ]}
        />
      )}

      {/* Search */}
      <div className="max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('extensions.searchExtensions')}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <ExtensionCardSkeleton count={4} />
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title={t('extensions.failedToLoad')}
          description={t('approvals.tryAgainLater')}
        />
      ) : filteredIntegrations.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('extensions.noExtensions')}
          description={t('extensions.noExtensionsSearch')}
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
                {grouped[category].map((integration) => (
                  <ExtensionCard key={integration.id} integration={integration} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
