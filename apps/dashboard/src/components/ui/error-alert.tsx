import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorAlertProps {
  /** Error message or Error object */
  error: string | Error | null | undefined;
  /** Optional title (defaults to "Error") */
  title?: string;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

/**
 * A wrapper for displaying error alerts with consistent styling and dismissal.
 *
 * @example
 * {error && (
 *   <ErrorAlert error={error} onDismiss={() => setError(null)} />
 * )}
 *
 * // With Error object
 * <ErrorAlert error={apiError} title="Failed to save" />
 */
export function ErrorAlert({
  error,
  title,
  onDismiss,
  className = 'mb-6',
}: ErrorAlertProps) {
  if (!error) return null;

  const message = error instanceof Error ? error.message : error;

  return (
    <Alert variant="destructive" className={className} onDismiss={onDismiss}>
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
