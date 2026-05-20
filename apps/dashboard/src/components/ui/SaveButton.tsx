import { useEffect, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button, type ButtonProps } from './Button';

/**
 * Save button with mutation-driven labels: "Save" → "Saving…" → "Saved"
 * (then back to "Save" after a short delay). Reusable wherever a TanStack
 * Query mutation drives a save action — pass `isPending`/`isSuccess` and an
 * `onSave` handler. Keeps the "stuck on Saved" bug out of feature code.
 */
export function SaveButton({
  onSave,
  isPending,
  isSuccess,
  successDuration = 5000,
  idleLabel = 'Save',
  className,
  ...buttonProps
}: {
  onSave: () => void;
  isPending: boolean;
  isSuccess: boolean;
  successDuration?: number;
  idleLabel?: ReactNode;
} & Omit<ButtonProps, 'onClick' | 'children'>) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!isSuccess) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), successDuration);
    return () => clearTimeout(t);
  }, [isSuccess, successDuration]);

  return (
    <Button
      {...buttonProps}
      disabled={buttonProps.disabled || isPending}
      onClick={onSave}
      className={className}
    >
      {isPending ? (
        'Saving…'
      ) : showSaved ? (
        <>
          <Check size={14} /> Saved
        </>
      ) : (
        idleLabel
      )}
    </Button>
  );
}
