import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  Code,
  Copy,
  Check,
} from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatTime } from '@/lib/formatters';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppIcon, PageContainer } from '@/components';

type AppStatus = 'not_configured' | 'configured' | 'connected' | 'error' | 'disabled';

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'boolean' | 'number' | 'color';
  required: boolean;
  placeholder?: string;
  description?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
}

interface App {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string | null;
  version: string;
  docsUrl: string | null;
  configSchema: ConfigField[];
  status: AppStatus;
  enabled: boolean;
  isActive: boolean;
  config: Record<string, string | boolean | number> | null;
  lastChecked: string | null;
  lastError: string | null;
}

interface LogEntry {
  id: string;
  appId: string;
  eventType: string;
  status: string;
  details: Record<string, unknown> | null;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt: string;
}

const getStatusConfig = (t: (key: string) => string): Record<
  AppStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: typeof CheckCircle2 }
> => ({
  connected: { label: t('appEdit.status.connected'), variant: 'success', icon: CheckCircle2 },
  configured: { label: t('appEdit.status.ready'), variant: 'warning', icon: Zap },
  error: { label: t('appEdit.status.error'), variant: 'error', icon: AlertCircle },
  disabled: { label: t('appEdit.status.disabled'), variant: 'secondary', icon: PowerOff },
  not_configured: { label: t('appEdit.status.notSetUp'), variant: 'secondary', icon: Settings2 },
});

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
      {latency && <span className="text-xs text-muted-foreground ms-auto">{latency}ms</span>}
    </div>
  );
}

/**
 * Map field keys to translation keys
 */
const fieldLabelKeys: Record<string, string> = {
  embeddingModel: 'appEdit.fields.embeddingModel',
  completionModel: 'appEdit.fields.completionModel',
  enableEmbedding: 'appEdit.fields.enableEmbedding',
  enableCompletion: 'appEdit.fields.enableCompletion',
};

/** SVG icons for the webchat button icon picker */
const BUTTON_ICON_OPTIONS: { value: string; label: string; svg: string }[] = [
  {
    value: 'chat',
    label: 'Chat Bubble',
    svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  },
  {
    value: 'bell',
    label: 'Concierge Bell',
    svg: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  },
  {
    value: 'dots',
    label: 'Message Dots',
    svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>',
  },
  {
    value: 'headset',
    label: 'Headset',
    svg: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  },
];

function ConfigForm({
  app,
  onSaved,
  canManage,
}: {
  app: App;
  onSaved: () => void;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const field of app.configSchema) {
      const existingValue = app.config?.[field.key];
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
      api.put(`/apps/${app.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app', app.id] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
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
      {app.configSchema.map((field) => {
        const fieldLabel = fieldLabelKeys[field.key] ? t(fieldLabelKeys[field.key]) : field.label;
        return (
        <div key={field.key} className="space-y-2">
          {field.type === 'boolean' ? (
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor={field.key}>{fieldLabel}</Label>
                {field.description && (
                  <p className="text-sm text-muted-foreground">{field.description}</p>
                )}
              </div>
              <Switch
                id={field.key}
                checked={formData[field.key] === true}
                onCheckedChange={(checked) => setFormData({ ...formData, [field.key]: checked })}
                disabled={!canManage}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Label htmlFor={field.key}>{fieldLabel}</Label>
                {field.required && <span className="text-red-500">*</span>}
              </div>

              {field.key === 'buttonIcon' ? (
                <div className="flex gap-2">
                  {BUTTON_ICON_OPTIONS.map((opt) => {
                    const selected = (formData[field.key] || field.default || 'chat') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!canManage}
                        onClick={() => setFormData({ ...formData, [field.key]: opt.value })}
                        title={opt.label}
                        className={cn(
                          'flex items-center justify-center w-12 h-12 rounded-lg border-2 transition-colors',
                          'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent bg-muted/50'
                        )}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={cn('w-5 h-5', selected ? 'text-primary' : 'text-muted-foreground')}
                          dangerouslySetInnerHTML={{ __html: opt.svg }}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : field.type === 'select' && field.options ? (
                <Select
                  value={String(formData[field.key] || '')}
                  onValueChange={(value) => setFormData({ ...formData, [field.key]: value })}
                  required={field.required}
                  disabled={!canManage}
                >
                  <SelectTrigger id={field.key}>
                    <SelectValue placeholder={t('appEdit.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === 'color' ? (
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id={field.key}
                    value={String(formData[field.key] || field.default || '#000000')}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    disabled={!canManage}
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Input
                    value={String(formData[field.key] || '')}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="flex-1 font-mono"
                    disabled={!canManage}
                  />
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id={field.key}
                    type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                    value={String(formData[field.key] || '')}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                    className={field.type === 'password' ? 'pe-12' : ''}
                    disabled={!canManage}
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => togglePassword(field.key)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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

              {field.description && (
                <p className="text-sm text-muted-foreground">{field.description}</p>
              )}
            </>
          )}
        </div>
        );
      })}

      {canManage && (
        <div className="pt-4 space-y-4">
          <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
            {saveMutation.isPending && <Spinner size="sm" className="me-2" />}
            {t('appEdit.saveConfiguration')}
          </Button>

          {saveMutation.isError && (
            <Toast type="error" message={(saveMutation.error as Error).message} />
          )}
          {saveMutation.isSuccess && (
            <Toast type="success" message={t('appEdit.configSaved')} />
          )}
        </div>
      )}
    </form>
  );
}

function ConnectionStatus({ app, canManage }: { app: App; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const statusConfig = getStatusConfig(t);
  const config = statusConfig[app.status] || statusConfig.not_configured;
  const StatusIcon = config.icon;

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; message: string; latencyMs: number | null }>(
        `/apps/${app.id}/test`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app', app.id] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post(`/apps/${app.id}/toggle`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app', app.id] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {app.status === 'connected' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            )}
            <Badge variant={config.variant} className="gap-1">
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </Badge>
            {app.enabled && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                {t('appEdit.active')}
              </Badge>
            )}
          </div>
          {app.lastChecked && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {t('appEdit.lastChecked')}: {formatDateTime(app.lastChecked)}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !app.config}
            >
              {testMutation.isPending ? (
                <Spinner size="sm" className="me-2" />
              ) : (
                <Zap className="w-4 h-4 me-2" />
              )}
              {t('appEdit.testConnection')}
            </Button>
            {app.config && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleMutation.mutate(!app.enabled)}
                disabled={toggleMutation.isPending}
                className={cn(
                  app.enabled
                    ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                    : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                )}
              >
                {toggleMutation.isPending ? (
                  <Spinner size="sm" />
                ) : app.enabled ? (
                  <>
                    <PowerOff className="w-4 h-4 me-2" />
                    {t('appEdit.disable')}
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4 me-2" />
                    {t('appEdit.enable')}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {testMutation.isSuccess && (
        <Toast
          type={testMutation.data.success ? 'success' : 'error'}
          message={testMutation.data.message}
          latency={testMutation.data.latencyMs}
        />
      )}

      {app.lastError && app.status === 'error' && (
        <InlineAlert variant="error">
          {app.lastError}
        </InlineAlert>
      )}
    </div>
  );
}

function ActivityLogs({ appId }: { appId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['app-logs', appId],
    queryFn: () =>
      api.get<{ logs: LogEntry[] }>(`/apps/${appId}/logs?limit=10`),
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
        <p className="text-sm text-muted-foreground">{t('appEdit.noActivityLogs')}</p>
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

function EmbedCode({ widgetKey }: { widgetKey: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // In production, gateway = same origin. In dev, Vite runs on 5173 but gateway is on 3000.
  const gatewayUrl = import.meta.env.DEV
    ? window.location.origin.replace(/:\d+$/, ':3000')
    : window.location.origin;
  const snippet = `<button data-butler-chat>Chat</button>\n<script src="${gatewayUrl}/widget.js" data-butler-key="${widgetKey}"></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Code className="w-4 h-4" />
          {t('appEdit.embedCode', 'Embed Code')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('appEdit.embedCodeDescription', 'Add this snippet to your hotel website to enable the chat widget.')}
        </p>
        <div className="relative">
          <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
            {snippet}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="absolute top-2 end-2"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 me-1.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 me-1.5" />
            )}
            {copied ? t('appEdit.copied', 'Copied') : t('appEdit.copy', 'Copy')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AppEditPage() {
  const { t } = useTranslation();
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageSettings = can(PERMISSIONS.SETTINGS_MANAGE);

  const { data: app, isLoading, error } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => api.get<App>(`/apps/${appId}`),
    enabled: !!appId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/apps/${appId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app', appId] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  if (isLoading) {
    return (
      <PageContainer className="flex items-center justify-center">
        <Spinner size="lg" />
      </PageContainer>
    );
  }

  if (error || !app) {
    return (
      <PageContainer>
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-medium">{t('appEdit.failedToLoad')}</p>
          <p className="text-muted-foreground mb-4">{t('appEdit.tryAgainLater')}</p>
          <Button variant="outline" asChild>
            <Link to="/engine/apps">
              <ArrowLeft className="w-4 h-4 me-2 rtl:rotate-180" />
              {t('appEdit.backToApps')}
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Back Link */}
      <Link
        to="/engine/apps"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        {t('appEdit.backToApps')}
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-foreground/5">
          <AppIcon id={app.id} size="xl" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
          <p className="text-muted-foreground">{app.description}</p>
          {app.docsUrl && (
            <a
              href={app.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
            >
              {t('appEdit.viewDocumentation')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Connection Status */}
        {app.config && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('appEdit.connectionStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ConnectionStatus app={app} canManage={canManageSettings} />
            </CardContent>
          </Card>
        )}

        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('appEdit.configuration')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigForm
              key={app.id}
              app={app}
              onSaved={() => {}}
              canManage={canManageSettings}
            />
          </CardContent>
        </Card>

        {/* Embed Code (webchat only) */}
        {app.id === 'channel-webchat' && app.config?.widgetKey && (
          <EmbedCode widgetKey={String(app.config.widgetKey)} />
        )}

        {/* Activity Logs */}
        {app.config && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t('appEdit.recentActivity')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityLogs appId={app.id} />
            </CardContent>
          </Card>
        )}

        {/* Danger Zone */}
        {app.config && canManageSettings && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base text-red-600">{t('appEdit.dangerZone')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('appEdit.removeConfig')}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(t('appEdit.removeConfirm'))) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                {deleteMutation.isPending ? (
                  <Spinner size="sm" className="me-2" />
                ) : (
                  <Trash2 className="w-4 h-4 me-2" />
                )}
                {t('appEdit.removeConfiguration')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
