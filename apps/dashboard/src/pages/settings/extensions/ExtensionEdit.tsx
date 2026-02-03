import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/spinner';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  Zap,
  Clock,
  Activity,
  Settings2,
  Power,
  PowerOff,
} from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatTime } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ExtensionIcon } from '@/components';

type IntegrationStatus = 'not_configured' | 'configured' | 'connected' | 'error' | 'disabled';

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'boolean';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
}

interface Provider {
  id: string;
  name: string;
  description: string;
  docsUrl: string | null;
  configSchema: ConfigField[];
  status: IntegrationStatus;
  enabled: boolean;
  config: Record<string, string | boolean | number> | null;
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

interface LogEntry {
  id: string;
  providerId: string;
  eventType: string;
  status: string;
  details: Record<string, unknown> | null;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt: string;
}

const statusConfig: Record<
  IntegrationStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: typeof CheckCircle2 }
> = {
  connected: { label: 'Connected', variant: 'success', icon: CheckCircle2 },
  configured: { label: 'Ready', variant: 'warning', icon: Zap },
  error: { label: 'Error', variant: 'error', icon: AlertCircle },
  disabled: { label: 'Disabled', variant: 'secondary', icon: PowerOff },
  not_configured: { label: 'Not Set Up', variant: 'secondary', icon: Settings2 },
};

function Toast({
  type,
  message,
  latency,
}: {
  type: 'success' | 'error';
  message: string;
  latency?: number | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg animate-in fade-in slide-in-from-top-2',
        type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-800'
          : 'bg-red-50 border border-red-200 text-red-800'
      )}
    >
      {type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
      )}
      <span className="text-sm font-medium">{message}</span>
      {latency && <span className="text-xs text-muted-foreground ml-auto">{latency}ms</span>}
    </div>
  );
}

function ConfigForm({
  provider,
  extensionId,
  onSaved,
}: {
  provider: Provider;
  extensionId: string;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const field of provider.configSchema) {
      const existingValue = provider.config?.[field.key];
      if (field.type === 'boolean') {
        initial[field.key] = existingValue === true;
      } else {
        initial[field.key] = typeof existingValue === 'string' ? existingValue : '';
      }
    }
    return initial;
  });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const saveMutation = useMutation({
    mutationFn: (data: { enabled: boolean; config: Record<string, string | boolean> }) =>
      api.put(`/integrations/${extensionId}/providers/${provider.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration', extensionId] });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      onSaved();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      enabled: true,
      config: formData,
    });
  };

  const togglePassword = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {provider.configSchema.map((field) => (
        <div key={field.key} className="space-y-2">
          {field.type === 'boolean' ? (
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.helpText && (
                  <p className="text-sm text-muted-foreground">{field.helpText}</p>
                )}
              </div>
              <Switch
                id={field.key}
                checked={formData[field.key] === true}
                onCheckedChange={(checked) => setFormData({ ...formData, [field.key]: checked })}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.required && <span className="text-red-500">*</span>}
              </div>

              {field.type === 'select' && field.options ? (
                <select
                  id={field.key}
                  value={String(formData[field.key] || '')}
                  onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required={field.required}
                >
                  <option value="">Select...</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  <Input
                    id={field.key}
                    type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                    value={String(formData[field.key] || '')}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                    className={field.type === 'password' ? 'pr-12' : ''}
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => togglePassword(field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPasswords[field.key] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              )}

              {field.helpText && (
                <p className="text-sm text-muted-foreground">{field.helpText}</p>
              )}
            </>
          )}
        </div>
      ))}

      <div className="pt-4 space-y-4">
        <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
          {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
          Save Configuration
        </Button>

        {saveMutation.isError && (
          <Toast type="error" message={(saveMutation.error as Error).message} />
        )}
        {saveMutation.isSuccess && (
          <Toast type="success" message="Configuration saved successfully" />
        )}
      </div>
    </form>
  );
}

function ConnectionStatus({
  provider,
  extensionId,
}: {
  provider: Provider;
  extensionId: string;
}) {
  const queryClient = useQueryClient();
  const config = statusConfig[provider.status] || statusConfig.not_configured;
  const StatusIcon = config.icon;

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; message: string; latencyMs: number | null }>(
        `/integrations/${extensionId}/providers/${provider.id}/test`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration', extensionId] });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post(`/integrations/${extensionId}/providers/${provider.id}/toggle`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration', extensionId] });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {provider.status === 'connected' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            )}
            <Badge variant={config.variant} className="gap-1">
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </Badge>
            {provider.enabled && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                Active
              </Badge>
            )}
          </div>
          {provider.lastChecked && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Last checked: {formatDateTime(provider.lastChecked)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !provider.config}
          >
            {testMutation.isPending ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Test Connection
          </Button>
          {provider.config && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleMutation.mutate(!provider.enabled)}
              disabled={toggleMutation.isPending}
              className={cn(
                provider.enabled
                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                  : 'text-green-600 hover:text-green-700 hover:bg-green-50'
              )}
            >
              {toggleMutation.isPending ? (
                <Spinner size="sm" />
              ) : provider.enabled ? (
                <>
                  <PowerOff className="w-4 h-4 mr-2" />
                  Disable
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 mr-2" />
                  Enable
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {testMutation.isSuccess && (
        <Toast
          type={testMutation.data.success ? 'success' : 'error'}
          message={testMutation.data.message}
          latency={testMutation.data.latencyMs}
        />
      )}

      {provider.lastError && provider.status === 'error' && (
        <InlineAlert variant="error">
          {provider.lastError}
        </InlineAlert>
      )}
    </div>
  );
}

function ActivityLogs({ extensionId, providerId }: { extensionId: string; providerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['integration-logs', extensionId, providerId],
    queryFn: () =>
      api.get<{ logs: LogEntry[] }>(`/integrations/${extensionId}/logs?providerId=${providerId}&limit=10`),
  });

  const logs = data?.logs || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No activity logs yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-20 shrink-0 tabular-nums">
              {formatTime(log.createdAt)}
            </span>
            <span className="text-sm text-foreground capitalize">
              {log.eventType.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {log.latencyMs && (
              <span className="text-xs text-muted-foreground tabular-nums">{log.latencyMs}ms</span>
            )}
            <Badge variant={log.status === 'success' ? 'success' : 'error'} className="text-xs">
              {log.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExtensionEditPage() {
  const { extensionId } = useParams<{ extensionId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['integration', extensionId],
    queryFn: () => api.get<Integration>(`/integrations/${extensionId}`),
    enabled: !!extensionId,
  });

  const deleteMutation = useMutation({
    mutationFn: (providerId: string) =>
      api.delete(`/integrations/${extensionId}/providers/${providerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration', extensionId] });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const integration = data;
  const providers = integration?.providers || [];

  // Get provider from URL query param, or fall back to first enabled/configured/available
  const providerParam = searchParams.get('provider');
  const effectiveProviderId =
    (providerParam && providers.find((p) => p.id === providerParam)?.id) ||
    providers.find((p) => p.enabled)?.id ||
    providers.find((p) => p.config)?.id ||
    providers[0]?.id;

  const setSelectedProviderId = (providerId: string) => {
    setSearchParams({ provider: providerId }, { replace: true });
  };

  const selectedProvider = providers.find((p) => p.id === effectiveProviderId);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !integration) {
    return (
      <div className="p-6 ">
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-medium">Failed to load extension</p>
          <p className="text-muted-foreground mb-4">Please try again later</p>
          <Button variant="outline" asChild>
            <Link to="/settings/extensions">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Extensions
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6  space-y-6">
      {/* Back Link */}
      <Link
        to="/settings/extensions"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Extensions
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-muted/50">
          <ExtensionIcon id={integration.id} size="xl" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{integration.name}</h1>
            {integration.required && (
              <Badge variant="outline" className="text-xs">Required</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{integration.description}</p>
        </div>
      </div>

      {/* Provider Selection */}
      {providers.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  variant={effectiveProviderId === provider.id ? 'default' : 'outline'}
                  onClick={() => setSelectedProviderId(provider.id)}
                  className="gap-2"
                >
                  <ExtensionIcon id={provider.id} size="sm" />
                  {provider.name}
                  {provider.enabled && (
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  )}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedProvider && (
        <div className="space-y-6">
          {/* Provider Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <ExtensionIcon id={selectedProvider.id} size="lg" />
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="font-semibold">{selectedProvider.name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedProvider.description}</p>
                  {selectedProvider.docsUrl && (
                    <a
                      href={selectedProvider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
                    >
                      View Documentation
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Status */}
          {selectedProvider.config && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connection Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ConnectionStatus provider={selectedProvider} extensionId={extensionId!} />
              </CardContent>
            </Card>
          )}

          {/* Configuration Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfigForm
                key={selectedProvider.id}
                provider={selectedProvider}
                extensionId={extensionId!}
                onSaved={() => {}}
              />
            </CardContent>
          </Card>

          {/* Activity Logs */}
          {selectedProvider.config && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityLogs extensionId={extensionId!} providerId={selectedProvider.id} />
              </CardContent>
            </Card>
          )}

          {/* Danger Zone */}
          {selectedProvider.config && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Remove this provider configuration. This will disable the integration and delete all stored credentials.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm('Are you sure you want to remove this configuration?')) {
                      deleteMutation.mutate(selectedProvider.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {deleteMutation.isPending ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Remove Configuration
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
