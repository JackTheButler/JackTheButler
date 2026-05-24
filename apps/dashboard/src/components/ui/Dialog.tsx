import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

/**
 * Modal dialog (Radix — focus trap, ESC, scroll lock, aria for free).
 * Centered modal on desktop; bottom sheet on mobile.
 */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  fullScreen = false,
  dividers = true,
  showClose = true,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Pinned action bar at the bottom (stays put while the body scrolls). */
  footer?: React.ReactNode;
  /** Edge-to-edge takeover for space-heavy workflows (e.g. bulk import).
   *  Constrain your own content to a centered max-width column inside it. */
  fullScreen?: boolean;
  /** Header/footer separator lines. Off for compact confirm dialogs where the
   *  divider reads as heavy. */
  dividers?: boolean;
  /** The ✕ close affordance. Off for confirm dialogs, where the explicit
   *  action buttons are the way out (and a stray ✕ reads as clutter). */
  showClose?: boolean;
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      {/* No backdrop in full-screen — the surface already covers the viewport. */}
      {!fullScreen && (
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      )}
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex flex-col bg-panel focus:outline-none',
          fullScreen
            ? 'inset-0 data-[state=open]:animate-[fade-in_150ms_ease-out]'
            : cn(
                'shadow-xl',
                // mobile: bottom sheet. `mx-auto` centers it if a caller caps
                // the width (e.g. md:max-w-*); harmless when it's full-width.
                'inset-x-0 bottom-0 mx-auto max-h-[90vh] rounded-t-xl',
                // desktop: centered modal
                'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl',
                'data-[state=open]:animate-[dialog-in_180ms_ease-out]',
              ),
          className,
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-3 px-5 py-4',
            dividers && 'border-b border-line',
          )}
        >
          <div>
            <RadixDialog.Title className="text-sm font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="mt-0.5 text-xs text-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          {showClose && (
            <RadixDialog.Close
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X size={16} />
            </RadixDialog.Close>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className={cn('px-5 py-3', dividers && 'border-t border-line')}>{footer}</div>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
