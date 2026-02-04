import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
  className?: string;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'right' | 'left';
  className?: string;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  dropdownId: string;
}>({ open: false, setOpen: () => {}, triggerRef: { current: null }, dropdownId: '' });

// Global event emitter for closing other dropdowns
const closeCallbacks = new Set<(excludeId: string) => void>();

function emitCloseOthers(excludeId: string) {
  closeCallbacks.forEach((cb) => cb(excludeId));
}

let dropdownIdCounter = 0;

export function DropdownMenu({ children, className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const dropdownId = React.useRef(`dropdown-${++dropdownIdCounter}`);

  React.useEffect(() => {
    const handleCloseOthers = (excludeId: string) => {
      if (excludeId !== dropdownId.current) {
        setOpen(false);
      }
    };

    closeCallbacks.add(handleCloseOthers);
    return () => {
      closeCallbacks.delete(handleCloseOthers);
    };
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedDropdown = target.closest('[data-dropdown-id]');
      if (!clickedDropdown || clickedDropdown.getAttribute('data-dropdown-id') !== dropdownId.current) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [open]);

  const handleSetOpen = React.useCallback((value: boolean) => {
    if (value) {
      emitCloseOthers(dropdownId.current);
    }
    setOpen(value);
  }, []);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen: handleSetOpen, triggerRef, dropdownId: dropdownId.current }}>
      <div ref={triggerRef} className={cn("relative inline-block", className)} data-dropdown data-dropdown-id={dropdownId.current}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { open, setOpen } = React.useContext(DropdownMenuContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
      onClick: handleClick,
    });
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({ children, align = 'end', side = 'bottom', className }: DropdownMenuContentProps) {
  const { open, triggerRef, dropdownId } = React.useContext(DropdownMenuContext);
  const [position, setPosition] = React.useState({ top: 0, left: 0, transform: '' });

  React.useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const isRtl = document.documentElement.dir === 'rtl';

      let left = rect.left + window.scrollX;
      let transform = '';
      let top = rect.bottom + window.scrollY;

      // Handle horizontal sides (right/left)
      if (side === 'right' || side === 'left') {
        const effectiveSide = isRtl ? (side === 'right' ? 'left' : 'right') : side;

        if (effectiveSide === 'right') {
          left = rect.right + window.scrollX;
        } else {
          left = rect.left + window.scrollX;
          transform = 'translateX(-100%)';
        }

        // Vertical alignment for horizontal sides
        if (align === 'start') {
          top = rect.top + window.scrollY;
        } else if (align === 'center') {
          top = rect.top + rect.height / 2 + window.scrollY;
          transform = transform ? `${transform} translateY(-50%)` : 'translateY(-50%)';
        } else if (align === 'end') {
          top = rect.bottom + window.scrollY;
          transform = transform ? `${transform} translateY(-100%)` : 'translateY(-100%)';
        }
      } else {
        // Handle vertical sides (top/bottom)
        if (align === 'end') {
          if (isRtl) {
            left = rect.left + window.scrollX;
          } else {
            left = rect.right + window.scrollX;
            transform = 'translateX(-100%)';
          }
        } else if (align === 'center') {
          left = rect.left + rect.width / 2 + window.scrollX;
          transform = 'translateX(-50%)';
        } else if (align === 'start') {
          if (isRtl) {
            left = rect.right + window.scrollX;
            transform = 'translateX(-100%)';
          }
        }

        if (side === 'top') {
          top = rect.top + window.scrollY;
          transform = transform ? `${transform} translateY(-100%)` : 'translateY(-100%)';
        }
      }

      setPosition({
        top,
        left,
        transform,
      });
    }
  }, [open, align, side, triggerRef]);

  if (!open) return null;

  return createPortal(
    <div
      data-dropdown
      data-dropdown-id={dropdownId}
      className={cn(
        'fixed z-50 min-w-[120px] w-max py-1 bg-popover border rounded-md shadow-lg',
        className
      )}
      style={{
        top: position.top,
        left: position.left,
        transform: position.transform || undefined,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function DropdownMenuItem({ children, onClick, className, disabled }: DropdownMenuItemProps) {
  const { setOpen } = React.useContext(DropdownMenuContext);

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    setOpen(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'block w-full px-3 py-1.5 text-sm text-start hover:bg-muted transition-colors whitespace-nowrap',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 border-t" />;
}
