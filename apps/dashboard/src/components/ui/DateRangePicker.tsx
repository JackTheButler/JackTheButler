import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

/**
 * Date-range picker primitive (Shopify-style): a trigger showing the current
 * range that opens a popover with quick presets on the left and a two-month
 * calendar for custom ranges on the right. Apply commits; Cancel discards.
 *
 * Works in inclusive `YYYY-MM-DD` strings (server-local days) so it round-trips
 * cleanly through the URL and the analytics API. Future days are disabled.
 */

export interface DateRangeValue {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

/* ── date helpers (no external lib) ─────────────────────────────────── */
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a: Date, b: Date) => iso(a) === iso(b);
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function monthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ── presets ────────────────────────────────────────────────────────── */
function presets(today: Date): { label: string; from: Date; to: Date }[] {
  const yesterday = addDays(today, -1);
  const lastMonthStart = startOfMonth(addMonths(today, -1));
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: yesterday, to: yesterday },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'Last 90 days', from: addDays(today, -89), to: today },
    { label: 'This month', from: startOfMonth(today), to: today },
    { label: 'Last month', from: lastMonthStart, to: addDays(startOfMonth(today), -1) },
  ];
}

/* ── calendar ───────────────────────────────────────────────────────── */
function Month({
  month,
  from,
  to,
  hovered,
  today,
  onPick,
  onHover,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  hovered: Date | null;
  today: Date;
  onPick: (d: Date) => void;
  onHover: (d: Date | null) => void;
}) {
  const end = to ?? hovered;
  const lo = from && end ? (from <= end ? from : end) : null;
  const hi = from && end ? (from <= end ? end : from) : null;

  return (
    <div className="w-56">
      <div className="mb-2 text-center text-xs font-semibold text-ink">
        {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-muted">
        {DOW.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthCells(month).map((day, i) => {
          if (!day) return <span key={i} />;
          const future = day > today;
          const isFrom = from && sameDay(day, from);
          const isTo = to && sameDay(day, to);
          const inRange = lo && hi && day >= lo && day <= hi;
          const endpoint = isFrom || isTo;
          return (
            <button
              key={i}
              type="button"
              disabled={future}
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              className={cn(
                'mx-auto grid h-7 w-7 place-items-center rounded-md text-xs transition-colors',
                future && 'cursor-not-allowed text-muted/40',
                !future && !inRange && 'text-ink hover:bg-surface',
                inRange && !endpoint && 'bg-accent-soft text-ink',
                endpoint && 'bg-accent font-semibold text-on-accent',
                !endpoint && !future && sameDay(day, today) && 'ring-1 ring-line',
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────────── */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);
  const [leftMonth, setLeftMonth] = useState<Date>(startOfMonth(parse(value.to)));

  // Sync the draft to the committed value whenever the popover opens.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setFrom(parse(value.from));
      setTo(parse(value.to));
      setLeftMonth(startOfMonth(addMonths(parse(value.to), -1)));
    }
    setOpen(next);
  };

  const pick = (day: Date) => {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
    } else if (day < from) {
      setTo(from);
      setFrom(day);
    } else {
      setTo(day);
    }
  };

  const applyPreset = (p: { from: Date; to: Date }) => {
    setFrom(p.from);
    setTo(p.to);
    setLeftMonth(startOfMonth(addMonths(p.to, -1)));
  };

  const commit = () => {
    if (!from || !to) return;
    onChange({ from: iso(from), to: iso(to) });
    setOpen(false);
  };

  const triggerLabel = `${fmt(parse(value.from))} – ${fmt(parse(value.to))}`;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg bg-panel px-3 text-sm text-ink ring-1 ring-line transition-colors hover:bg-surface',
            className,
          )}
        >
          <Calendar size={15} className="text-muted" />
          <span className="whitespace-nowrap">{triggerLabel}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[calc(100vw-1rem)] overflow-auto rounded-xl border border-line bg-panel p-3 shadow-lg ring-1 ring-black/5"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Presets */}
            <div className="flex shrink-0 flex-row flex-wrap gap-1 sm:w-32 sm:flex-col">
              {presets(today).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-md px-2.5 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div onMouseLeave={() => setHovered(null)}>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setLeftMonth(addMonths(leftMonth, -1))}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setLeftMonth(addMonths(leftMonth, 1))}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="flex gap-4">
                <Month
                  month={leftMonth}
                  from={from}
                  to={to}
                  hovered={hovered}
                  today={today}
                  onPick={pick}
                  onHover={setHovered}
                />
                <div className="hidden sm:block">
                  <Month
                    month={addMonths(leftMonth, 1)}
                    from={from}
                    to={to}
                    hovered={hovered}
                    today={today}
                    onPick={pick}
                    onHover={setHovered}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-xs text-muted">
              {from && to ? `${fmt(from)} – ${fmt(to)}` : 'Select a range'}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={commit} disabled={!from || !to}>
                Apply
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
