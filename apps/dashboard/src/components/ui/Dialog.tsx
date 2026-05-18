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
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex flex-col bg-panel shadow-xl focus:outline-none',
          // mobile: bottom sheet
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-xl',
          // desktop: centered modal
          'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl',
          'data-[state=open]:animate-[dialog-in_180ms_ease-out]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <RadixDialog.Title className="text-sm font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="mt-0.5 text-xs text-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X size={16} />
          </RadixDialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
