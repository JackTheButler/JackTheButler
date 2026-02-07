/**
 * Assistant Fullscreen Component
 *
 * Full page layout for assistants like the setup wizard.
 *
 * @module shared/assistant/components/AssistantFullscreen
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/**
 * Props for AssistantFullscreen
 */
export interface AssistantFullscreenProps {
  /** Children to render in the main content area */
  children: React.ReactNode;

  /** Title shown in header */
  title?: string;

  /** Subtitle/description */
  subtitle?: string;

  /** Current progress step (1-based) */
  progressCurrent?: number;

  /** Total progress steps */
  progressTotal?: number;

  /** Whether to show progress indicator */
  showProgress?: boolean;

  /** Whether to show skip button */
  showSkip?: boolean;

  /** Called when skip is clicked */
  onSkip?: () => void;

  /** Skip button label */
  skipLabel?: string;

  /** Header component to render instead of default header */
  headerComponent?: React.ReactNode;

  /** Additional CSS class for container */
  className?: string;
}

/**
 * Fullscreen assistant layout with header and progress
 */
export function AssistantFullscreen({
  children,
  title,
  subtitle,
  progressCurrent = 0,
  progressTotal = 0,
  showProgress = false,
  showSkip = false,
  onSkip,
  skipLabel = 'Skip',
  headerComponent,
  className,
}: AssistantFullscreenProps) {
  const progressValue = progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0;

  return (
    <div className={cn('min-h-screen bg-background flex flex-col', className)}>
      {/* Header */}
      {headerComponent ? (
        headerComponent
      ) : (
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {title && (
                <div>
                  <h1 className="text-lg font-semibold">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {showProgress && progressTotal > 0 && (
                <div className="hidden sm:flex items-center gap-3 w-32">
                  <Progress value={progressValue} className="h-1.5" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {progressCurrent}/{progressTotal}
                  </span>
                </div>
              )}

              {showSkip && onSkip && (
                <Button variant="ghost" size="sm" onClick={onSkip}>
                  {skipLabel}
                </Button>
              )}
            </div>
          </div>

          {/* Mobile progress bar */}
          {showProgress && progressTotal > 0 && (
            <div className="sm:hidden px-4 pb-2">
              <Progress value={progressValue} className="h-1" />
            </div>
          )}
        </header>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
