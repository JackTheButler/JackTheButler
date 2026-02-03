import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import {
  ArrowLeft,
  Save,
  Trash2,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  MessageSquare,
  ListTodo,
  Bell,
  Webhook,
  Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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

interface LogEntry {
  id: string;
  status: 'success' | 'failed';
  triggerData: Record<string, unknown> | null;
  actionResult: Record<string, unknown> | null;
  errorMessage: string | null;
  executionTimeMs: number | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
}

const getTriggerTypes = (t: (key: string) => string): { value: TriggerType; label: string; icon: typeof Clock }[] => [
  { value: 'time_based', label: t('automationEdit.triggerTypes.scheduled'), icon: Calendar },
  { value: 'event_based', label: t('automationEdit.triggerTypes.eventBased'), icon: Zap },
];

const getActionTypes = (t: (key: string) => string): { value: ActionType; label: string; icon: typeof MessageSquare; description: string }[] => [
  { value: 'send_message', label: t('automationEdit.actionTypes.sendMessage'), icon: MessageSquare, description: t('automationEdit.actionTypes.sendMessageDesc') },
  { value: 'create_task', label: t('automationEdit.actionTypes.createTask'), icon: ListTodo, description: t('automationEdit.actionTypes.createTaskDesc') },
  { value: 'notify_staff', label: t('automationEdit.actionTypes.notifyStaff'), icon: Bell, description: t('automationEdit.actionTypes.notifyStaffDesc') },
  { value: 'webhook', label: t('automationEdit.actionTypes.webhook'), icon: Webhook, description: t('automationEdit.actionTypes.webhookDesc') },
];

const getTimeBasedTypes = (t: (key: string) => string) => [
  { value: 'before_arrival', label: t('automations.triggers.beforeArrival') },
  { value: 'after_arrival', label: t('automations.triggers.afterArrival') },
  { value: 'before_departure', label: t('automations.triggers.beforeDeparture') },
  { value: 'after_departure', label: t('automations.triggers.afterDeparture') },
];

const getEventTypes = (t: (key: string) => string) => [
  { value: 'reservation.created', label: t('automations.events.reservationCreated') },
  { value: 'reservation.updated', label: t('automations.events.reservationUpdated') },
  { value: 'reservation.checked_in', label: t('automations.events.checkedIn') },
  { value: 'reservation.checked_out', label: t('automations.events.checkedOut') },
  { value: 'reservation.cancelled', label: t('automations.events.reservationCancelled') },
  { value: 'conversation.started', label: t('automations.events.conversationStarted') },
  { value: 'conversation.escalated', label: t('automations.events.conversationEscalated') },
  { value: 'task.created', label: t('automations.events.taskCreated') },
  { value: 'task.completed', label: t('automations.events.taskCompleted') },
];

const getChannels = (t: (key: string) => string) => [
  { value: 'preferred', label: t('automationEdit.channels.preferred') },
  { value: 'sms', label: t('automationEdit.channels.sms') },
  { value: 'whatsapp', label: t('automationEdit.channels.whatsapp') },
  { value: 'email', label: t('automationEdit.channels.email') },
];

const getDepartments = (t: (key: string) => string) => [
  { value: 'front_desk', label: t('automationEdit.departments.frontDesk') },
  { value: 'housekeeping', label: t('automationEdit.departments.housekeeping') },
  { value: 'maintenance', label: t('automationEdit.departments.maintenance') },
  { value: 'concierge', label: t('automationEdit.departments.concierge') },
  { value: 'f_and_b', label: t('automationEdit.departments.fAndB') },
];

const getPriorities = (t: (key: string) => string) => [
  { value: 'low', label: t('automationEdit.priorities.low') },
  { value: 'standard', label: t('automationEdit.priorities.standard') },
  { value: 'high', label: t('automationEdit.priorities.high') },
  { value: 'urgent', label: t('automationEdit.priorities.urgent') },
];

export function AutomationEditPage() {
  const { t } = useTranslation();
  const { ruleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = ruleId === 'new';

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('time_based');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({
    type: 'before_arrival',
    offsetDays: 3,
    time: '09:00',
  });
  const [actionType, setActionType] = useState<ActionType>('send_message');
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>({
    template: 'pre_arrival_welcome',
    channel: 'preferred',
  });
  const [enabled, setEnabled] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch rule data
  const { data: ruleData, isLoading: ruleLoading } = useQuery({
    queryKey: ['automation-rule', ruleId],
    queryFn: () => api.get<AutomationRule>(`/automation/rules/${ruleId}`),
    enabled: !isNew,
  });

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['automation-templates'],
    queryFn: () => api.get<{ templates: Template[] }>('/automation/templates'),
  });

  // Fetch logs
  const { data: logsData } = useQuery({
    queryKey: ['automation-logs', ruleId],
    queryFn: () => api.get<{ logs: LogEntry[] }>(`/automation/rules/${ruleId}/logs?limit=10`),
    enabled: !isNew,
  });

  // Initialize form when data loads
  useEffect(() => {
    if (ruleData) {
      setName(ruleData.name);
      setDescription(ruleData.description || '');
      setTriggerType(ruleData.triggerType);
      setTriggerConfig(ruleData.triggerConfig);
      setActionType(ruleData.actionType);
      setActionConfig(ruleData.actionConfig);
      setEnabled(ruleData.enabled);
    }
  }, [ruleData]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (isNew) {
        return api.post<AutomationRule>('/automation/rules', data);
      }
      return api.put<AutomationRule>(`/automation/rules/${ruleId}`, data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      if (isNew && result?.id) {
        navigate(`/settings/automations/${result.id}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/automation/rules/${ruleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      navigate('/settings/automations');
    },
  });

  const handleSave = () => {
    const data = {
      name,
      description: description || undefined,
      triggerType,
      triggerConfig,
      actionType,
      actionConfig,
      enabled,
    };
    saveMutation.mutate(data);
  };

  const handleTest = async () => {
    if (isNew) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<{ success: boolean; message: string }>(
        `/automation/rules/${ruleId}/test`,
        {}
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, message: t('automationEdit.testFailed') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(t('automationEdit.deleteConfirm'))) {
      deleteMutation.mutate();
    }
  };

  const triggerTypes = getTriggerTypes(t);
  const actionTypes = getActionTypes(t);
  const timeBasedTypes = getTimeBasedTypes(t);
  const eventTypes = getEventTypes(t);
  const channels = getChannels(t);
  const departments = getDepartments(t);
  const priorities = getPriorities(t);

  const updateTriggerConfig = (key: string, value: unknown) => {
    setTriggerConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateActionConfig = (key: string, value: unknown) => {
    setActionConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Reset trigger config when type changes
  useEffect(() => {
    if (triggerType === 'time_based') {
      setTriggerConfig({ type: 'before_arrival', offsetDays: 3, time: '09:00' });
    } else {
      setTriggerConfig({ eventType: 'reservation.checked_in' });
    }
  }, [triggerType]);

  // Reset action config when type changes
  useEffect(() => {
    if (actionType === 'send_message') {
      setActionConfig({ template: 'pre_arrival_welcome', channel: 'preferred' });
    } else if (actionType === 'create_task') {
      setActionConfig({ type: 'follow_up', department: 'front_desk', description: '', priority: 'standard' });
    } else if (actionType === 'notify_staff') {
      setActionConfig({ role: 'manager', message: '' });
    } else {
      setActionConfig({ url: '', method: 'POST' });
    }
  }, [actionType]);

  if (ruleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const templates = templatesData?.templates || [];
  const logs = logsData?.logs || [];

  return (
    <div className="p-6  space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/settings/automations">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('automationEdit.back')}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? t('automationEdit.newAutomation') : name || t('automationEdit.editAutomation')}
            </h1>
            {!isNew && ruleData && (
              <p className="text-sm text-muted-foreground">
                Created {formatDate(ruleData.createdAt)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {t('automationEdit.test')}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saveMutation.isPending || !name}>
            {saveMutation.isPending ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t('common.save')}
          </Button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={cn(
            'p-4 rounded-lg border flex items-center gap-3',
            testResult.success
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {testResult.message}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('automationEdit.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('automationEdit.nameRequired')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('automationEdit.namePlaceholder')}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <Label>{t('automationEdit.enabled')}</Label>
                <p className="text-sm text-muted-foreground">{t('automationEdit.enabledDesc')}</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t('automationEdit.description')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('automationEdit.descriptionPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Trigger Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('automationEdit.trigger')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trigger Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            {triggerTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setTriggerType(type.value)}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    triggerType === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <Icon className={cn('w-5 h-5 mb-2', triggerType === type.value && 'text-primary')} />
                  <p className="font-medium">{type.label}</p>
                </button>
              );
            })}
          </div>

          {/* Trigger Config */}
          {triggerType === 'time_based' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="space-y-2">
                <Label>{t('automationEdit.timing')}</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={(triggerConfig.type as string) || 'before_arrival'}
                  onChange={(e) => updateTriggerConfig('type', e.target.value)}
                >
                  {timeBasedTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('automationEdit.daysOffset')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={(triggerConfig.offsetDays as number) || 0}
                  onChange={(e) => updateTriggerConfig('offsetDays', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.time')}</Label>
                <Input
                  type="time"
                  value={(triggerConfig.time as string) || '09:00'}
                  onChange={(e) => updateTriggerConfig('time', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-4">
              <Label>{t('automationEdit.event')}</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={(triggerConfig.eventType as string) || 'reservation.checked_in'}
                onChange={(e) => updateTriggerConfig('eventType', e.target.value)}
              >
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('automationEdit.action')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Type Selection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actionTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setActionType(type.value)}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    actionType === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <Icon className={cn('w-5 h-5 mb-2', actionType === type.value && 'text-primary')} />
                  <p className="font-medium text-sm">{type.label}</p>
                </button>
              );
            })}
          </div>

          {/* Action Config */}
          <div className="pt-4 space-y-4">
            {actionType === 'send_message' && (
              <>
                <div className="space-y-2">
                  <Label>{t('automationEdit.template')}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={(actionConfig.template as string) || ''}
                    onChange={(e) => updateActionConfig('template', e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('automationEdit.channel')}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={(actionConfig.channel as string) || 'preferred'}
                    onChange={(e) => updateActionConfig('channel', e.target.value)}
                  >
                    {channels.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {actionType === 'create_task' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('automationEdit.department')}</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={(actionConfig.department as string) || 'front_desk'}
                      onChange={(e) => updateActionConfig('department', e.target.value)}
                    >
                      {departments.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('automationEdit.priority')}</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={(actionConfig.priority as string) || 'standard'}
                      onChange={(e) => updateActionConfig('priority', e.target.value)}
                    >
                      {priorities.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('automationEdit.taskDescription')}</Label>
                  <Input
                    value={(actionConfig.description as string) || ''}
                    onChange={(e) => updateActionConfig('description', e.target.value)}
                    placeholder={t('automationEdit.taskDescPlaceholder')}
                  />
                </div>
              </>
            )}

            {actionType === 'notify_staff' && (
              <>
                <div className="space-y-2">
                  <Label>{t('automationEdit.staffRole')}</Label>
                  <Input
                    value={(actionConfig.role as string) || ''}
                    onChange={(e) => updateActionConfig('role', e.target.value)}
                    placeholder={t('automationEdit.staffRolePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('automationEdit.message')}</Label>
                  <Input
                    value={(actionConfig.message as string) || ''}
                    onChange={(e) => updateActionConfig('message', e.target.value)}
                    placeholder={t('automationEdit.messagePlaceholder')}
                  />
                </div>
              </>
            )}

            {actionType === 'webhook' && (
              <>
                <div className="space-y-2">
                  <Label>{t('automationEdit.url')}</Label>
                  <Input
                    type="url"
                    value={(actionConfig.url as string) || ''}
                    onChange={(e) => updateActionConfig('url', e.target.value)}
                    placeholder={t('automationEdit.urlPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('automationEdit.method')}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={(actionConfig.method as string) || 'POST'}
                    onChange={(e) => updateActionConfig('method', e.target.value)}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity Logs */}
      {!isNew && logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('automationEdit.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {log.status === 'success' ? t('automationEdit.executedSuccess') : t('automationEdit.executionFailed')}
                      </p>
                      {log.errorMessage && (
                        <p className="text-xs text-red-600">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{formatDateTime(log.createdAt)}</p>
                    {log.executionTimeMs && <p className="text-xs">{log.executionTimeMs}ms</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {!isNew && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">{t('automationEdit.dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('automationEdit.deleteAutomation')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('automationEdit.cannotBeUndone')}
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {t('common.delete')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
