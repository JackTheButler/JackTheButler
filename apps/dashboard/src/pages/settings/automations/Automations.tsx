import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PageContainer, PageHeader, StatsBar, SearchInput, EmptyState } from '@/components';

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

const triggerLabels: Record<TriggerType, { label: string; icon: typeof Clock }> = {
  time_based: { label: 'Scheduled', icon: Calendar },
  event_based: { label: 'Event', icon: Zap },
};

const actionLabels: Record<ActionType, { label: string; icon: typeof MessageSquare }> = {
  send_message: { label: 'Send Message', icon: MessageSquare },
  create_task: { label: 'Create Task', icon: ListTodo },
  notify_staff: { label: 'Notify Staff', icon: Bell },
  webhook: { label: 'Webhook', icon: Webhook },
};

function getTriggerDescription(rule: AutomationRule): string {
  const config = rule.triggerConfig;
  if (rule.triggerType === 'time_based') {
    const type = config.type as string;
    const offsetDays = config.offsetDays as number | undefined;
    const time = config.time as string | undefined;

    const typeLabels: Record<string, string> = {
      before_arrival: 'Before arrival',
      after_arrival: 'After arrival',
      before_departure: 'Before departure',
      after_departure: 'After departure',
      scheduled: 'Scheduled',
    };

    let desc = typeLabels[type] || type;
    if (offsetDays !== undefined) {
      desc += ` (${Math.abs(offsetDays)} day${Math.abs(offsetDays) !== 1 ? 's' : ''})`;
    }
    if (time) {
      desc += ` at ${time}`;
    }
    return desc;
  } else {
    const eventType = config.eventType as string;
    const eventLabels: Record<string, string> = {
      'reservation.created': 'Reservation created',
      'reservation.updated': 'Reservation updated',
      'reservation.checked_in': 'Guest checked in',
      'reservation.checked_out': 'Guest checked out',
      'reservation.cancelled': 'Reservation cancelled',
      'conversation.started': 'Conversation started',
      'conversation.escalated': 'Conversation escalated',
      'task.created': 'Task created',
      'task.completed': 'Task completed',
    };
    return eventLabels[eventType] || eventType;
  }
}

function RuleCard({ rule, onToggle }: { rule: AutomationRule; onToggle: (enabled: boolean) => void }) {
  const TriggerIcon = triggerLabels[rule.triggerType]?.icon || Clock;
  const ActionIcon = actionLabels[rule.actionType]?.icon || Zap;

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
                    <Badge variant="error" className="shrink-0">Error</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {rule.description || getTriggerDescription(rule)}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ActionIcon className="w-3.5 h-3.5" />
                    {actionLabels[rule.actionType]?.label}
                  </span>
                  {rule.runCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Play className="w-3.5 h-3.5" />
                      {rule.runCount} run{rule.runCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {rule.lastRunAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Last: {new Date(rule.lastRunAt).toLocaleDateString()}
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
              aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
            />
            <Link to={`/settings/automations/${rule.id}`}>
              <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </Link>
          </div>
        </div>

        {rule.lastError && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {rule.lastError}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AutomationsPage() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | TriggerType>('all');
  const queryClient = useQueryClient();

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
          <Button size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Rule
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      {!isLoading && !error && (
        <StatsBar
          items={[
            { label: 'Active', value: stats.active, icon: Play, variant: 'success' },
            { label: 'Inactive', value: stats.inactive, icon: Pause, variant: 'warning' },
            { label: 'Errors', value: stats.errors, icon: AlertCircle, variant: 'error' },
            { label: 'Total', value: stats.total, icon: Zap, variant: 'default' },
          ]}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search automations..."
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            All
          </Button>
          <Button
            variant={filterType === 'time_based' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('time_based')}
          >
            <Calendar className="w-4 h-4 mr-1" />
            Scheduled
          </Button>
          <Button
            variant={filterType === 'event_based' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('event_based')}
          >
            <Zap className="w-4 h-4 mr-1" />
            Events
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Failed to load automations"
          description="Please try again later"
        />
      ) : filteredRules.length === 0 ? (
        rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No automation rules yet"
            description="Create your first rule to automate guest communication"
          >
            <Link to="/settings/automations/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Rule
              </Button>
            </Link>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Search}
            title="No rules found"
            description="Try a different search term or filter"
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
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
