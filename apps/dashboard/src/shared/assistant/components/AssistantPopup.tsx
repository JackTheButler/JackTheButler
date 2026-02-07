/**
 * Assistant Popup Component
 *
 * Modal dialog layout for assistants like channel setup.
 *
 * @module shared/assistant/components/AssistantPopup
 */

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/**
 * Props for AssistantPopup
 */
export interface AssistantPopupProps {
  /** Children to render in the dialog */
  children: React.ReactNode;

  /** Whether the popup is open */
  isOpen: boolean;

  /** Called when the popup should close */
  onClose: () => void;

  /** Title shown in header */
  title?: string;

  /** Description text */
  description?: string;

  /** Current progress step (1-based) */
  progressCurrent?: number;

  /** Total progress steps */
  progressTotal?: number;

  /** Whether to show progress indicator */
  showProgress?: boolean;

  /** Size of the popup */
  size?: 'sm' | 'md' | 'lg' | 'xl';

  /** Whether clicking backdrop closes popup */
  closeOnBackdrop?: boolean;

  /** Whether pressing Escape closes popup */
  closeOnEscape?: boolean;

  /** Additional CSS class for dialog */
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * Modal popup assistant layout
 */
export function AssistantPopup({
  children,
  isOpen,
  onClose,
  title,
  description,
  progressCurrent = 0,
  progressTotal = 0,
  showProgress = false,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
}: AssistantPopupProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const progressValue = progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'assistant-popup-title' : undefined}
        className={cn(
          'relative w-full mx-4',
          'bg-background rounded-lg shadow-xl',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="flex-1 pr-4">
            {title && (
              <h2 id="assistant-popup-title" className="text-lg font-semibold">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 -mr-2 -mt-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Progress */}
        {showProgress && progressTotal > 0 && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-3">
              <Progress value={progressValue} className="flex-1 h-1.5" />
              <span className="text-xs text-muted-foreground">
                {progressCurrent}/{progressTotal}
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
