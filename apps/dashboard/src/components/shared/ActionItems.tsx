import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { useSystemStatus, type SystemIssue, type CompletedStep } from '@/hooks/useSystemStatus';
import { useDismissible } from '@/hooks/useDismissible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Severity styling config
 */
const severityConfig = {
  critical: {
    icon: AlertCircle,
    containerClass: 'bg-error border-error-border',
    iconClass: 'text-error-foreground',
    descClass: 'text-error-foreground',
  },
};

/**
 * Issue types that have translations
 */
const issueTypes = [
  'no_completion_provider',
  'no_embedding_provider',
  'using_local_completion',
  'no_channels',
  'empty_knowledge_base',
  'needs_reindex',
] as const;

/**
 * Completed step types that have translations
 */
const completedStepTypes = [
  'completion_provider_configured',
  'embedding_provider_configured',
  'channels_configured',
  'knowledge_base_populated',
] as const;

/**
 * Completed step row
 */
function CompletedStepRow({ step }: { step: CompletedStep }) {
  const { t } = useTranslation();
  const title = completedStepTypes.includes(step.type as typeof completedStepTypes[number])
    ? t(`home.completed.${step.type}`)
    : step.message;

  return (
    <div className="flex gap-4 py-3 border-b last:border-b-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-success flex items-center justify-center">
        <Check className="h-4 w-4 text-success-foreground" />
      </div>
      <div className="flex-1 min-w-0 flex items-center">
        <h3 className="font-medium text-muted-foreground">{title}</h3>
      </div>
    </div>
  );
}

/**
 * Route overrides for specific issue types
 */
const routeOverrides: Record<string, string> = {
  no_embedding_provider: '/engine/apps/ai?provider=local',
};

/**
 * Pending setup step
 */
function PendingStepRow({ issue, step, disabled }: { issue: SystemIssue; step: number; disabled?: boolean }) {
  const { t } = useTranslation();
  const hasTranslation = issueTypes.includes(issue.type as typeof issueTypes[number]);
  const title = hasTranslation ? t(`home.issues.${issue.type}.title`) : issue.message;
  const description = hasTranslation ? t(`home.issues.${issue.type}.description`) : '';
  const actionLabel = hasTranslation ? t(`home.actions.${issue.type}`) : issue.action?.label;
  const route = routeOverrides[issue.type] || issue.action?.route;

  return (
    <div className="flex gap-4 py-4 border-b last:border-b-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-info flex items-center justify-center text-sm font-medium text-info-foreground">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        {route && !disabled && (
          <Link to={route} className="inline-block mt-3">
            <Button size="sm">
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5 ms-1.5 rtl:rotate-180" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

interface ActionItemsProps {
  /** Show the card regardless of dismissed state (for settings page) */
  showAlways?: boolean;
  /** Render without card border (for settings page) */
  borderless?: boolean;
  /** Disable action buttons (for users without manage permission) */
  disabled?: boolean;
}

/**
 * Onboarding checklist for the dashboard
 * Shows completed steps and remaining setup tasks
 */
export function ActionItems({ showAlways = false, borderless = false, disabled = false }: ActionItemsProps) {
  const { t } = useTranslation();
  const { issues, completedSteps, isLoading } = useSystemStatus();
  const { isDismissed, dismiss, canDismiss } = useDismissible(
    'getting-started',
    issues.length === 0,  // can only dismiss when no issues
    issues.length > 0     // reset if issues come back
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-48 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  // No items at all - don't show anything (unless showAlways)
  if (!showAlways && issues.length === 0 && completedSteps.length === 0) {
    return null;
  }

  // User dismissed and no issues - don't show (unless showAlways)
  if (!showAlways && isDismissed && issues.length === 0) {
    return null;
  }

  // Sort issues: critical first, then warning, then info
  const sortedIssues = [...issues].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const totalSteps = completedSteps.length + sortedIssues.length;
  const completedCount = completedSteps.length;

  const Wrapper = borderless ? 'div' : Card;
  const Header = borderless ? 'div' : CardHeader;
  const Content = borderless ? 'div' : CardContent;

  return (
    <Wrapper>
      <Header className="relative">
        {canDismiss && !showAlways && (
          <button
            onClick={dismiss}
            className="absolute top-4 end-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {borderless ? (
          <h3 className="text-base font-semibold">{t('home.gettingStarted')}</h3>
        ) : (
          <CardTitle>{t('home.gettingStarted')}</CardTitle>
        )}
        {borderless ? (
          <p className="text-sm text-muted-foreground mt-1">
            {t('home.stepsCompleted', { completed: completedCount, total: totalSteps })}
          </p>
        ) : (
          <CardDescription>
            {t('home.stepsCompleted', { completed: completedCount, total: totalSteps })}
          </CardDescription>
        )}
      </Header>
      <Content className={borderless ? 'mt-4' : 'pt-0'}>
        {/* Completed steps first */}
        {completedSteps.map((step) => (
          <CompletedStepRow key={step.type} step={step} />
        ))}
        {/* Then pending steps */}
        {sortedIssues.map((issue, index) => (
          <PendingStepRow key={issue.type} issue={issue} step={completedSteps.length + index + 1} disabled={disabled} />
        ))}
      </Content>
    </Wrapper>
  );
}

/**
 * Compact version for showing in page headers
 */
export function ActionItemsBanner() {
  const { criticalIssues } = useSystemStatus();

  if (criticalIssues.length === 0) {
    return null;
  }

  const issue = criticalIssues[0];
  const config = severityConfig.critical;
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3 mb-4', config.containerClass)}>
      <Icon className={cn('h-4 w-4 flex-shrink-0', config.iconClass)} />
      <p className={cn('flex-1 text-sm', config.descClass)}>{issue.message}</p>
      {issue.action && (
        <Link
          to={issue.action.route}
          className="text-sm font-medium text-error-foreground hover:opacity-80 flex items-center gap-1"
        >
          {issue.action.label}
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}
