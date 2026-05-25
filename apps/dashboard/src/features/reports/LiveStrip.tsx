import { Circle } from 'lucide-react';

function QueueStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** Live snapshot strip — real-time counts, independent of the date range. Fed
 *  team-wide or per-agent stats by the page. */
export function LiveStrip({ stats }: { stats: { label: string; value: number | string }[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-line bg-panel px-5 py-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <Circle size={8} className="animate-pulse fill-current" /> Live
      </span>
      {stats.map((s) => (
        <QueueStat key={s.label} label={s.label} value={s.value} />
      ))}
    </div>
  );
}
