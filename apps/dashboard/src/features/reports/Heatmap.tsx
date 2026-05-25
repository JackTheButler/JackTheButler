import { WEEKDAYS } from './mock';
import { C } from './chartTheme';

/** Weekday × hour intensity grid. Pass a `data` matrix (rows = weekday, cols =
 *  hour, values 0–1); the caller decides whether it's team-wide or per-agent. */
export function Heatmap({ data }: { data: number[][] }) {
  const grid = data;
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
