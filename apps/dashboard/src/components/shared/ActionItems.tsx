import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check } from 'lucide-react';
import { useSystemStatus, type SystemIssue, type CompletedStep } from '@/hooks/useSystemStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Severity styling config
 */
const severityConfig = {
  critical: {
    icon: AlertCircle,
    containerClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-600',
    descClass: 'text-red-800',
  },
};

/**
 * Extended information for each issue type
 */
const issueDetails: Record<string, { title: string; description: string }> = {
  no_completion_provider: {
    title: 'Configure AI Provider',
    description: 'Connect an AI provider to enable guest conversations. Choose from Anthropic Claude, OpenAI, or run locally with Local AI.',
  },
  no_embedding_provider: {
    title: 'Enable Knowledge Search',
    description: 'Set up embeddings to power intelligent knowledge base search. Use Local AI (free & private) or OpenAI for faster performance.',
  },
  using_local_completion: {
    title: 'Upgrade AI Provider',
    description: 'Local AI is active but cloud providers offer faster responses and better quality. Consider adding Anthropic or OpenAI.',
  },
  no_channels: {
    title: 'Connect Messaging Channels',
    description: 'Set up WhatsApp, SMS, or Email to start receiving and responding to guest messages.',
  },
  empty_knowledge_base: {
    title: 'Build Your Knowledge Base',
    description: 'Scrape your hotel website to automatically import FAQs, amenities, policies, and other information that helps the AI answer guest questions.',
  },
};

/**
 * Titles for completed steps
 */
const completedStepTitles: Record<string, string> = {
  completion_provider_configured: 'AI Provider Configured',
  embedding_provider_configured: 'Knowledge Search Enabled',
  channels_configured: 'Messaging Channels Connected',
  knowledge_base_populated: 'Knowledge Base Ready',
};

/**
 * Completed step row
 */
function CompletedStepRow({ step }: { step: CompletedStep }) {
  const title = completedStepTitles[step.type] || step.message;

  return (
    <div className="flex gap-4 py-3 border-b last:border-b-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
        <Check className="h-4 w-4 text-green-600" />
      </div>
      <div className="flex-1 min-w-0 flex items-center">
        <h3 className="font-medium text-muted-foreground">{title}</h3>
      </div>
    </div>
  );
}

/**
 * Pending setup step
 */
function PendingStepRow({ issue, step }: { issue: SystemIssue; step: number }) {
  const details = issueDetails[issue.type] || { title: issue.message, description: '' };

  return (
    <div className="flex gap-4 py-4 border-b last:border-b-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground">{details.title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{details.description}</p>
        {issue.action && (
          <Link to={issue.action.route} className="inline-block mt-3">
            <Button size="sm">
              {issue.action.label}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Onboarding checklist for the dashboard
 * Shows completed steps and remaining setup tasks
 */
export function ActionItems() {
  const { issues, completedSteps, isLoading } = useSystemStatus();

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

  // No items at all - don't show anything
  if (issues.length === 0 && completedSteps.length === 0) {
    return null;
  }

  // Sort issues: critical first, then warning, then info
  const sortedIssues = [...issues].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const totalSteps = completedSteps.length + sortedIssues.length;
  const completedCount = completedSteps.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting Started</CardTitle>
        <CardDescription>
          {completedCount} of {totalSteps} steps completed
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Completed steps first */}
        {completedSteps.map((step) => (
          <CompletedStepRow key={step.type} step={step} />
        ))}
        {/* Then pending steps */}
        {sortedIssues.map((issue, index) => (
          <PendingStepRow key={issue.type} issue={issue} step={completedSteps.length + index + 1} />
        ))}
      </CardContent>
    </Card>
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
          className="text-sm font-medium text-red-700 hover:text-red-900 flex items-center gap-1"
        >
          {issue.action.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
