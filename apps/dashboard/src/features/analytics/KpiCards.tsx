import { ArrowDown, ArrowUp, ChartNoAxesColumn } from 'lucide-react';
import type { KpiMetrics, KpiStats } from '@janetheoperator/shared';
import { cn } from '@/components/ui';

/* ── formatting ────────────────────────────────────────────────────── */

const pct = (r: number) => `${Math.round(r * 100)}%`;

function duration(sec: number | null): string {
  if (sec == null) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** % change vs. the previous period; null when there's no baseline. */
function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

interface CardDef {
  label: string;
  value: string;
  delta: number | null;
  goodWhenUp: boolean;
  hint: string;
}

interface Subject {
  label: string; // "you", or a person's name
  self: boolean;
}

function buildCards(cur: KpiMetrics, prev: KpiMetrics, subject?: Subject): CardDef[] {
  const p = subject ? (subject.self ? 'you' : subject.label) : null; // "you" | "Maya" | null
  const poss = subject ? (subject.self ? 'your' : `${subject.label}'s`) : null;
  return [
    {
      label: 'Resolved',
      value: String(cur.episodes),
      delta: delta(cur.episodes, prev.episodes),
      goodWhenUp: true,
      hint: p ? `Cases ${p} closed` : 'Cases closed in range',
    },
    {
      label: 'AI deflection',
      value: pct(cur.aiDeflectionRate),
      delta: delta(cur.aiDeflectionRate, prev.aiDeflectionRate),
      goodWhenUp: true,
      hint: subject
        ? subject.self
          ? "You weren't needed"
          : `${subject.label} wasn't needed`
        : 'Closed with no human',
    },
    {
      label: 'Handoff rate',
      value: pct(cur.handoffRate),
      delta: delta(cur.handoffRate, prev.handoffRate),
      goodWhenUp: false,
      hint: p ? `Reached ${p}` : 'Reached a human',
    },
    {
      label: 'Median first response',
      value: duration(cur.medianFirstResponseSec),
      delta: delta(cur.medianFirstResponseSec, prev.medianFirstResponseSec),
      goodWhenUp: false,
      hint: poss ? `To ${poss} first reply` : 'To first human reply',
    },
    {
      label: 'Median resolution',
      value: duration(cur.medianResolutionSec),
      delta: delta(cur.medianResolutionSec, prev.medianResolutionSec),
      goodWhenUp: false,
      hint: 'Open to close',
    },
    {
      label: 'Reopened',
      value: pct(cur.reopenedRate),
      delta: delta(cur.reopenedRate, prev.reopenedRate),
      goodWhenUp: false,
      hint: 'Began as a reopen',
    },
  ];
}

/* ── components ────────────────────────────────────────────────────── */

function Card({ label, value, delta: d, goodWhenUp, hint }: CardDef) {
  const good = d == null ? null : d >= 0 === goodWhenUp;
  const Arrow = d != null && d >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {d != null && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              good ? 'bg-emerald-500/12 text-emerald-600' : 'bg-rose-500/12 text-rose-600',
            )}
          >
            <Arrow size={11} strokeWidth={2.5} />
            {Math.abs(d).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

const GRID = 'grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3';

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="h-3 w-20 animate-pulse rounded bg-surface" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-surface" />
      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-line bg-panel px-6 py-14 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-muted">
        <ChartNoAxesColumn size={22} />
      </div>
      <p className="text-sm font-semibold text-ink">No activity in this period</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
        Once conversations are resolved here, you'll see deflection, response times, and resolution
        stats. Try a wider date range.
      </p>
    </div>
  );
}

export function KpiCards({ stats, subject }: { stats?: KpiStats; subject?: Subject }) {
  if (!stats) {
    return (
      <div className={cn('mt-4', GRID)}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (stats.current.episodes === 0) {
    return (
      <div className="mt-4">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={cn('mt-4', GRID)}>
      {buildCards(stats.current, stats.previous, subject).map((c) => (
        <Card key={c.label} {...c} />
      ))}
    </div>
  );
}
