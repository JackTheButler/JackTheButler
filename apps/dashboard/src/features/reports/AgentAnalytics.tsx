import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  type Agent,
  type Range,
  agentVolume,
  agentResolutionTrend,
  agentHandoffReasons,
  agentTopTopics,
  agentWorkloadDaily,
  agentChannels,
  agentHeatmap,
} from './mock';
import { Panel } from './primitives';
import { ChartTooltip } from './ChartTooltip';
import { RankedBars } from './RankedBars';
import { Heatmap } from './Heatmap';
import { ChannelDonut } from './ChannelDonut';
import { AgentCsat } from './AgentCsat';
import { C, GRID, AXIS, axisTick } from './chartTheme';

/** Analytical charts scoped to a single agent — the same surfaces as the team
 *  view, but reframed around "you" vs. the rest of the team. */
export function AgentAnalytics({ agent, range }: { agent: Agent; range: Range }) {
  const vol = useMemo(() => agentVolume(agent, range), [agent, range]);
  const resolution = useMemo(() => agentResolutionTrend(agent, range), [agent, range]);
  const handoffs = useMemo(() => agentHandoffReasons(agent), [agent]);
  const topics = useMemo(() => agentTopTopics(agent), [agent]);
  const load = useMemo(() => agentWorkloadDaily(agent, range), [agent, range]);
  const chans = useMemo(() => agentChannels(agent), [agent]);
  const heat = useMemo(() => agentHeatmap(agent), [agent]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Conversation volume" subtitle="You vs. your team" className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={vol} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gYou" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.indigo} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={C.indigo} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="team"
                name="Your team"
                stroke={AXIS}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
              />
              <Area
                type="monotone"
                dataKey="you"
                name="You"
                stroke={C.indigo}
                fill="url(#gYou)"
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Your resolution rate" subtitle="% resolved by you">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={resolution} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gResolve" x1="0" y1="0" x2="0" y2="1">
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
                name="Resolved"
                stroke={C.violet}
                fill="url(#gResolve)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <AgentCsat agent={agent} range={range} />

      <Panel title="Your handoff reasons" subtitle="Why chats reached you">
        <RankedBars data={handoffs} color={C.amber} />
      </Panel>

      <Panel title="Your top topics" subtitle="Most common conversation tags">
        <RankedBars data={topics} color={C.indigo} />
      </Panel>

      <Panel title="Workload by you" subtitle="Conversations handled per day">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={load} margin={{ left: -16, right: 8, top: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID }} />
              <Bar dataKey="resolved" name="Resolved" fill={C.emerald} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Channels" subtitle="Your volume by source">
        <ChannelDonut data={chans} />
      </Panel>

      <Panel title="Activity heatmap" subtitle="When you handle conversations" className="lg:col-span-2">
        <Heatmap data={heat} />
      </Panel>
    </div>
  );
}
