import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  MATCH_THRESHOLD_MIN as MIN,
  MATCH_THRESHOLD_MAX as MAX,
  MATCH_THRESHOLD_STEP as STEP,
} from './useKnowledge';

const LOOSE_MAX = 0.35; // below this → Loose
const STRICT_MIN = 0.5; // at/above this → Strict

type Zone = 'Loose' | 'Balanced' | 'Strict';

const ZONES: Zone[] = ['Loose', 'Balanced', 'Strict'];

const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
const clampStep = (v: number) =>
  Number(Math.min(MAX, Math.max(MIN, Math.round(v / STEP) * STEP)).toFixed(2));
const zoneOf = (v: number): Zone => (v < LOOSE_MAX ? 'Loose' : v >= STRICT_MIN ? 'Strict' : 'Balanced');

/** Continuous match-strictness control. Drags/keys update a local draft for
 *  smoothness; `onCommit` fires once on release (pointer-up / key-up) so we
 *  don't hammer the save endpoint mid-drag. */
export function StrictnessSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Adopt server value when it changes and we're not mid-interaction.
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  const zone = zoneOf(draft);
  const looseStop = pct(LOOSE_MAX); // 30%
  const strictStop = pct(STRICT_MIN); // 60%

  const commit = (v: number) => {
    if (v !== value) onCommit(v);
  };

  const draftFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return draft;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return clampStep(MIN + ratio * (MAX - MIN));
  };

  const onDown = (e: PointerEvent) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(draftFromClientX(e.clientX));
  };
  const onMove = (e: PointerEvent) => {
    if (dragging.current) setDraft(draftFromClientX(e.clientX));
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    commit(draftFromClientX(e.clientX));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setDraft((v) => clampStep(v - STEP));
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      setDraft((v) => clampStep(v + STEP));
      e.preventDefault();
    }
  };
  const onKeyUp = () => commit(draft);

  // Monochrome track: accent at three opacity steps — darker = stricter.
  const gradient = `linear-gradient(to right,
    rgb(var(--accent) / 0.10) 0 ${looseStop}%,
    rgb(var(--accent) / 0.20) ${looseStop}% ${strictStop}%,
    rgb(var(--accent) / 0.32) ${strictStop}% 100%)`;

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium">Match strictness</div>
          <div className="mt-0.5 text-xs text-muted">
            How closely a customer's question must match an entry before the AI uses it. Looser
            returns more entries, including rough matches; stricter returns fewer, only the closest.
          </div>
        </div>
        <div className="flex w-[7.5rem] shrink-0 items-baseline justify-end gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">{draft.toFixed(2)}</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-ink">
            {zone}
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative mt-5 h-3 cursor-pointer touch-none rounded-full"
        style={{ background: gradient }}
      >
        <div className="absolute top-0 h-full w-px bg-line" style={{ left: `${looseStop}%` }} />
        <div className="absolute top-0 h-full w-px bg-line" style={{ left: `${strictStop}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Match strictness"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={draft}
          aria-valuetext={`${draft.toFixed(2)} — ${zone}`}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-panel shadow outline-none ring-accent ring-offset-2 ring-offset-panel focus-visible:ring-2"
          style={{ left: `${pct(draft)}%` }}
        />
      </div>

      {/* Zone legend — widths mirror each zone's share of the track */}
      <div className="mt-3 flex text-xs">
        <ZoneLabel name={ZONES[0]} active={zone === 'Loose'} basis={looseStop} align="left" />
        <ZoneLabel
          name={ZONES[1]}
          active={zone === 'Balanced'}
          basis={strictStop - looseStop}
          align="center"
        />
        <ZoneLabel name={ZONES[2]} active={zone === 'Strict'} basis={100 - strictStop} align="right" />
      </div>
    </div>
  );
}

function ZoneLabel({
  name,
  active,
  basis,
  align,
}: {
  name: Zone;
  active: boolean;
  basis: number;
  align: 'left' | 'center' | 'right';
}) {
  return (
    <div
      style={{ flexBasis: `${basis}%` }}
      className={`min-w-0 ${align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'} ${
        active ? 'font-semibold text-ink' : 'text-muted'
      }`}
    >
      {name}
    </div>
  );
}
