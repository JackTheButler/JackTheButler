/** Horizontal labelled bars for short categorical lists (handoff reasons, top
 *  topics) — crisper than a Recharts vertical bar chart at this size. */
export function RankedBars({
  data,
  color,
}: {
  data: { name: string; count: number }[];
  color: string;
}) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate text-ink">{d.name}</span>
            <span className="ml-2 shrink-0 font-semibold text-muted">{d.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.count / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
