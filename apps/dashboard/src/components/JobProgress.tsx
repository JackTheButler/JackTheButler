import { X } from 'lucide-react';
import { cn } from '@/components/ui';
import { cancelJob, type JobSnapshot } from '@/lib/useJob';

/**
 * Generic progress bar for a background job. Drop in anywhere a `useJob`
 * result is available. Shows a determinate bar + count while running, a
 * terminal line on done/error/cancelled, and an optional cancel button.
 */
export function JobProgress({
  job,
  label,
  onCancel,
  className,
}: {
  job: JobSnapshot;
  /** Human label for what's running, e.g. "Embedding knowledge base". */
  label?: string;
  /** Called after a successful cancel request (e.g. to refresh state). */
  onCancel?: () => void;
  className?: string;
}) {
  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
  const running = job.state === 'running';

  return (
    <div className={cn('text-xs', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">
          {label ?? 'Working'} · {job.processed}/{job.total}
          {job.state === 'done' && ' · done'}
          {job.state === 'cancelled' && ' · cancelled'}
          {job.state === 'error' && ` · failed${job.error ? `: ${job.error}` : ''}`}
        </span>
        {running && (
          <button
            type="button"
            onClick={() => cancelJob(job.id).then(() => onCancel?.())}
            className="inline-flex items-center gap-1 text-muted hover:text-ink"
            aria-label="Cancel"
          >
            <X size={12} />
            Cancel
          </button>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out',
            job.state === 'error'
              ? 'bg-red-500'
              : job.state === 'cancelled'
                ? 'bg-muted'
                : 'bg-accent',
          )}
          style={{ width: `${job.state === 'done' ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
