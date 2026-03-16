import { useState, useEffect } from 'react';
import { useSystemHealth, type AppHealthItem, type HealthStatus } from '@/hooks/useSystemHealth';
import { useSystemLogs, type LogEntry } from '@/hooks/useSystemLogs';
import { useLiveLogs } from '@/hooks/useLiveLogs';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RefreshCw, CheckCircle2, ChevronDown, ChevronRight,
  Filter, X, ExternalLink, Wifi, WifiOff, TrendingUp, TrendingDown,
  AlertTriangle, Zap, Pause, Play, MessageSquare,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button'; // used in log viewer filters
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { AppIcon } from '@/components';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppActivity = AppHealthItem;


const LOG_VISIBLE_DEFAULT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LATENCY_WARN_MS: Partial<Record<string, number>> = {
  ai: 10_000, channel: 1_000, webchat: 500, pms: 5_000,
};
const DEFAULT_LATENCY_WARN_MS = 3_000;

const SOURCE_LABELS: Record<string, string> = {
  // activity_log sources
  whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email',
  system: 'System', webchat: 'WebChat',
  // app_logs provider_ids
  anthropic: 'Anthropic', openai: 'OpenAI', ollama: 'Ollama', local: 'Local AI',
  'whatsapp-meta': 'WhatsApp', 'sms-twilio': 'Twilio',
  'email-mailgun': 'Mailgun', 'email-sendgrid': 'SendGrid', 'email-smtp': 'SMTP', 'email-gmail-smtp': 'Gmail SMTP',
  'pms-mews': 'Mews PMS',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const SOURCE_GROUPS = [
  { label: 'Channels',        items: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }, { value: 'webchat', label: 'WebChat' }, { value: 'system', label: 'System' }] },
  { label: 'AI',              items: [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }, { value: 'ollama', label: 'Ollama' }, { value: 'local', label: 'Local AI' }] },
  { label: 'Email providers', items: [{ value: 'email-mailgun', label: 'Mailgun' }, { value: 'email-sendgrid', label: 'SendGrid' }, { value: 'email-smtp', label: 'SMTP' }, { value: 'email-gmail-smtp', label: 'Gmail SMTP' }] },
  { label: 'PMS',             items: [{ value: 'pms-mews', label: 'Mews PMS' }] },
];

function SourceFilter({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = value === 'all' ? 'All sources' : (SOURCE_GROUPS.flatMap((g) => g.items).find((i) => i.value === value)?.label ?? value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-7 w-auto min-w-[110px] justify-between px-2 text-xs font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search source…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No source found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => { onValueChange('all'); setOpen(false); }}>
                <Check className={cn('mr-2 h-3.5 w-3.5', value === 'all' ? 'opacity-100' : 'opacity-0')} />
                All sources
              </CommandItem>
            </CommandGroup>
            {SOURCE_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.value} value={item.label} onSelect={() => { onValueChange(item.value); setOpen(false); }}>
                    <Check className={cn('mr-2 h-3.5 w-3.5', value === item.value ? 'opacity-100' : 'opacity-0')} />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const LOG_STATUS_BADGE: Record<string, 'success' | 'warning' | 'error'> = {
  success: 'success', warning: 'warning', failed: 'error',
};

function formatEventType(et: string): string {
  return et.replace(/\./g, ' › ').replace(/_/g, ' ');
}

function formatRelativeTime(isoString: string, now = Date.now()): string {
  const diffMs = now - new Date(isoString).getTime();
  const secs = Math.floor(diffMs / 1_000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RelativeTime({ createdAt, now }: { createdAt: string; now: number }) {
  return <>{formatRelativeTime(createdAt, now)}</>;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  healthy: { label: 'Healthy', color: 'text-success-foreground', dot: 'bg-success-foreground' },
  warning: { label: 'Warning', color: 'text-warning-foreground', dot: 'bg-warning-foreground' },
  error:   { label: 'Error',   color: 'text-destructive',        dot: 'bg-destructive' },
  unknown: { label: 'Unknown', color: 'text-muted-foreground',   dot: 'bg-muted-foreground/40' },
};

function StatusDot({ status }: { status: HealthStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Tooltip content={cfg.label}>
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0 cursor-default">
        {status === 'healthy' && (
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', cfg.dot)} />
        )}
        <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', cfg.dot)} />
      </span>
    </Tooltip>
  );
}

function AppHealthCard({ app }: { app: AppActivity }) {
  const [showDetails, setShowDetails] = useState(false);
  const warnMs = LATENCY_WARN_MS[app.category] ?? DEFAULT_LATENCY_WARN_MS;
  const latencyOver = app.avgLatencyMs !== null && app.avgLatencyMs > warnMs;
  const isUnhealthy = app.status === 'error' || app.status === 'warning';

  return (
    <div className={cn(
      'p-4 rounded-lg border',
      app.status === 'error'   && 'border-[hsl(var(--error-border))] bg-destructive/5',
      app.status === 'warning' && 'border-warning-border bg-warning/5',
      (app.status === 'healthy' || app.status === 'unknown') && 'border-border',
    )}>
      <div className="flex-1 min-w-0">

        {/* Row 1: app icon · name · status dot */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <AppIcon id={app.appId} size="sm" />
          <span className="font-medium text-sm">{app.name}</span>
          <StatusDot status={app.status} />
        </div>

        {/* Row 2: activity count · detail */}
        {(app.activityCount !== null || app.detail) && (
          <div className="mt-3 flex items-center gap-2">
            {app.activityCount !== null && (
              <Tooltip content={app.summary}>
                <span className="flex items-center gap-1 text-xs text-foreground/70 cursor-default">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  {app.activityCount}
                </span>
              </Tooltip>
            )}
            {app.activityCount !== null && app.detail && (
              <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
            )}
            {app.detail && <span className="text-xs text-muted-foreground">{app.detail}</span>}
          </div>
        )}

        {/* Row 3: latency */}
        {app.avgLatencyMs !== null && (
          <div className="mt-3 flex items-center gap-1">
            <span className={cn(
              'flex items-center gap-1 text-xs',
              latencyOver ? 'text-warning-foreground' : 'text-muted-foreground',
            )}>
              <Wifi className="h-3 w-3" />
              avg {formatLatency(app.avgLatencyMs)}
              {app.latencyTrend === 'up'   && <TrendingUp   className="h-3 w-3 text-warning-foreground" />}
              {app.latencyTrend === 'down' && <TrendingDown className="h-3 w-3 text-success-foreground" />}
            </span>
          </div>
        )}

        {/* Partial failure — visible even on healthy cards */}
        {app.partialFailure && (
          <p className="mt-3 flex items-center gap-1 text-xs text-warning-foreground">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {app.partialFailure}
          </p>
        )}

        {/* Error state: plain description + action row */}
        {isUnhealthy && (
          <div className="mt-3 space-y-3">
            {/* Plain-language error description */}
            {app.errorDescription && (
              <p className="text-xs text-destructive">{app.errorDescription}</p>
            )}

            {/* Action row: App Settings + Details toggle */}
            <div className="flex items-center gap-3">
              <Link
                to={`/engine/apps/${app.appId}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
<ExternalLink className="h-3 w-3" /> Settings
              </Link>
              {app.lastErrorRaw && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDetails
                    ? <><ChevronDown className="h-3 w-3" /> Hide details</>
                    : <><ChevronRight className="h-3 w-3" /> Details</>}
                </button>
              )}
            </div>

            {/* Raw technical error — revealed on expand */}
            {showDetails && app.lastErrorRaw && (
              <p className="font-mono text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1.5 break-all">
                {app.lastErrorRaw}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Zone 3: Log Row ──────────────────────────────────────────────────────────

function LogRow({ entry, isNew = false, now }: { entry: LogEntry; isNew?: boolean; now: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors duration-700',
          entry.status === 'failed' && 'bg-destructive/5',
          isNew && 'bg-yellow-400/10',
        )}
        onClick={() => entry.details && setExpanded(!expanded)}
      >
        <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap"><RelativeTime createdAt={entry.createdAt} now={now} /></td>
        <td className="py-2.5 px-3 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-medium">
            <AppIcon id={entry.source} size="sm" />
            {sourceLabel(entry.source)}
          </div>
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
          {formatEventType(entry.eventType)}
        </td>
        <td className="py-2.5 px-3">
          <Badge variant={LOG_STATUS_BADGE[entry.status]} className="text-[10px] py-0">
            {entry.status}
          </Badge>
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
          {formatLatency(entry.latencyMs)}
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-xs truncate">
          {entry.errorMessage || '—'}
        </td>
        <td className="py-2.5 px-3 w-6 text-muted-foreground">
          {entry.details && (expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />)}
        </td>
      </tr>
      {expanded && entry.details && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={7} className="px-3 py-2">
            <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HealthContent() {
  const { can } = usePermissions();
  const isAdmin = can(PERMISSIONS.HEALTH_VIEW);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  const filterSource = searchParams.get('source') ?? 'all';
  const filterStatus = searchParams.get('status') ?? 'all';
  const filterFrom   = searchParams.get('from')   ?? '';
  const filterTo     = searchParams.get('to')     ?? '';
  const logLimit     = Number(searchParams.get('limit')) || LOG_VISIBLE_DEFAULT;

  function setFilter(updates: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === '' || v === 'all' || v === String(LOG_VISIBLE_DEFAULT)) {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      return next;
    }, { replace: true });
  }

  const setFilterSource = (v: string) => setFilter({ source: v, limit: String(LOG_VISIBLE_DEFAULT) });
  const setFilterStatus = (v: string) => setFilter({ status: v, limit: String(LOG_VISIBLE_DEFAULT) });
  const setFilterDateRange = (f: string, t: string) => setFilter({ from: f, to: t, limit: String(LOG_VISIBLE_DEFAULT) });
  const setLogLimit     = (v: number) => setFilter({ limit: String(v) });

  const logFilters = { source: filterSource, status: filterStatus, from: filterFrom, to: filterTo, limit: logLimit };

  const { data: logsData, isFetching: logsFetching, refetch: refetchLogs } = useSystemLogs(logFilters);

  const {
    liveState, entries: liveEntries, highlightIds,
    isInitializing, startLive, pauseLive, resumeLive, stopLive,
  } = useLiveLogs(logFilters);

  const isLive   = liveState === 'live';
  const isPaused = liveState === 'paused';

  const { data: healthData, isLoading, refetch, isFetching } = useSystemHealth({
    refetchInterval: isLive ? 10_000 : 30_000,
  });

  function handleRefresh() {
    if (liveState !== 'off') stopLive();
    refetch();
    refetchLogs();
  }

  const activity: AppHealthItem[] = healthData?.apps ?? [];
  const allHealthy   = activity.length > 0 && activity.every((a) => a.status === 'healthy');
  const healthyCount = activity.filter((a) => a.status === 'healthy').length;
  const warningCount = activity.filter((a) => a.status === 'warning').length;
  const errorCount   = activity.filter((a) => a.status === 'error').length;
  const unknownCount = activity.filter((a) => a.status === 'unknown').length;

  const logs: LogEntry[]  = liveState !== 'off' ? liveEntries : (logsData?.logs ?? []);
  const hasMoreLogs        = liveState === 'off' && (logsData?.hasMore ?? false);
  const isFiltered = filterSource !== 'all' || filterStatus !== 'all' || filterFrom !== '' || filterTo !== '';

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">System Health</h2>
          <p className="text-sm text-muted-foreground">
            Status of all connected apps and integrations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleRefresh}
            disabled={isFetching || logsFetching || isInitializing}
          >
            <RefreshCw className={cn('h-3 w-3', (isFetching || logsFetching) && 'animate-spin')} />
            Refresh
          </Button>
          {isAdmin && (
            isLive ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs border-success/40 text-success-foreground hover:bg-success/10"
                onClick={pauseLive}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-foreground opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success-foreground" />
                </span>
                Live
              </Button>
            ) : isPaused ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={resumeLive}
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={startLive}
              >
                <Zap className="h-3 w-3" />
                Go Live
              </Button>
            )
          )}
        </div>
      </div>

      {/* ── Zone 1: Summary ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {allHealthy ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" />
            <span className="text-xs text-success-foreground font-medium">All systems operational</span>
          </div>
        ) : (
          <>
            {healthyCount > 0 && (
              <Badge variant="success" className="gap-1.5">
                <CheckCircle2 className="h-3 w-3" />{healthyCount} healthy
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="warning" className="gap-1.5">
                <AlertTriangle className="h-3 w-3" />{warningCount} warning
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="error" className="gap-1.5">
                <WifiOff className="h-3 w-3" />{errorCount} error
              </Badge>
            )}
            {unknownCount > 0 && (
              <Badge variant="secondary" className="gap-1.5">
                {unknownCount} unknown
              </Badge>
            )}
          </>
        )}
      </div>

      {/* ── Zone 2: App health cards (all apps, always shown) ──────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground col-span-2">Loading health data…</p>
        )}
        {!isLoading && activity.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-2">No apps configured yet.</p>
        )}
        {activity.map((app) => (
          <AppHealthCard key={app.appId} app={app} />
        ))}
      </div>

      {/* ── Zone 3: System Logs (admin only) ─────────────────────────────────── */}
      {isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                System Logs
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <SourceFilter value={filterSource} onValueChange={setFilterSource} />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 w-auto min-w-[110px] px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="failed">Errors only</SelectItem>
                  <SelectItem value="warning">Warnings only</SelectItem>
                  <SelectItem value="success">Successes only</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker
                from={filterFrom}
                to={filterTo}
                onChange={setFilterDateRange}
              />
              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setFilter({ source: 'all', status: 'all', from: '', to: '', limit: String(LOG_VISIBLE_DEFAULT) })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {isPaused && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Pause className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1">Live paused — new entries are not loading</span>
              <button
                onClick={resumeLive}
                className="flex items-center gap-1 font-medium text-foreground hover:text-foreground/70 transition-colors"
              >
                <Play className="h-3 w-3" /> Resume
              </button>
              <button
                onClick={stopLive}
                className="hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left whitespace-nowrap">Time</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left whitespace-nowrap">Source</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left whitespace-nowrap">Event</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left whitespace-nowrap">Status</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left whitespace-nowrap">Latency</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground text-left">Message</th>
                      <th className="py-2.5 px-3 w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {(logsFetching || isInitializing) && logs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                          {isInitializing ? 'Starting live stream…' : 'Loading logs…'}
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                          {isLive ? 'Waiting for new entries…' : 'No log entries match the current filters'}
                        </td>
                      </tr>
                    ) : (
                      logs.map((entry) => (
                        <LogRow key={entry.id} entry={entry} isNew={highlightIds.has(entry.id)} now={now} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {logs.length > 0 && (
                <div className="px-3 py-2.5 border-t border-border/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {isLive
                      ? <span className="flex items-center gap-1.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-foreground opacity-60" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success-foreground" />
                          </span>
                          {logs.length} entries · polling every 10s
                        </span>
                      : isPaused
                        ? `${logs.length} entries · paused`
                        : `${logs.length} entries${logsFetching ? ' · refreshing…' : ''}`
                    }
                  </span>
                  {hasMoreLogs && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => setLogLimit(logLimit + 20)}
                    >
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
