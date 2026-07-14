import { useEffect, useState } from 'react';
import { cn } from '@/components/ui';

/** Per-stage timing for an "Ask Jane" run. Each member is filled in as its
 *  `timing` event streams in; a stage that didn't run is simply absent (e.g.
 *  no translation for a same-language question). `searching` covers embedding
 *  plus vector search; `generating` is "Answering". */
export interface AskTimings {
  translating_question?: number;
  searching?: number;
  generating?: number;
  translating_answer?: number;
}

/** Ribbon order = how a turn actually runs. The two translation steps share
 *  the "Translating" label (inbound vs outbound is clear from position). */
const SECTIONS: { key: keyof AskTimings; label: string }[] = [
  { key: 'translating_question', label: 'Translating' },
  { key: 'searching', label: 'Searching' },
  { key: 'generating', label: 'Answering' },
  { key: 'translating_answer', label: 'Translating' },
];

/** Stage colour by absolute duration: the slower a stage, the darker its cell.
 *  `dark` cells use on-accent (inverse) text so they stay readable. */
function stageTier(ms: number): { bg: string; dark: boolean } {
  if (ms > 3000) return { bg: 'bg-accent', dark: true }; // > 3s — darkest
  if (ms >= 1500) return { bg: 'bg-accent/60', dark: true }; // 1.5–3s — darker
  return { bg: 'bg-accent/20', dark: false }; // < 1.5s — lighter
}

/** Compact, human-readable duration: "0.9s", "1.4s", or "120ms" when under 1s. */
function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

const ARROW = 6; // chevron depth (px) — shallow for a soft seam
const GAP = 1; // sliver of card background left between cells, as a divider

/** Each cell's right edge points (>) unless it's last; its left edge is notched
 *  unless it's first, so adjacent cells interlock into one continuous ribbon. */
function clipPath(first: boolean, last: boolean): string {
  const notch = first ? '' : `, ${ARROW}px 50%`;
  return last
    ? `polygon(0 0, 100% 0, 100% 100%, 0 100%${notch})`
    : `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%${notch})`;
}

/**
 * Timing breakdown for a knowledge-base test run: an arrow ribbon flowing left
 * to right — a live Total, then one cell per stage that ran. Cells animate in
 * as their timing streams in, and each is shaded by how long that stage took
 * (lighter under 1.5s, darker 1.5–3s, darkest over 3s).
 *
 * The Total cell shows the real end-to-end wall-clock: it ticks up like a
 * stopwatch while `streaming`, then freezes on the elapsed time when the run
 * finishes. It's intentionally the actual time waited — usually a little more
 * than the stage cells sum to, since that gap is network round-trips plus the
 * (un-displayed) language-detection step.
 */
export function TimingRibbon({
  timings,
  streaming,
}: {
  timings: AskTimings;
  streaming: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!streaming) return;
    let start = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    setElapsed(0);
    // Hold at 0 for the first 0.8s — that window is mostly request/connection
    // latency before any work runs, so skipping it keeps the timer closer to
    // the actual processing time rather than overshooting.
    const delay = setTimeout(() => {
      start = Date.now();
      tick = setInterval(() => setElapsed(Date.now() - start), 100);
    }, 800);
    // Freeze on the precise final elapsed so the Total doesn't jump when the
    // 100ms tick stops just short of done.
    return () => {
      clearTimeout(delay);
      if (tick) clearInterval(tick);
      if (start) setElapsed(Date.now() - start);
    };
  }, [streaming]);

  const present = SECTIONS.filter((s) => typeof timings[s.key] === 'number');
  // Show the strip as soon as we start (Total only) so stage cells can animate
  // in without the whole ribbon popping into place; stay hidden when idle.
  if (!streaming && present.length === 0) return null;

  const total = present.reduce((sum, s) => sum + (timings[s.key] ?? 0), 0);
  const cells = [
    { key: '__total__', label: 'Total', value: total, isTotal: true },
    ...present.map((s) => ({ key: s.key, label: s.label, value: timings[s.key] ?? 0, isTotal: false })),
  ];

  return (
    // Scroll horizontally (no visible scrollbar) when the ribbon is wider than
    // the panel on small screens.
    <div className="no-scrollbar overflow-x-auto">
      <div className="inline-flex">
        {cells.map((c, i) => {
          const first = i === 0;
          const last = i === cells.length - 1;
          const tier = c.isTotal ? null : stageTier(c.value);
          const dark = tier?.dark ?? false;
          return (
            <span
              key={c.key}
              className={cn(
                'inline-flex animate-segment-in items-center gap-1.5 py-1 text-[11px]',
                // Rounded outer ends only; the radius clips inside the arrow
                // clip-path, leaving the inner seams sharp.
                first && 'rounded-l-lg',
                last && 'rounded-r-lg',
                c.isTotal ? 'bg-surface text-ink' : cn(tier!.bg, dark ? 'text-on-accent' : 'text-ink'),
              )}
              style={{
                clipPath: clipPath(first, last),
                // Overlap by ARROW so chevrons interlock, but leave GAP of that
                // overlap open, so a sliver of the card background shows through
                // as a natural divider between cells (no filter touching text).
                marginLeft: first ? 0 : -(ARROW - GAP),
                paddingLeft: first ? 12 : ARROW + 10,
                paddingRight: last ? 12 : ARROW + 10,
              }}
            >
              <span className={dark ? 'text-on-accent/80' : 'text-muted'}>{c.label}</span>
              <span className="tabular-nums font-semibold">
                {/* Total = real elapsed (live, then frozen); stages = measured. */}
                {fmtMs(c.isTotal ? elapsed : c.value)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
