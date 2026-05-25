import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { ChannelSlice } from './mock';
import { ChartTooltip } from './ChartTooltip';
import { DONUT } from './chartTheme';

/** Donut + legend of conversation volume by source channel. */
export function ChannelDonut({ data }: { data: ChannelSlice[] }) {
  const total = data.reduce((s, c) => s + c.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT[i % DONUT.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-2">
        {data.map((c, i) => (
          <li key={c.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: DONUT[i % DONUT.length] }}
            />
            <span className="text-ink">{c.name}</span>
            <span className="ml-auto font-semibold text-muted">
              {Math.round((c.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
