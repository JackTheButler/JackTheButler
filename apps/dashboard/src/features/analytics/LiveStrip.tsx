import { Circle } from 'lucide-react';
import type { LiveStats } from '@janetheoperator/shared';

/** Format a waiting duration in minutes for display; em-dash when nothing waits. */
function waitLabel(minutes: number, anyWaiting: boolean): string {
  if (!anyWaiting) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface Subject {
  label: string; // "you", or a person's name
  self: boolean;
}

/** Build the tiles for the viewer's scope. In agent scope the labels are
 *  possessive: "My …" when it's the viewer, otherwise "{Name}'s …". */
function tilesFor(s: LiveStats, subject?: Subject): { label: string; value: number | string }[] {
  const oldest = { label: 'Oldest wait', value: waitLabel(s.oldestWaitMinutes, s.awaitingReply > 0) };
  if (s.scope === 'team') {
    return [
      { label: 'Unassigned', value: s.unassigned ?? 0 },
      { label: 'Awaiting reply', value: s.awaitingReply },
      oldest,
    ];
  }
  const open = subject?.self ? 'My open' : `${subject?.label ?? 'Agent'}'s open`;
  const awaiting = subject?.self
    ? 'Awaiting my reply'
    : `Awaiting ${subject?.label ?? 'agent'}'s reply`;
  return [
    { label: open, value: s.myOpen ?? 0 },
    { label: awaiting, value: s.awaitingReply },
    oldest,
  ];
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** Live queue snapshot strip, backed by the analytics/live endpoint. Shows
 *  placeholder dashes until the first fetch resolves. */
export function LiveStrip({ stats, subject }: { stats?: LiveStats; subject?: Subject }) {
  const tiles = stats
    ? tilesFor(stats, subject)
    : [
        { label: 'Awaiting reply', value: '—' },
        { label: 'Oldest wait', value: '—' },
      ];
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-line bg-panel px-5 py-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <Circle size={8} className="animate-pulse fill-current" /> Live
      </span>
      {tiles.map((t) => (
        <Stat key={t.label} label={t.label} value={t.value} />
      ))}
    </div>
  );
}
