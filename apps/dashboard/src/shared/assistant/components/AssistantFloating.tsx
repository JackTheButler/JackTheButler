/**
 * Assistant Floating Component
 *
 * Floating panel with trigger button for always-available assistants.
 *
 * @module shared/assistant/components/AssistantFloating
 */

import { useState, useCallback } from 'react';
import { MessageCircle, X, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Position of the floating panel
 */
export type FloatingPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/**
 * Props for AssistantFloating
 */
export interface AssistantFloatingProps {
  /** Children to render in the panel */
  children: React.ReactNode;

  /** Panel title */
  title?: string;

  /** Position on screen */
  position?: FloatingPosition;

  /** Whether panel starts open */
  defaultOpen?: boolean;

  /** Called when panel opens */
  onOpen?: () => void;

  /** Called when panel closes */
  onClose?: () => void;

  /** Custom trigger icon */
  triggerIcon?: React.ReactNode;

  /** Trigger button label for screen readers */
  triggerLabel?: string;

  /** Badge count to show on trigger */
  badgeCount?: number;

  /** Width of the panel */
  panelWidth?: number;

  /** Height of the panel */
  panelHeight?: number;

  /** Additional CSS class for trigger */
  triggerClassName?: string;

  /** Additional CSS class for panel */
  panelClassName?: string;
}

const positionClasses: Record<FloatingPosition, { container: string; panel: string }> = {
  'bottom-right': {
    container: 'bottom-4 right-4',
    panel: 'bottom-16 right-0 origin-bottom-right',
  },
  'bottom-left': {
    container: 'bottom-4 left-4',
    panel: 'bottom-16 left-0 origin-bottom-left',
  },
  'top-right': {
    container: 'top-4 right-4',
    panel: 'top-16 right-0 origin-top-right',
  },
  'top-left': {
    container: 'top-4 left-4',
    panel: 'top-16 left-0 origin-top-left',
  },
};

/**
 * Floating panel assistant with trigger button
 */
export function AssistantFloating({
  children,
  title = 'Assistant',
  position = 'bottom-right',
  defaultOpen = false,
  onOpen,
  onClose,
  triggerIcon,
  triggerLabel = 'Open assistant',
  badgeCount,
  panelWidth = 380,
  panelHeight = 500,
  triggerClassName,
  panelClassName,
}: AssistantFloatingProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [isOpen, handleOpen, handleClose]);

  const posClasses = positionClasses[position];

  return (
    <div className={cn('fixed z-50', posClasses.container)}>
      {/* Panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute',
            'bg-background rounded-lg shadow-xl border border-border',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            posClasses.panel,
            panelClassName
          )}
          style={{ width: panelWidth, height: panelHeight }}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold">{title}</h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8"
              >
                <Minimize2 className="h-4 w-4" />
                <span className="sr-only">Minimize</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Panel Content */}
          <div
            className="overflow-hidden"
            style={{ height: panelHeight - 56 }}
          >
            {children}
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <Button
        onClick={handleToggle}
        size="icon"
        className={cn(
          'h-14 w-14 rounded-full shadow-lg',
          'transition-transform duration-200',
          isOpen && 'rotate-0',
          triggerClassName
        )}
        aria-label={triggerLabel}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          triggerIcon || <MessageCircle className="h-6 w-6" />
        )}

        {/* Badge */}
        {!isOpen && badgeCount !== undefined && badgeCount > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-5 h-5 px-1.5',
              'flex items-center justify-center',
              'text-xs font-medium',
              'bg-destructive text-destructive-foreground',
              'rounded-full'
            )}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </Button>
    </div>
  );
}
