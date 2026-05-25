import type { Breakdowns as BreakdownStats } from '@janetheoperator/shared';

const C = { indigo: '#6366f1', teal: '#14b8a6' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CHANNEL_LABEL: Record<string, string> = {
  webchat: 'Web chat',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
};
const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

function durationMin(sec: number | null): string | undefined {
  if (sec == null) return undefined;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Panel({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-4 md:p-5 ${className ?? ''}`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function RankedBars({
  items,
  color,
}: {
  items: { label: string; value: number; sub?: string }[];
  color: string;
}) {
  if (items.length === 0) return <p className="text-xs text-muted">No data in this range yet.</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-ink">{i.label}</span>
            <span className="shrink-0 font-semibold text-muted">
              {i.value}
              {i.sub ? ` · ${i.sub}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full"
              style={{ width: `${max ? (i.value / max) * 100 : 0}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div>
      <div className="space-y-1">
        {grid.map((row, d) => (
          <div key={WEEKDAYS[d]} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[10px] text-muted">{WEEKDAYS[d]}</span>
            <div className="flex flex-1 gap-[3px]">
              {row.map((v, h) => (
                <div
                  key={h}
                  title={`${WEEKDAYS[d]} ${h}:00 — ${v}`}
                  className="h-4 flex-1 rounded-[3px]"
                  style={{ background: C.indigo, opacity: v === 0 ? 0.06 : 0.12 + (v / max) * 0.88 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 pl-10 text-[10px] text-muted">
        <span className="flex-1">12am</span>
        <span className="flex-1 text-center">12pm</span>
        <span className="flex-1 text-right">11pm</span>
      </div>
    </div>
  );
}

interface Subject {
  label: string; // "you", or a person's name
  self: boolean;
}

export function Breakdowns({ stats, subject }: { stats?: BreakdownStats; subject?: Subject }) {
  if (!stats) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className={`h-48 animate-pulse rounded-xl border border-line bg-panel ${i === 2 ? 'lg:col-span-2' : ''}`}
          />
        ))}
      </div>
    );
  }

  const workloadItems = stats.workload.map((w) => ({
    label: w.name,
    value: w.resolved,
    sub: durationMin(w.medianFirstResponseSec),
  }));
  const channelItems = stats.channels.map((c) => ({
    label: channelLabel(c.channel),
    value: c.count,
  }));

  const who = subject ? (subject.self ? 'you' : subject.label) : null;
  const workloadTitle = who ? 'Workload' : 'Workload by agent';
  const workloadSubtitle = who
    ? `Resolved by ${who} · median first response`
    : 'Resolved per agent · median first response';

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title={workloadTitle} subtitle={workloadSubtitle}>
        <RankedBars items={workloadItems} color={C.teal} />
      </Panel>
      <Panel title="Channels" subtitle="Resolved volume by source">
        <RankedBars items={channelItems} color={C.indigo} />
      </Panel>
      <Panel title="Activity heatmap" subtitle="When conversations arrive" className="lg:col-span-2">
        <Heatmap grid={stats.heatmap} />
      </Panel>
    </div>
  );
}
