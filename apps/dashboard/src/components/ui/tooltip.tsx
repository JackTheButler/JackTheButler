import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  const [show, setShow] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLElement>(null);

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (side) {
      case 'top':
        top = rect.top - 4;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + 4;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
    }

    setPosition({ top, left });
  }, [side]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setShow(true);
    updatePosition();
    // Call original handler if exists
    const originalHandler = children.props.onMouseEnter;
    if (originalHandler) originalHandler(e);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    setShow(false);
    // Call original handler if exists
    const originalHandler = children.props.onMouseLeave;
    if (originalHandler) originalHandler(e);
  };

  if (!content) {
    return children;
  }

  // Clone the child element to attach ref and handlers without wrapper
  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  });

  const tooltipContent = show && createPortal(
    <div
      className={cn(
        'fixed z-[9999] px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap pointer-events-none',
        (side === 'top' || side === 'bottom') && '-translate-x-1/2',
        (side === 'left' || side === 'right') && '-translate-y-1/2',
        side === 'top' && '-translate-y-full',
        side === 'left' && '-translate-x-full'
      )}
      style={{ top: position.top, left: position.left }}
    >
      {content}
    </div>,
    document.body
  );

  return (
    <>
      {trigger}
      {tooltipContent}
    </>
  );
}
