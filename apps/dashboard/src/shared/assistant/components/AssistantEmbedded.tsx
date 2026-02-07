/**
 * Assistant Embedded Component
 *
 * Inline container layout for assistants embedded in a page.
 *
 * @module shared/assistant/components/AssistantEmbedded
 */

import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

/**
 * Props for AssistantEmbedded
 */
export interface AssistantEmbeddedProps {
  /** Children to render in the container */
  children: React.ReactNode;

  /** Title shown at top */
  title?: string;

  /** Description text */
  description?: string;

  /** Current progress step (1-based) */
  progressCurrent?: number;

  /** Total progress steps */
  progressTotal?: number;

  /** Whether to show progress indicator */
  showProgress?: boolean;

  /** Whether to show border */
  bordered?: boolean;

  /** Whether to show shadow */
  elevated?: boolean;

  /** Additional CSS class for container */
  className?: string;
}

/**
 * Inline embedded assistant layout
 */
export function AssistantEmbedded({
  children,
  title,
  description,
  progressCurrent = 0,
  progressTotal = 0,
  showProgress = false,
  bordered = true,
  elevated = false,
  className,
}: AssistantEmbeddedProps) {
  const progressValue = progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0;

  return (
    <div
      className={cn(
        'bg-background rounded-lg',
        bordered && 'border border-border',
        elevated && 'shadow-md',
        className
      )}
    >
      {/* Header (optional) */}
      {(title || showProgress) && (
        <div className="px-4 py-3 border-b border-border">
          {title && (
            <div className="mb-2">
              <h3 className="text-base font-semibold">{title}</h3>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}

          {showProgress && progressTotal > 0 && (
            <div className="flex items-center gap-3">
              <Progress value={progressValue} className="flex-1 h-1.5" />
              <span className="text-xs text-muted-foreground">
                {progressCurrent}/{progressTotal}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">{children}</div>
    </div>
  );
}
