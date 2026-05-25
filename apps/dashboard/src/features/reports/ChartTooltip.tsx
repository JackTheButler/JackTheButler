interface TipPayload {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}
interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: TipPayload[];
}

/** Shared Recharts tooltip, styled with theme tokens so it adapts to light/dark.
 *  Pass as `content={<ChartTooltip />}`; Recharts injects the active props. */
export function ChartTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 font-medium text-ink">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color }}
              aria-hidden
            />
            <span className="text-muted capitalize">{p.name}</span>
            <span className="ml-auto font-semibold text-ink">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
