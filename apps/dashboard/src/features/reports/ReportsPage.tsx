import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, Circle } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectItem, SegmentedControl, cn } from '@/components/ui';
import {
  AGENTS,
  RANGES,
  type Agent,
  type Range,
  kpis,
  volume,
  deflectionTrend,
  csatTrend,
  handoffReasons,
  topTopics,
  workload,
  channels,
  knowledgeGaps,
  queue,
  heatmap,
  WEEKDAYS,
} from './mock';

/* A small, theme-agnostic chart palette. Picked to read well on both the light
 * paper and dark backgrounds without per-theme swapping. */
const C = {
  indigo: '#6366f1',
  teal: '#14b8a6',
  amber: '#f59e0b',
  rose: '#fb7185',
  violet: '#a78bfa',
  sky: '#38bdf8',
  emerald: '#34d399',
};
const DONUT = [C.indigo, C.teal, C.amber, C.violet];
const GRID = 'rgb(125 125 125 / 0.16)';
const AXIS = 'rgb(125 125 125 / 0.85)';
const axisTick = { fontSize: 11, fill: AXIS };

/* ── Layout primitives ─────────────────────────────────────────────── */

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-panel p-4 md:p-5', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Headline KPI tile with a coloured delta chip. */
function StatTile({
  label,
  value,
  delta,
  goodWhenUp,
  hint,
}: {
  label: string;
  value: string;
  delta: number;
  goodWhenUp: boolean;
  hint: string;
}) {
  const good = delta >= 0 === goodWhenUp;
  const Arrow = delta >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
            good ? 'bg-emerald-500/12 text-emerald-600' : 'bg-rose-500/12 text-rose-600',
          )}
        >
          <Arrow size={11} strokeWidth={2.5} />
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

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

/** Shared tooltip, styled so it adapts to light/dark via theme tokens. */
function ChartTooltip({ active, payload, label }: TipProps) {
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

/** Horizontal labelled bars (handoff reasons, top topics) — crisper than a
 *  Recharts layout="vertical" for short categorical lists. */
function RankedBars({ data, color }: { data: { name: string; count: number }[]; color: string }) {
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

/** Weekday × hour intensity grid. */
function Heatmap() {
  const grid = useMemo(() => heatmap(), []);
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
                  title={`${WEEKDAYS[d]} ${h}:00 — ${Math.round(v * 100)}%`}
                  className="h-4 flex-1 rounded-[3px]"
                  style={{ background: C.indigo, opacity: 0.08 + v * 0.92 }}
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

/* ── Page ──────────────────────────────────────────────────────────── */

export function ReportsPage() {
  const [range, setRange] = useState<Range>('7d');
  const [agent, setAgent] = useState<Agent>('All agents');

  const stats = useMemo(() => kpis(range), [range]);
  const vol = useMemo(() => volume(range), [range]);
  const deflect = useMemo(() => deflectionTrend(range), [range]);
  const csat = useMemo(() => csatTrend(range), [range]);

  const totalChannel = channels.reduce((s, c) => s + c.value, 0);

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <PageHeader
          title="Reports"
          subtitle="How Jane and the team are performing"
          icon={
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <BarChart3 size={18} />
            </span>
          }
          action={
            <div className="flex items-center gap-2">
              <div className="w-40">
                <Select value={agent} onValueChange={(v) => setAgent(v as Agent)}>
                  {AGENTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <SegmentedControl
                aria-label="Date range"
                options={RANGES}
                value={range}
                onChange={setRange}
              />
            </div>
          }
        />

        {/* Live queue snapshot */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-line bg-panel px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Circle size={8} className="animate-pulse fill-current" /> Live
          </span>
          <QueueStat label="Unassigned" value={queue.unassigned} />
          <QueueStat label="Awaiting reply" value={queue.awaitingReply} />
          <QueueStat label="Oldest wait" value={`${queue.oldestWaitMin}m`} />
          <QueueStat label="Agents online" value={queue.onlineAgents} />
        </div>

        {/* KPI tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map(({ id, ...k }) => (
            <StatTile key={id} {...k} />
          ))}
        </div>

        {/* Charts */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Conversation volume"
            subtitle="AI-resolved vs. human-handled"
            className="lg:col-span-2"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={vol} margin={{ left: -16, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.indigo} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={C.indigo} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="gHuman" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.teal} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={C.teal} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ai"
                    name="AI"
                    stackId="1"
                    stroke={C.indigo}
                    fill="url(#gAi)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="human"
                    name="Human"
                    stackId="1"
                    stroke={C.teal}
                    fill="url(#gHuman)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="AI deflection rate" subtitle="% resolved without a human">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={deflect} margin={{ left: -16, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="gRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.violet} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={C.violet} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    unit="%"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    name="Deflection"
                    stroke={C.violet}
                    fill="url(#gRate)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="CSAT" subtitle="AI vs. human, 1–5 scale">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={csat} margin={{ left: -16, right: 8, top: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[3.5, 5]}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="human"
                    name="Human"
                    stroke={C.teal}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ai"
                    name="AI"
                    stroke={C.indigo}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Handoff reasons" subtitle="Why chats reached a human">
            <RankedBars data={handoffReasons} color={C.amber} />
          </Panel>

          <Panel title="Top topics" subtitle="Most common conversation tags">
            <RankedBars data={topTopics} color={C.indigo} />
          </Panel>

          <Panel title="Workload by agent" subtitle="Open now vs. resolved today">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workload} margin={{ left: -16, right: 8, top: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="agent" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID }} />
                  <Bar dataKey="open" name="Open" fill={C.amber} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill={C.emerald} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Channels" subtitle="Volume by source">
            <div className="flex items-center gap-4">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channels}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={64}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {channels.map((_, i) => (
                        <Cell key={i} fill={DONUT[i % DONUT.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2">
                {channels.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: DONUT[i % DONUT.length] }}
                    />
                    <span className="text-ink">{c.name}</span>
                    <span className="ml-auto font-semibold text-muted">
                      {Math.round((c.value / totalChannel) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel
            title="Volume heatmap"
            subtitle="When conversations arrive"
            className="lg:col-span-2"
          >
            <Heatmap />
          </Panel>

          <Panel
            title="Knowledge gaps"
            subtitle="Low-confidence answers — articles worth writing"
            className="lg:col-span-2"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Question</th>
                    <th className="pb-2 text-right font-medium">Times asked</th>
                    <th className="pb-2 text-right font-medium">Best match</th>
                  </tr>
                </thead>
                <tbody>
                  {knowledgeGaps.map((g) => (
                    <tr key={g.question} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 pr-4 text-ink">{g.question}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{g.asked}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex rounded-full bg-rose-500/12 px-2 py-0.5 text-xs font-semibold text-rose-600">
                          {Math.round(g.confidence * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function QueueStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
