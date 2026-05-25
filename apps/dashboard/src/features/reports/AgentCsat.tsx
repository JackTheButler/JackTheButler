import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { agentCsatTrend, type Agent, type Range } from './mock';
import { Panel } from './primitives';
import { ChartTooltip } from './ChartTooltip';
import { C, GRID, AXIS, axisTick } from './chartTheme';

/** The selected agent's CSAT against the team average (dashed baseline). */
export function AgentCsat({ agent, range }: { agent: Agent; range: Range }) {
  const data = useMemo(() => agentCsatTrend(agent, range), [agent, range]);
  return (
    <Panel title="My CSAT vs team" subtitle="Post-chat rating against the team average">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -16, right: 8, top: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis domain={[3.5, 5]} tick={axisTick} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="team"
              name="Team avg"
              stroke={AXIS}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="mine"
              name="Me"
              stroke={C.indigo}
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
