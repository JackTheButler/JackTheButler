import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  AlertCircle,
  Clock,
  Zap,
  MessageSquare,
  ListTodo,
  Bell,
  Webhook,
  Calendar,
  Play,
  Pause,
  ChevronRight,
  Search,
} from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { PageContainer, PageHeader, StatsBar, SearchInput, EmptyState } from '@/components';
import { AutomationCardSkeleton } from '@/components';

type TriggerType = 'time_based' | 'event_based';
type ActionType = 'send_message' | 'create_task' | 'notify_staff' | 'webhook';

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const triggerIcons: Record<TriggerType, typeof Clock> = {
  time_based: Calendar,
  event_based: Zap,
};

const actionIcons: Record<ActionType, typeof MessageSquare> = {
  send_message: MessageSquare,
  create_task: ListTodo,
  notify_staff: Bell,
  webhook: Webhook,
};

function getTriggerDescription(rule: AutomationRule, t: (key: string) => string): string {
  const config = rule.triggerConfig;
  if (rule.triggerType === 'time_based') {
    const type = config.type as string;
    const offsetDays = config.offsetDays as number | undefined;
    const time = config.time as string | undefined;

    const typeLabelsMap: Record<string, string> = {
      before_arrival: t('automations.triggers.beforeArrival'),
      after_arrival: t('automations.triggers.afterArrival'),
      before_departure: t('automations.triggers.beforeDeparture'),
      after_departure: t('automations.triggers.afterDeparture'),
      scheduled: t('automations.triggers.scheduled'),
    };

    let desc = typeLabelsMap[type] || type;
    if (offsetDays !== undefined) {
      const dayLabel = Math.abs(offsetDays) !== 1 ? t('automations.triggers.days') : t('automations.triggers.day');
      desc += ` (${Math.abs(offsetDays)} ${dayLabel})`;
    }
    if (time) {
      desc += ` ${t('automations.triggers.at')} ${time}`;
    }
    return desc;
  } else {
    const eventType = config.eventType as string;
    const eventLabelsMap: Record<string, string> = {
      'reservation.created': t('automations.events.reservationCreated'),
      'reservation.updated': t('automations.events.reservationUpdated'),
      'reservation.checked_in': t('automations.events.checkedIn'),
      'reservation.checked_out': t('automations.events.checkedOut'),
      'reservation.cancelled': t('automations.events.reservationCancelled'),
      'conversation.started': t('automations.events.conversationStarted'),
      'conversation.escalated': t('automations.events.conversationEscalated'),
      'task.created': t('automations.events.taskCreated'),
      'task.completed': t('automations.events.taskCompleted'),
    };
    return eventLabelsMap[eventType] || eventType;
  }
}

function RuleCard({ rule, onToggle, t }: { rule: AutomationRule; onToggle: (enabled: boolean) => void; t: (key: string) => string }) {
  const TriggerIcon = triggerIcons[rule.triggerType] || Clock;
  const ActionIcon = actionIcons[rule.actionType] || Zap;

  const actionTypeKeyMap: Record<ActionType, string> = {
    send_message: 'sendMessage',
    create_task: 'createTask',
    notify_staff: 'notifyStaff',
    webhook: 'webhook',
  };

  return (
    <Card className={cn('card-hover group', !rule.enabled && 'opacity-60')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <Link to={`/settings/automations/${rule.id}`} className="flex-1 min-w-0">
            <div className="flex items-start gap-4">
              <div className={cn(
                'p-2.5 rounded-xl transition-colors',
                rule.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <TriggerIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">{rule.name}</h3>
                  {rule.lastError && (
                    <Badge variant="error" className="shrink-0">{t('extensions.error')}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {rule.description || getTriggerDescription(rule, t)}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ActionIcon className="w-3.5 h-3.5" />
                    {t(`automations.actionTypes.${actionTypeKeyMap[rule.actionType]}`)}
                  </span>
                  {rule.runCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Play className="w-3.5 h-3.5" />
                      {rule.runCount} {rule.runCount !== 1 ? t('automations.runs') : t('automations.run')}
                    </span>
                  )}
                  {rule.lastRunAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {t('automations.lastRun')}: {formatDate(rule.lastRunAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <Switch
              checked={rule.enabled}
              onCheckedChange={onToggle}
              aria-label={rule.enabled ? t('automations.disableRule') : t('automations.enableRule')}
            />
            <Link to={`/settings/automations/${rule.id}`}>
              <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </Link>
          </div>
        </div>

        {rule.lastError && (
          <InlineAlert variant="error" className="mt-3">
            {rule.lastError}
          </InlineAlert>
        )}
      </CardContent>
    </Card>
  );
}

const getTriggerTypeFilters = (t: (key: string) => string): { value: 'all' | TriggerType; label: string; icon?: typeof Calendar }[] => [
  { value: 'all', label: t('automations.filterAll') },
  { value: 'time_based', label: t('automations.filterScheduled'), icon: Calendar },
  { value: 'event_based', label: t('automations.filterEvents'), icon: Zap },
];

export function AutomationsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | TriggerType>('all');
  const queryClient = useQueryClient();
  const triggerTypeFilters = getTriggerTypeFilters(t);

  const { data, isLoading, error } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => api.get<{ rules: AutomationRule[] }>('/automation/rules'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      api.post(`/automation/rules/${ruleId}/toggle`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  const rules = data?.rules || [];

  // Filter rules
  const filteredRules = rules.filter((rule) => {
    const matchesSearch =
      rule.name.toLowerCase().includes(search.toLowerCase()) ||
      (rule.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesType = filterType === 'all' || rule.triggerType === filterType;
    return matchesSearch && matchesType;
  });

  // Calculate stats
  const stats = {
    active: rules.filter((r) => r.enabled).length,
    inactive: rules.filter((r) => !r.enabled).length,
    errors: rules.filter((r) => r.lastError).length,
    total: rules.length,
  };

  return (
    <PageContainer>
      <PageHeader>
        <Link to="/settings/automations/new">
          <Button size="sm" >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('automations.newRule')}
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      {!isLoading && !error && (
        <StatsBar
          items={[
            { label: t('automations.active'), value: stats.active, icon: Play, variant: 'success' },
            { label: t('automations.inactive'), value: stats.inactive, icon: Pause, variant: 'warning' },
            { label: t('automations.errors'), value: stats.errors, icon: AlertCircle, variant: 'error' },
            { label: t('automations.total'), value: stats.total, icon: Zap, variant: 'default' },
          ]}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('automations.searchAutomations')}
          />
        </div>
        <FilterTabs
          options={triggerTypeFilters}
          value={filterType}
          onChange={setFilterType}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <AutomationCardSkeleton count={3} />
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title={t('automations.failedToLoad')}
          description={t('automations.tryAgainLater')}
        />
      ) : filteredRules.length === 0 ? (
        rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={t('automations.noRulesYet')}
            description={t('automations.noRulesYetDesc')}
          >
            <Link to="/settings/automations/new">
              <Button >
                <Plus className="w-4 h-4 mr-2" />
                {t('automations.createRule')}
              </Button>
            </Link>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Search}
            title={t('automations.noRulesFound')}
            description={t('automations.noRulesFoundDesc')}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredRules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={(enabled) =>
                toggleMutation.mutate({ ruleId: rule.id, enabled })
              }
              t={t}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
