import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
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

export function DropdownMenu({ children }: DropdownMenuProps) {
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
      <div ref={triggerRef} className="relative inline-block" data-dropdown data-dropdown-id={dropdownId.current}>
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

export function DropdownMenuContent({ children, align = 'end', className }: DropdownMenuContentProps) {
  const { open, triggerRef, dropdownId } = React.useContext(DropdownMenuContext);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let left = rect.left + window.scrollX;
      if (align === 'end') {
        left = rect.right + window.scrollX;
      } else if (align === 'center') {
        left = rect.left + rect.width / 2 + window.scrollX;
      }
      setPosition({
        top: rect.bottom + window.scrollY,
        left,
      });
    }
  }, [open, align, triggerRef]);

  if (!open) return null;

  return createPortal(
    <div
      data-dropdown
      data-dropdown-id={dropdownId}
      className={cn(
        'fixed z-50 min-w-[120px] py-1 bg-popover border rounded-md shadow-lg',
        className
      )}
      style={{
        top: position.top,
        left: position.left,
        transform: align === 'end' ? 'translateX(-100%)' : align === 'center' ? 'translateX(-50%)' : undefined,
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
        'w-full px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors',
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
