import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Zap,
  Eye,
  Check,
  RefreshCw,
  AlertCircle,
  Settings2,
  Crown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { PageContainer, PageHeader, EmptyState } from '@/components';

type AutonomyLevel = 'L1' | 'L2';

type ActionType =
  | 'respondToGuest'
  | 'createHousekeepingTask'
  | 'createMaintenanceTask'
  | 'createConciergeTask'
  | 'createRoomServiceTask'
  | 'issueRefund'
  | 'offerDiscount'
  | 'sendMarketingMessage';

interface ActionConfig {
  level: AutonomyLevel;
  maxAutoAmount?: number;
  maxAutoPercent?: number;
}

interface ConfidenceThresholds {
  autoExecute: number;
  suggestToStaff: number;
  escalate: number;
}

interface VIPOverrides {
  alwaysEscalateComplaints: boolean;
  requireApprovalForOffers: boolean;
  elevateTaskPriority: boolean;
}

interface AutonomySettings {
  defaultLevel: AutonomyLevel;
  actions: Record<ActionType, ActionConfig>;
  confidenceThresholds: ConfidenceThresholds;
  vipOverrides: VIPOverrides;
}

const levelInfo: Record<AutonomyLevel, { label: string; description: string; icon: typeof Shield }> = {
  L1: {
    label: 'Approval Required',
    description: 'All actions require staff approval before execution',
    icon: Shield,
  },
  L2: {
    label: 'Auto-Execute',
    description: 'Actions run automatically without approval',
    icon: Zap,
  },
};

const actionLabels: Record<ActionType, { label: string; description: string }> = {
  respondToGuest: { label: 'Respond to Guest', description: 'Send AI-generated messages' },
  createHousekeepingTask: { label: 'Housekeeping Tasks', description: 'Create cleaning requests' },
  createMaintenanceTask: { label: 'Maintenance Tasks', description: 'Create repair requests' },
  createConciergeTask: { label: 'Concierge Tasks', description: 'Create service requests' },
  createRoomServiceTask: { label: 'Room Service Tasks', description: 'Create room service orders' },
  issueRefund: { label: 'Issue Refunds', description: 'Process guest refunds' },
  offerDiscount: { label: 'Offer Discounts', description: 'Send promotional offers' },
  sendMarketingMessage: { label: 'Marketing Messages', description: 'Send marketing communications' },
};

function LevelSelector({
  value,
  onChange,
  compact = false,
}: {
  value: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
  compact?: boolean;
}) {
  const levels: AutonomyLevel[] = ['L1', 'L2'];

  return (
    <div className={cn('flex gap-2', compact && 'gap-1')}>
      {levels.map((level) => {
        const info = levelInfo[level];
        const Icon = info.icon;
        const isActive = value === level;

        return compact ? (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              'px-2 py-1 text-xs rounded font-medium transition-colors',
              isActive
                ? level === 'L1'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {level}
          </button>
        ) : (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              'flex-1 p-4 rounded-lg border-2 transition-all text-left',
              isActive
                ? level === 'L1'
                  ? 'border-yellow-500 bg-yellow-50'
                  : 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-5 h-5', isActive ? 'text-current' : 'text-gray-400')} />
              <span className="font-semibold">{level}</span>
              {isActive && <Check className="w-4 h-4 ml-auto" />}
            </div>
            <div className="text-sm font-medium">{info.label}</div>
            <div className="text-xs text-gray-600 mt-1">{info.description}</div>
          </button>
        );
      })}
    </div>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
}

export function AutonomyPage() {
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['autonomy-settings'],
    queryFn: () => api.get<{ settings: AutonomySettings }>('/settings/autonomy'),
  });

  const [localSettings, setLocalSettings] = useState<AutonomySettings | null>(null);

  // Initialize local settings when data loads
  const settings = localSettings || data?.settings;

  const updateSettings = (updates: Partial<AutonomySettings>) => {
    if (!settings) return;
    const newSettings = { ...settings, ...updates };
    setLocalSettings(newSettings);
    setHasChanges(true);
  };

  const updateAction = (actionType: ActionType, updates: Partial<ActionConfig>) => {
    if (!settings) return;
    const newActions = {
      ...settings.actions,
      [actionType]: { ...settings.actions[actionType], ...updates },
    };
    updateSettings({ actions: newActions });
  };

  const saveMutation = useMutation({
    mutationFn: (newSettings: AutonomySettings) =>
      api.put<{ settings: AutonomySettings }>('/settings/autonomy', newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy-settings'] });
      setHasChanges(false);
      setLocalSettings(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post<{ settings: AutonomySettings }>('/settings/autonomy/reset', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy-settings'] });
      setHasChanges(false);
      setLocalSettings(null);
    },
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  if (error || !settings) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="Failed to load autonomy settings"
          description="Please try again later"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', resetMutation.isPending && 'animate-spin')} />
          Reset to Defaults
        </Button>
        <Button
          size="sm"
          className="bg-gray-900 hover:bg-gray-800"
          onClick={() => settings && saveMutation.mutate(settings)}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </PageHeader>

      {/* Global Level */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Global Autonomy Level</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Set the default behavior for all actions. Individual actions can override this.
          </p>
          <LevelSelector
            value={settings.defaultLevel}
            onChange={(level) => updateSettings({ defaultLevel: level })}
          />
        </CardContent>
      </Card>

      {/* Per-Action Settings */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Action-Specific Settings</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Configure autonomy levels for each action type.
          </p>
          <div className="space-y-4">
            {(Object.keys(actionLabels) as ActionType[]).map((actionType) => {
              const action = actionLabels[actionType];
              const config = settings.actions[actionType];

              return (
                <div
                  key={actionType}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{action.label}</div>
                    <div className="text-sm text-gray-500">{action.description}</div>
                  </div>
                  <div className="shrink-0">
                    <LevelSelector
                      value={config.level}
                      onChange={(level) => updateAction(actionType, { level })}
                      compact
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Financial Action Limits */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Financial Action Limits</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Set maximum amounts that can be auto-approved without staff review.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Max Auto-Refund Amount ($)</Label>
              <Input
                type="number"
                min="0"
                value={settings.actions.issueRefund.maxAutoAmount || 0}
                onChange={(e) =>
                  updateAction('issueRefund', { maxAutoAmount: Number(e.target.value) })
                }
              />
              <p className="text-xs text-gray-500">
                Refunds above this amount require approval
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max Auto-Discount (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={settings.actions.offerDiscount.maxAutoPercent || 0}
                onChange={(e) =>
                  updateAction('offerDiscount', { maxAutoPercent: Number(e.target.value) })
                }
              />
              <p className="text-xs text-gray-500">
                Discounts above this percentage require approval
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confidence Thresholds */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Confidence Thresholds</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Control how AI confidence scores affect autonomy decisions.
          </p>
          <div className="space-y-6">
            <ThresholdSlider
              label="Auto-Execute Threshold"
              value={settings.confidenceThresholds.autoExecute}
              onChange={(value) =>
                updateSettings({
                  confidenceThresholds: { ...settings.confidenceThresholds, autoExecute: value },
                })
              }
              description="AI must be this confident to auto-execute actions"
            />
            <ThresholdSlider
              label="Suggest to Staff Threshold"
              value={settings.confidenceThresholds.suggestToStaff}
              onChange={(value) =>
                updateSettings({
                  confidenceThresholds: { ...settings.confidenceThresholds, suggestToStaff: value },
                })
              }
              description="Responses below this confidence are suggested for staff review"
            />
            <ThresholdSlider
              label="Escalation Threshold"
              value={settings.confidenceThresholds.escalate}
              onChange={(value) =>
                updateSettings({
                  confidenceThresholds: { ...settings.confidenceThresholds, escalate: value },
                })
              }
              description="Responses below this confidence trigger automatic escalation"
            />
          </div>
        </CardContent>
      </Card>

      {/* VIP Overrides */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">VIP Guest Overrides</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Special handling rules for VIP guests.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <div className="font-medium">Always Escalate Complaints</div>
                <div className="text-sm text-gray-500">
                  Automatically escalate negative feedback from VIP guests
                </div>
              </div>
              <Switch
                checked={settings.vipOverrides.alwaysEscalateComplaints}
                onCheckedChange={(checked) =>
                  updateSettings({
                    vipOverrides: { ...settings.vipOverrides, alwaysEscalateComplaints: checked },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <div className="font-medium">Require Approval for Offers</div>
                <div className="text-sm text-gray-500">
                  Require staff approval for discounts/refunds to VIP guests
                </div>
              </div>
              <Switch
                checked={settings.vipOverrides.requireApprovalForOffers}
                onCheckedChange={(checked) =>
                  updateSettings({
                    vipOverrides: { ...settings.vipOverrides, requireApprovalForOffers: checked },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <div className="font-medium">Elevate Task Priority</div>
                <div className="text-sm text-gray-500">
                  Automatically increase priority for VIP guest requests
                </div>
              </div>
              <Switch
                checked={settings.vipOverrides.elevateTaskPriority}
                onCheckedChange={(checked) =>
                  updateSettings({
                    vipOverrides: { ...settings.vipOverrides, elevateTaskPriority: checked },
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
