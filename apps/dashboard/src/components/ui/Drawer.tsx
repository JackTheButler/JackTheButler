import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

/**
 * Right-side overlay panel: a dimmed backdrop plus a sliding sheet with a
 * header (back/close button + title) and a scrollable body. Full-width on
 * mobile, fixed width from the chosen breakpoint up. Used for the inbox
 * customer + knowledge panels; reach for it for any contextual side panel.
 *
 * `widthClass` controls the desktop width (e.g. 'sm:w-[34rem]'). `className`
 * is applied to both the backdrop and the sheet — handy for responsive
 * visibility (e.g. 'xl:hidden' when a static column takes over on wide screens).
 */
export function Drawer({
  open,
  onClose,
  title,
  widthClass = 'sm:w-[26rem]',
  closeLabel = 'Close panel',
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  widthClass?: string;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
          className,
        )}
      />

      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-panel transition-transform duration-300 ease-out sm:border-l sm:border-line',
          widthClass,
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
          className,
        )}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-3">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel}>
            <ChevronLeft size={20} />
          </Button>
          <span className="text-sm font-semibold">{title}</span>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
