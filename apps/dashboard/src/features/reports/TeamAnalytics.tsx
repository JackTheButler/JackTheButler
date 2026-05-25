import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  type Range,
  volume,
  deflectionTrend,
  csatTrend,
  handoffReasons,
  topTopics,
  workload,
  channels,
  knowledgeGaps,
  heatmap,
} from './mock';
import { Panel } from './primitives';
import { ChartTooltip } from './ChartTooltip';
import { RankedBars } from './RankedBars';
import { Heatmap } from './Heatmap';
import { ChannelDonut } from './ChannelDonut';
import { C, GRID, axisTick } from './chartTheme';

/** Workspace-wide analytical charts (the "All agents" view). */
export function TeamAnalytics({ range }: { range: Range }) {
  const vol = useMemo(() => volume(range), [range]);
  const deflect = useMemo(() => deflectionTrend(range), [range]);
  const csat = useMemo(() => csatTrend(range), [range]);
  const heat = useMemo(() => heatmap(), []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <YAxis domain={[3.5, 5]} tick={axisTick} tickLine={false} axisLine={false} width={40} />
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
        <ChannelDonut data={channels} />
      </Panel>

      <Panel title="Volume heatmap" subtitle="When conversations arrive" className="lg:col-span-2">
        <Heatmap data={heat} />
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
  );
}
