import { cn } from '@/components/ui';

/**
 * Jane's mark that morphs into a hamburger menu and back. The "J" outline
 * becomes the top bar; the two eyes stretch into the middle and bottom bars.
 *
 * Two modes:
 *  - Controlled (default): drive it with `open`. Closed = Jane's face,
 *    open = hamburger. Use it as the glyph inside a real menu button.
 *  - `autoLoop`: ignores `open` and runs the original 20s choreography
 *    (hold face, morph to menu, hold, morph back) for decorative/demo use.
 *
 * Self-contained: colours follow `currentColor`, keyframes/transitions are
 * scoped under `.jane-menu`, and `prefers-reduced-motion` is honoured.
 *
 * Note: the morph animates the SVG `d` property, which Chrome/Edge/Safari
 * (incl. mobile) support but Firefox does not — there it snaps between states.
 */
export function JaneMenuIcon({
  open = false,
  autoLoop = false,
  loops,
  size = 20,
  /** Morph duration in ms for the controlled mode. */
  duration = 350,
  className,
}: {
  open?: boolean;
  autoLoop?: boolean;
  /** Cap the auto-loop at N iterations (settles on the face). Omit for endless. */
  loops?: number;
  size?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('jane-menu', className)}
      data-open={open ? 'true' : 'false'}
      data-autoloop={autoLoop ? 'true' : 'false'}
      style={{
        ['--jm-dur' as string]: `${duration}ms`,
        ...(loops != null && { ['--jm-loops' as string]: String(loops) }),
      }}
    >
      <style>{STYLES}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* The "J" outline / top bar. */}
        <path className="jm-face" d="M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50" />
        {/* Left eye / middle bar. */}
        <path className="jm-eye jm-left" d="M 36,34 L 36,34 A 6,6 0 0,1 36,46 L 36,46 A 6,6 0 0,1 36,34 Z" />
        {/* Right eye / bottom bar. */}
        <path className="jm-eye jm-right" d="M 64,34 L 64,34 A 6,6 0 0,1 64,46 L 64,46 A 6,6 0 0,1 64,34 Z" />
      </svg>
    </span>
  );
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const STYLES = `
.jane-menu { display: inline-flex; }
.jane-menu svg { display: block; }

.jane-menu .jm-face {
  fill: none; stroke: currentColor; stroke-width: 12;
  stroke-linejoin: miter; stroke-linecap: butt;
}
.jane-menu .jm-eye { fill: currentColor; stroke: none; }

/* ---- Controlled morph (default) ---- */
.jane-menu .jm-face,
.jane-menu .jm-eye {
  transition: d var(--jm-dur, 350ms) ${EASE}, stroke-linecap 0s;
}
/* Resting (face) state — declared in CSS so the open state can transition from it. */
.jane-menu .jm-face  { d: path("M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50"); }
.jane-menu .jm-left  { d: path("M 36,34 L 36,34 A 6,6 0 0,1 36,46 L 36,46 A 6,6 0 0,1 36,34 Z"); }
.jane-menu .jm-right { d: path("M 64,34 L 64,34 A 6,6 0 0,1 64,46 L 64,46 A 6,6 0 0,1 64,34 Z"); }

/* Open (hamburger) state — same path command structure as resting, so d interpolates cleanly. */
.jane-menu[data-open="true"] .jm-face  { d: path("M 79,15 L 79,15 L 79,15 A 0,0 0 0,1 21,15"); stroke-linecap: round; }
.jane-menu[data-open="true"] .jm-left  { d: path("M 21,44 L 79,44 A 6,6 0 0,1 79,56 L 21,56 A 6,6 0 0,1 21,44 Z"); }
.jane-menu[data-open="true"] .jm-right { d: path("M 21,79 L 79,79 A 6,6 0 0,1 79,91 L 21,91 A 6,6 0 0,1 21,79 Z"); }

/* ---- Auto-loop mode: the original 20s choreography, ignoring \`open\`. ---- */
.jane-menu[data-autoloop="true"] .jm-face,
.jane-menu[data-autoloop="true"] .jm-eye { transition: none; }
.jane-menu[data-autoloop="true"] .jm-face  { animation: jm-loop-face 20s var(--jm-loops, infinite); }
.jane-menu[data-autoloop="true"] .jm-right { animation: jm-loop-right 20s var(--jm-loops, infinite); }
.jane-menu[data-autoloop="true"] .jm-left  { animation: jm-loop-left 20s var(--jm-loops, infinite); }

/* 0–45% hold face, 45–50% morph to menu, 50–95% hold menu, 95–100% morph back. */
@keyframes jm-loop-face {
  0%, 45% {
    d: path("M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50");
    stroke-dasharray: 185 200; stroke-linecap: butt;
    animation-timing-function: ${EASE};
  }
  46.25%, 47.49% {
    d: path("M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50");
    stroke-dasharray: 35 200; stroke-linecap: butt;
  }
  47.5% {
    d: path("M 79,15 L 79,15 L 79,15 A 0,0 0 0,1 56,15");
    stroke-dasharray: 185 200; stroke-linecap: round;
    animation-timing-function: ${EASE};
  }
  49%, 95% {
    d: path("M 79,15 L 79,15 L 79,15 A 0,0 0 0,1 21,15");
    stroke-dasharray: 185 200; stroke-linecap: round;
    animation-timing-function: ${EASE};
  }
  96.5%, 97.49% {
    d: path("M 79,15 L 79,15 L 79,15 A 0,0 0 0,1 56,15");
    stroke-dasharray: 185 200; stroke-linecap: round;
  }
  97.5% {
    d: path("M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50");
    stroke-dasharray: 35 200; stroke-linecap: butt;
    animation-timing-function: ${EASE};
  }
  99%, 100% {
    d: path("M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50");
    stroke-dasharray: 185 200; stroke-linecap: butt;
  }
}
@keyframes jm-loop-right {
  0%, 45%        { d: path("M 64,34 L 64,34 A 6,6 0 0,1 64,46 L 64,46 A 6,6 0 0,1 64,34 Z"); animation-timing-function: ${EASE}; }
  46.25%, 47.5%  { d: path("M 64,79 L 64,79 A 6,6 0 0,1 64,91 L 64,91 A 6,6 0 0,1 64,79 Z"); animation-timing-function: ${EASE}; }
  49%, 95%       { d: path("M 21,79 L 79,79 A 6,6 0 0,1 79,91 L 21,91 A 6,6 0 0,1 21,79 Z"); animation-timing-function: ${EASE}; }
  96.5%, 97.75%  { d: path("M 64,79 L 64,79 A 6,6 0 0,1 64,91 L 64,91 A 6,6 0 0,1 64,79 Z"); animation-timing-function: ${EASE}; }
  99%, 100%      { d: path("M 64,34 L 64,34 A 6,6 0 0,1 64,46 L 64,46 A 6,6 0 0,1 64,34 Z"); }
}
@keyframes jm-loop-left {
  0%, 45%        { d: path("M 36,34 L 36,34 A 6,6 0 0,1 36,46 L 36,46 A 6,6 0 0,1 36,34 Z"); }
  46.25%         { d: path("M 36,34 L 36,34 A 6,6 0 0,1 36,46 L 36,46 A 6,6 0 0,1 36,34 Z"); animation-timing-function: ${EASE}; }
  47.5%          { d: path("M 36,44 L 36,44 A 6,6 0 0,1 36,56 L 36,56 A 6,6 0 0,1 36,44 Z"); animation-timing-function: ${EASE}; }
  49%, 95%       { d: path("M 21,44 L 79,44 A 6,6 0 0,1 79,56 L 21,56 A 6,6 0 0,1 21,44 Z"); animation-timing-function: ${EASE}; }
  96.5%          { d: path("M 36,44 L 36,44 A 6,6 0 0,1 36,56 L 36,56 A 6,6 0 0,1 36,44 Z"); animation-timing-function: ${EASE}; }
  97.75%, 100%   { d: path("M 36,34 L 36,34 A 6,6 0 0,1 36,46 L 36,46 A 6,6 0 0,1 36,34 Z"); }
}

@media (prefers-reduced-motion: reduce) {
  .jane-menu .jm-face,
  .jane-menu .jm-eye { transition: none !important; animation: none !important; }
}
`;
