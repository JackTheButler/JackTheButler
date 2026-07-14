import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { TrendStats } from '@janetheoperator/shared';

/* Theme-agnostic palette + neutral grid/axis, readable on light and dark. */
const C = { indigo: '#6366f1', teal: '#14b8a6', violet: '#a78bfa' };
const GRID = 'rgb(125 125 125 / 0.16)';
const AXIS = 'rgb(125 125 125 / 0.85)';
const axisTick = { fontSize: 11, fill: AXIS };

/** YYYY-MM-DD → "Mon 5" (parsed as local midnight to avoid TZ drift). */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function durationMin(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface TipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}
function ChartTooltip({
  active,
  label,
  payload,
  fmt,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TipRow[];
  fmt?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{label}</div>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color }}
              aria-hidden
            />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto font-semibold text-ink">
              {typeof p.value === 'number' && fmt ? fmt(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

interface Subject {
  label: string; // "you", or a person's name
  self: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TrendCharts({ stats, subject }: { stats?: TrendStats; subject?: Subject }) {
  // The non-AI ("human-handled") slice is named for whoever's in scope.
  const humanName = !subject ? 'Human' : cap(subject.label);
  const volumeSubtitle = `Resolved cases, AI vs. ${subject ? subject.label : 'human'}`;
  const deflectionSubtitle = `% resolved without ${subject ? subject.label : 'a human'}`;
  const data = useMemo(
    () =>
      (stats?.points ?? []).map((p) => ({
        label: dayLabel(p.date),
        ai: p.aiResolved,
        human: p.human,
        deflectionPct: p.deflectionRate == null ? null : Math.round(p.deflectionRate * 100),
        resolutionSec: p.medianResolutionSec,
      })),
    [stats],
  );

  if (!stats) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className={`h-64 animate-pulse rounded-xl border border-line bg-panel ${i === 0 ? 'lg:col-span-2' : ''}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Conversation volume" subtitle={volumeSubtitle} className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="tgAi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.indigo} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={C.indigo} stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="tgHuman" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="ai"
                name="AI"
                stackId="1"
                stroke={C.indigo}
                fill="url(#tgAi)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="human"
                name={humanName}
                stackId="1"
                stroke={C.teal}
                fill="url(#tgHuman)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="AI deflection rate" subtitle={deflectionSubtitle}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="tgRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.violet} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={C.violet} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={40}
                unit="%"
              />
              <Tooltip content={<ChartTooltip fmt={(v) => `${v}%`} />} />
              <Area
                type="monotone"
                dataKey="deflectionPct"
                name="Deflection"
                stroke={C.violet}
                fill="url(#tgRate)"
                strokeWidth={2}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Median resolution time" subtitle="Open to close">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -16, right: 8, top: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v: number) => `${Math.round(v / 60)}m`}
              />
              <Tooltip content={<ChartTooltip fmt={(v) => durationMin(v)} />} />
              <Line
                type="monotone"
                dataKey="resolutionSec"
                name="Resolution"
                stroke={C.indigo}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
