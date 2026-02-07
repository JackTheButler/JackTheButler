/**
 * Assistant Trigger Component
 *
 * Button to open an assistant with optional badge.
 *
 * @module shared/assistant/components/AssistantTrigger
 */

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAssistant } from '../context';
import { assistantRegistry } from '../registry';

/**
 * Props for AssistantTrigger
 */
export interface AssistantTriggerProps {
  /** ID of the assistant to open */
  assistantId: string;

  /** Initial context to pass when opening */
  initialContext?: Record<string, unknown>;

  /** Button variant */
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';

  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';

  /** Custom button label (defaults to assistant name) */
  label?: string;

  /** Custom icon */
  icon?: React.ReactNode;

  /** Show icon only (no label) */
  iconOnly?: boolean;

  /** Badge count */
  badgeCount?: number;

  /** Whether the trigger is disabled */
  disabled?: boolean;

  /** Additional CSS class */
  className?: string;
}

/**
 * Button that opens a specific assistant
 */
export function AssistantTrigger({
  assistantId,
  initialContext,
  variant = 'default',
  size = 'default',
  label,
  icon,
  iconOnly = false,
  badgeCount,
  disabled = false,
  className,
}: AssistantTriggerProps) {
  const { open } = useAssistant();

  const assistant = assistantRegistry.get(assistantId);
  if (!assistant) {
    console.warn(`AssistantTrigger: Assistant "${assistantId}" not found in registry`);
    return null;
  }

  const displayLabel = label || assistant.name;
  const displayIcon = icon || <Sparkles className="h-4 w-4" />;

  const handleClick = () => {
    open(assistantId, initialContext);
  };

  return (
    <Button
      variant={variant}
      size={iconOnly ? 'icon' : size}
      onClick={handleClick}
      disabled={disabled}
      className={cn('relative', className)}
    >
      {displayIcon}
      {!iconOnly && <span className="ml-2">{displayLabel}</span>}

      {/* Badge */}
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5',
            'min-w-4 h-4 px-1',
            'flex items-center justify-center',
            'text-[10px] font-medium',
            'bg-destructive text-destructive-foreground',
            'rounded-full'
          )}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </Button>
  );
}

/**
 * Suggestion chip for assistants
 */
export interface AssistantSuggestionProps {
  /** ID of the assistant to suggest */
  assistantId: string;

  /** Message to show */
  message?: string;

  /** Called when dismissed */
  onDismiss?: () => void;

  /** Additional CSS class */
  className?: string;
}

/**
 * Suggestion chip that appears when an assistant is relevant
 */
export function AssistantSuggestion({
  assistantId,
  message,
  onDismiss,
  className,
}: AssistantSuggestionProps) {
  const { open } = useAssistant();

  const assistant = assistantRegistry.get(assistantId);
  if (!assistant) return null;

  const displayMessage = message || `Need help with ${assistant.name.toLowerCase()}?`;

  const handleClick = () => {
    open(assistantId);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3',
        'bg-muted/50 border border-border rounded-lg',
        className
      )}
    >
      <Sparkles className="h-5 w-5 text-primary shrink-0" />
      <p className="text-sm flex-1">{displayMessage}</p>
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={handleClick}>
          Start
        </Button>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
