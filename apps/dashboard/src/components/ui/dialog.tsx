import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [open, onOpenChange]);

  if (!open) return null;

  return <>{children}</>;
}

export function DialogContent({ children, className, title }: DialogContentProps) {
  const dialogContext = React.useContext(DialogContext);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => dialogContext?.onOpenChange(false)}
      />
      <div
        className={cn(
          'relative z-50 bg-white rounded-lg shadow-xl max-h-[85vh] overflow-auto',
          'w-full max-w-lg mx-4',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-medium">{title}</h2>
            <button
              onClick={() => dialogContext?.onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

export function DialogRoot({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog>
    </DialogContext.Provider>
  );
}
