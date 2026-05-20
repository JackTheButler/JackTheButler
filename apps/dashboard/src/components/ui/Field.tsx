import { Badge } from './Badge';

/**
 * Form field: label, control, optional hint. Set `optional` to mark
 * non-required fields with a small "Optional" tag next to the label
 * (cleaner than burying the word in the hint text).
 */
export function Field({
  label,
  hint,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {optional && (
          <Badge
            tone="muted"
            shape="tag"
            // Lighter + smaller than the default tag — should read as a
            // hint next to the label, not compete with it. tailwind-merge
            // lets these override the cva defaults cleanly.
            className="px-1 py-0 text-[9px] font-medium"
            aria-label="Optional field"
          >
            Optional
          </Badge>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
