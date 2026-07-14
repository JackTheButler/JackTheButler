import { cn } from '@/components/ui';

/**
 * Jane's animated loading mark: the "J" face with a scanning glow line,
 * thinking eyes, and a pulsing label. Self-contained — colours follow the
 * current text colour (`currentColor`, set here to `text-ink`) so it themes
 * with the dashboard's light/dark toggle, and the keyframes are scoped under
 * `.jane-loader` so they can't collide. Honours `prefers-reduced-motion`.
 */
export function JaneLoader({
  label,
  size = 120,
  float = true,
  className,
}: {
  /** Optional caption under the mark (with pulsing dots). Omit for just the mark. */
  label?: string;
  size?: number;
  /** The gentle up/down bob. Off for small inline use, where a fixed-px float
   *  is proportionally large and reads as jumpy. */
  float?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('jane-loader flex flex-col items-center gap-7 text-ink', !float && 'jl-still', className)}
      role="status"
      aria-label={label ? `${label}…` : 'Loading'}
    >
      <style>{STYLES}</style>

      <svg
        className="jl-svg"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* The "J" face — draws itself, then exits, on a loop. */}
        <path className="jl-j" pathLength="100" d="M 50,15 L 85,15 L 85,50 A 35,35 0 0,1 15,50" />
        <g className="jl-eyes">
          <circle className="jl-eye jl-eye-l" cx="36" cy="40" r="6" />
          <circle className="jl-eye jl-eye-r" cx="64" cy="40" r="6" />
        </g>
      </svg>

      {label && (
        <div className="flex items-center text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          {label}
          <span className="jl-dots ml-1 inline-flex w-[26px]">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      )}
    </div>
  );
}

const STYLES = `
.jane-loader .jl-svg { animation: jl-float 4s ease-in-out infinite; }
.jane-loader.jl-still .jl-svg { animation: none; }
.jane-loader .jl-j {
  fill: none; stroke: currentColor; stroke-width: 12;
  stroke-linecap: butt; stroke-linejoin: miter;
  stroke-dasharray: 100;
  animation: jl-draw 2s infinite;
}
.jane-loader .jl-eyes { animation: jl-look 7s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
.jane-loader .jl-eye { fill: currentColor; animation: jl-blink 4.5s infinite; }
.jane-loader .jl-eye-l { transform-origin: 36px 40px; }
.jane-loader .jl-eye-r { transform-origin: 64px 40px; }
.jane-loader .jl-dots span { display: inline-block; opacity: 0.3; animation: jl-dot 1.5s infinite; }
.jane-loader .jl-dots span:nth-child(2) { animation-delay: 0.3s; }
.jane-loader .jl-dots span:nth-child(3) { animation-delay: 0.6s; }

@keyframes jl-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes jl-draw {
  0%, 7%      { stroke-dashoffset: 0; animation-timing-function: cubic-bezier(0.5, 0, 1, 1); }   /* drawn, hold, then accelerate out */
  40%         { stroke-dashoffset: -100; }                                                       /* wiped out through the end */
  40.1%, 60%  { stroke-dashoffset: 100; animation-timing-function: cubic-bezier(0, 0, 0.2, 1); } /* jump to hidden, hold, then decelerate in */
  93%, 100%   { stroke-dashoffset: 0; }                                                          /* fully drawn again */
}
@keyframes jl-look {
  0%, 15%   { transform: translate(0, 0); }
  18%, 35%  { transform: translate(-4px, 1px); }
  38%, 55%  { transform: translate(3px, -2px); }
  58%, 75%  { transform: translate(-2px, -1px); }
  78%, 100% { transform: translate(0, 0); }
}
@keyframes jl-blink { 0%, 46%, 50%, 100% { transform: scaleY(1); } 48% { transform: scaleY(0.1); } }
@keyframes jl-dot { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }

@media (prefers-reduced-motion: reduce) {
  .jane-loader .jl-svg,
  .jane-loader .jl-j,
  .jane-loader .jl-eyes,
  .jane-loader .jl-eye,
  .jane-loader .jl-dots span { animation: none; }
}
`;
