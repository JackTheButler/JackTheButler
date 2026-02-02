import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
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

const triggerTypes: { value: TriggerType; label: string; icon: typeof Clock }[] = [
  { value: 'time_based', label: 'Scheduled', icon: Calendar },
  { value: 'event_based', label: 'Event-Based', icon: Zap },
];

const actionTypes: { value: ActionType; label: string; icon: typeof MessageSquare; description: string }[] = [
  { value: 'send_message', label: 'Send Message', icon: MessageSquare, description: 'Send a message to the guest' },
  { value: 'create_task', label: 'Create Task', icon: ListTodo, description: 'Create a task for staff' },
  { value: 'notify_staff', label: 'Notify Staff', icon: Bell, description: 'Send a notification to staff' },
  { value: 'webhook', label: 'Webhook', icon: Webhook, description: 'Call an external URL' },
];

const timeBasedTypes = [
  { value: 'before_arrival', label: 'Before Arrival' },
  { value: 'after_arrival', label: 'After Arrival' },
  { value: 'before_departure', label: 'Before Departure' },
  { value: 'after_departure', label: 'After Departure' },
];

const eventTypes = [
  { value: 'reservation.created', label: 'Reservation Created' },
  { value: 'reservation.updated', label: 'Reservation Updated' },
  { value: 'reservation.checked_in', label: 'Guest Checked In' },
  { value: 'reservation.checked_out', label: 'Guest Checked Out' },
  { value: 'reservation.cancelled', label: 'Reservation Cancelled' },
  { value: 'conversation.started', label: 'Conversation Started' },
  { value: 'conversation.escalated', label: 'Conversation Escalated' },
  { value: 'task.created', label: 'Task Created' },
  { value: 'task.completed', label: 'Task Completed' },
];

const channels = [
  { value: 'preferred', label: 'Guest Preferred' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

const departments = [
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'f_and_b', label: 'Food & Beverage' },
];

const priorities = [
  { value: 'low', label: 'Low' },
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function AutomationEditPage() {
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
      setTestResult({ success: false, message: 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this automation rule?')) {
      deleteMutation.mutate();
    }
  };

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
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? 'New Automation' : name || 'Edit Automation'}
            </h1>
            {!isNew && ruleData && (
              <p className="text-sm text-muted-foreground">
                Created {new Date(ruleData.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Test
            </Button>
          )}
          <Button onClick={handleSave} disabled={saveMutation.isPending || !name}>
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
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
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pre-Arrival Welcome"
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <Label>Enabled</Label>
                <p className="text-sm text-muted-foreground">Rule will run when enabled</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this automation does"
            />
          </div>
        </CardContent>
      </Card>

      {/* Trigger Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
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
                <Label>Timing</Label>
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
                <Label>Days Offset</Label>
                <Input
                  type="number"
                  min={0}
                  value={(triggerConfig.offsetDays as number) || 0}
                  onChange={(e) => updateTriggerConfig('offsetDays', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={(triggerConfig.time as string) || '09:00'}
                  onChange={(e) => updateTriggerConfig('time', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-4">
              <Label>Event</Label>
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
          <CardTitle>Action</CardTitle>
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
                  <Label>Template</Label>
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
                  <Label>Channel</Label>
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
                    <Label>Department</Label>
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
                    <Label>Priority</Label>
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
                  <Label>Task Description</Label>
                  <Input
                    value={(actionConfig.description as string) || ''}
                    onChange={(e) => updateActionConfig('description', e.target.value)}
                    placeholder="e.g., Follow up with guest {{firstName}}"
                  />
                </div>
              </>
            )}

            {actionType === 'notify_staff' && (
              <>
                <div className="space-y-2">
                  <Label>Staff Role</Label>
                  <Input
                    value={(actionConfig.role as string) || ''}
                    onChange={(e) => updateActionConfig('role', e.target.value)}
                    placeholder="e.g., manager, front_desk"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Input
                    value={(actionConfig.message as string) || ''}
                    onChange={(e) => updateActionConfig('message', e.target.value)}
                    placeholder="e.g., VIP guest {{firstName}} has checked in"
                  />
                </div>
              </>
            )}

            {actionType === 'webhook' && (
              <>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    type="url"
                    value={(actionConfig.url as string) || ''}
                    onChange={(e) => updateActionConfig('url', e.target.value)}
                    placeholder="https://example.com/webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
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
            <CardTitle>Recent Activity</CardTitle>
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
                        {log.status === 'success' ? 'Executed successfully' : 'Execution failed'}
                      </p>
                      {log.errorMessage && (
                        <p className="text-xs text-red-600">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{new Date(log.createdAt).toLocaleString()}</p>
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
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete this automation</p>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
