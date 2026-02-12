import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  Zap,
  Eye,
  Check,
  RefreshCw,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PageContainer, EmptyState } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

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
  approval: number;
  urgent: number;
}

interface AutonomySettings {
  defaultLevel: AutonomyLevel;
  actions: Record<ActionType, ActionConfig>;
  confidenceThresholds: ConfidenceThresholds;
}

const levelIcons: Record<AutonomyLevel, typeof Shield> = {
  L1: Shield,
  L2: Zap,
};

const disabledActions: ActionType[] = ['issueRefund', 'offerDiscount', 'sendMarketingMessage'];

function LevelSelector({
  value,
  onChange,
  compact = false,
  t,
  disabled = false,
}: {
  value: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
  compact?: boolean;
  t: (key: string) => string;
  disabled?: boolean;
}) {
  const levels: AutonomyLevel[] = ['L1', 'L2'];

  return (
    <div className={cn('flex gap-2', compact && 'gap-1')}>
      {levels.map((level) => {
        const Icon = levelIcons[level];
        const isActive = value === level;

        return compact ? (
          <button
            key={level}
            onClick={() => !disabled && onChange(level)}
            disabled={disabled}
            className={cn(
              'px-2 py-1 text-xs rounded font-medium transition-colors',
              isActive
                ? level === 'L1'
                  ? 'bg-warning text-warning-foreground'
                  : 'bg-success text-success-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {level}
          </button>
        ) : (
          <button
            key={level}
            onClick={() => !disabled && onChange(level)}
            disabled={disabled}
            className={cn(
              'flex-1 p-4 rounded-lg border-2 transition-all text-start',
              isActive
                ? level === 'L1'
                  ? 'border-warning-border bg-warning'
                  : 'border-success-border bg-success'
                : 'border-border hover:border-border/80',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-5 h-5', isActive ? 'text-current' : 'text-muted-foreground')} />
              <span className="font-semibold">{level}</span>
              {isActive && <Check className="w-4 h-4 ms-auto" />}
            </div>
            <div className="text-sm font-medium">{t(`autonomy.levels.${level}.label`)}</div>
            <div className="text-xs text-muted-foreground mt-1">{t(`autonomy.levels.${level}.description`)}</div>
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
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
        className={cn(
          'w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function AutonomyPage() {
  const { t } = useTranslation();
  const { setActions } = usePageActions();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageSettings = can(PERMISSIONS.SETTINGS_MANAGE);
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

  const { mutate: save, isPending: isSaving } = saveMutation;
  const { mutate: reset, isPending: isResetting } = resetMutation;

  useEffect(() => {
    if (canManageSettings) {
      setActions([
        {
          id: 'reset',
          label: t('autonomy.resetToDefaults'),
          icon: RefreshCw,
          variant: 'outline',
          onClick: () => reset(),
          disabled: isResetting,
          loading: isResetting,
        },
        {
          id: 'save',
          label: t('autonomy.saveChanges'),
          onClick: () => settings && save(settings),
          disabled: !hasChanges,
          loading: isSaving,
        },
      ]);
    }
    return () => setActions([]);
  }, [setActions, t, hasChanges, settings, save, reset, isSaving, isResetting, canManageSettings]);

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
          title={t('autonomy.failedToLoad')}
          description={t('autonomy.tryAgainLater')}
        />
      </PageContainer>
    );
  }

  const actionTypes: ActionType[] = [
    'respondToGuest',
    'createHousekeepingTask',
    'createMaintenanceTask',
    'createConciergeTask',
    'createRoomServiceTask',
    'issueRefund',
    'offerDiscount',
    'sendMarketingMessage',
  ];

  return (
    <PageContainer>
      {/* Global Level */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('autonomy.globalLevel')}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('autonomy.globalLevelDesc')}
          </p>
          <LevelSelector
            value={settings.defaultLevel}
            onChange={(level) => updateSettings({ defaultLevel: level })}
            t={t}
            disabled={!canManageSettings}
          />
        </CardContent>
      </Card>

      {/* Per-Action Settings */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('autonomy.actionSettings')}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('autonomy.actionSettingsDesc')}
          </p>
          <div className="space-y-4">
            {actionTypes.map((actionType) => {
              const isDisabled = disabledActions.includes(actionType);
              const config = settings.actions[actionType];

              return (
                <div
                  key={actionType}
                  className={cn(
                    'flex items-center justify-between p-4 rounded-lg border',
                    isDisabled ? 'opacity-50' : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t(`autonomy.actions.${actionType}.label`)}</div>
                    <div className="text-sm text-muted-foreground">{t(`autonomy.actions.${actionType}.description`)}</div>
                  </div>
                  <div className="shrink-0">
                    {isDisabled ? (
                      <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded">
                        {t('autonomy.comingSoon')}
                      </span>
                    ) : (
                      <LevelSelector
                        value={config.level}
                        onChange={(level) => updateAction(actionType, { level })}
                        compact
                        t={t}
                        disabled={!canManageSettings}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Confidence Thresholds */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('autonomy.confidenceThresholds')}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('autonomy.confidenceThresholdsDesc')}
          </p>
          <div className="space-y-6">
            <ThresholdSlider
              label={t('autonomy.approvalThreshold')}
              value={settings.confidenceThresholds.approval}
              onChange={(value) =>
                updateSettings({
                  confidenceThresholds: { ...settings.confidenceThresholds, approval: value },
                })
              }
              description={t('autonomy.approvalThresholdDesc')}
              disabled={!canManageSettings}
            />
            <ThresholdSlider
              label={t('autonomy.urgentThreshold')}
              value={settings.confidenceThresholds.urgent}
              onChange={(value) =>
                updateSettings({
                  confidenceThresholds: { ...settings.confidenceThresholds, urgent: value },
                })
              }
              description={t('autonomy.urgentThresholdDesc')}
              disabled={!canManageSettings}
            />
          </div>
        </CardContent>
      </Card>

      {/* Financial Action Limits - Disabled until financial features are implemented */}
      <Card className="opacity-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('autonomy.financialLimits')}</h2>
            <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded ms-auto">
              {t('autonomy.comingSoon')}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('autonomy.financialLimitsDesc')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{t('autonomy.maxRefund')}</Label>
              <Input
                type="number"
                min="0"
                value={settings.actions.issueRefund.maxAutoAmount || 0}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                {t('autonomy.maxRefundDesc')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('autonomy.maxDiscount')}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={settings.actions.offerDiscount.maxAutoPercent || 0}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                {t('autonomy.maxDiscountDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </PageContainer>
  );
}
