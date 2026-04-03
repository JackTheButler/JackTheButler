/**
 * DemoOrbit
 *
 * Cal.com-style orbital animation showing Jack at the centre with channel
 * icons (WhatsApp, Email, SMS) orbiting around it. Used on the register page
 * in demo mode to communicate value before sign-up.
 *
 * Centre pill: icon sweeps right to wipe the current word, word swaps while
 * hidden, icon sweeps back left revealing the new word. The pill itself
 * animates its width to fit each word as it is revealed.
 */

import { useState, useEffect, useRef } from 'react';

const ORBIT_RADIUS = 110;
const DURATION = '20s';
const CONTAINER = 260;

const ICONS = [
  { src: '/icons/whatsapp.svg', label: 'WhatsApp', angle: 0,   bgClass: 'jack-icon-bg-wa' },
  { src: '/icons/email.svg',    label: 'Email',    angle: 120, bgClass: 'jack-icon-bg-em' },
  { src: '/icons/smartphone.svg', label: 'SMS',    angle: 240, bgClass: 'jack-icon-bg-sms' },
];

const RINGS = [220, 160, 100];

// Words to cycle — edit order here
const WORDS = [
  'JACK IS ON 24x7',
  'MESSAGING GUEST',
  'EARNING REVIEWS',
  'EXTENDING STAY',
  'KEYLESS ACCESS',
  'BILLING GUEST',
  'SYNCING TO PMS',
];

const PILL_HEIGHT = 36;
const ICON_AREA = 38; // overlay idle width
const PILL_PAD_L = 41; // left padding (space for icon)
const PILL_PAD_R = 20; // right padding

const IDLE_MS = 2500;
const COVER_MS = 550;
const HIDDEN_MS = 120;
const REVEAL_MS = 550;

type Phase = 'idle' | 'covering' | 'hidden' | 'revealing';

/** Measure the pixel width each word needs for the pill. */
function measureWordWidths(): number[] {
  const span = document.createElement('span');
  span.style.cssText =
    'font-size:0.875rem;font-weight:600;position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;top:-9999px';
  document.body.appendChild(span);
  const widths = WORDS.map((word) => {
    span.textContent = word;
    return span.offsetWidth + PILL_PAD_L + PILL_PAD_R;
  });
  document.body.removeChild(span);
  return widths;
}

export function DemoOrbit() {
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [spinKey, setSpinKey] = useState(0);
  const [wordWidths, setWordWidths] = useState<number[]>([]);
  const [pillWidth, setPillWidth] = useState(100); // explicit px, animated

  // Snapshot of pillWidth at the moment covering started — used as overlay target
  const coverWidthRef = useRef(pillWidth);

  // Measure all words once on mount
  useEffect(() => {
    const widths = measureWordWidths();
    setWordWidths(widths);
    setPillWidth(widths[0] ?? 100);
  }, []);

  // Phase state machine
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;

    if (phase === 'idle') {
      t = setTimeout(() => {
        coverWidthRef.current = pillWidth; // snapshot before word changes
        setSpinKey((k) => k + 1);
        setPhase('covering');
      }, IDLE_MS);
    } else if (phase === 'covering') {
      t = setTimeout(() => {
        const nextIdx = (wordIdx + 1) % WORDS.length;
        setWordIdx(nextIdx);
        setPillWidth(wordWidths[nextIdx] ?? pillWidth); // pill starts resizing
        setPhase('hidden');
      }, COVER_MS);
    } else if (phase === 'hidden') {
      t = setTimeout(() => setPhase('revealing'), HIDDEN_MS);
    } else {
      t = setTimeout(() => setPhase('idle'), REVEAL_MS);
    }

    return () => clearTimeout(t);
  }, [phase, pillWidth, wordIdx, wordWidths]);

  const overlayWidth =
    phase === 'covering' || phase === 'hidden' ? coverWidthRef.current : ICON_AREA;

  const overlayTransition =
    phase === 'covering' || phase === 'revealing'
      ? `width ${phase === 'covering' ? COVER_MS : REVEAL_MS}ms ease-in-out`
      : 'none';

  return (
    <>
      <style>{`
        @keyframes jack-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes jack-counter {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes jack-wipe-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes jack-pill-gradient {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .jack-pill-bg {
          background: linear-gradient(270deg, #dbeafe, #ede9fe, #cffafe, #d1fae5, #dbeafe);
          background-size: 300% 300%;
          animation: jack-pill-gradient 4s ease infinite;
        }
        .jack-icon-bg-wa {
          background: linear-gradient(270deg, #d1fae5, #a7f3d0, #bbf7d0, #d1fae5);
          background-size: 300% 300%;
          animation: jack-pill-gradient 4s ease infinite;
        }
        .jack-icon-bg-em {
          background: linear-gradient(270deg, #dbeafe, #bfdbfe, #c7d2fe, #dbeafe);
          background-size: 300% 300%;
          animation: jack-pill-gradient 4s ease infinite 1.3s;
        }
        .jack-icon-bg-sms {
          background: linear-gradient(270deg, #ede9fe, #ddd6fe, #fce7f3, #ede9fe);
          background-size: 300% 300%;
          animation: jack-pill-gradient 4s ease infinite 2.6s;
        }
      `}</style>

      <div className="relative flex-shrink-0" style={{ width: CONTAINER, height: CONTAINER }}>
        {/* Decorative concentric rings */}
        {RINGS.map((size) => (
          <div
            key={size}
            className="absolute rounded-full border border-primary-foreground/20"
            style={{
              width: size,
              height: size,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {/* Rotating orbit wrapper */}
        <div
          className="absolute"
          style={{
            top: '50%',
            left: '50%',
            width: 0,
            height: 0,
            animationName: 'jack-orbit',
            animationDuration: DURATION,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        >
          {ICONS.map(({ src, label, angle, bgClass }) => {
            const rad = (angle * Math.PI) / 180;
            const x = Math.round(ORBIT_RADIUS * Math.sin(rad));
            const y = Math.round(-ORBIT_RADIUS * Math.cos(rad));
            const SIZE = 40;
            return (
              <div
                key={label}
                className="absolute"
                style={{
                  left: x,
                  top: y,
                  width: SIZE,
                  height: SIZE,
                  marginLeft: -SIZE / 2,
                  marginTop: -SIZE / 2,
                }}
              >
                <div
                  className={`${bgClass} w-full h-full rounded-full border border-primary-foreground/20 flex items-center justify-center shadow-sm`}
                  style={{
                    animationName: 'jack-counter',
                    animationDuration: DURATION,
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                  }}
                >
                  <img src={src} alt={label} className="w-6 h-6 object-contain" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Centre pill — explicit pixel width, animates on word change */}
        <div
          className="jack-pill-bg absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10
                     border border-primary-foreground/20 rounded-full shadow-sm overflow-hidden"
          style={{
            width: pillWidth,
            height: PILL_HEIGHT,
            transition: `width ${REVEAL_MS}ms ease-in-out`,
          }}
        >
          {/* Text — always rendered at PILL_PAD_L offset */}
          <div className="absolute inset-0 flex items-center" style={{ paddingLeft: PILL_PAD_L }}>
            <span className="text-sm font-semibold text-gray-900 select-none whitespace-nowrap">
              {WORDS[wordIdx]}
            </span>
          </div>

          {/* White overlay — sweeps right to cover, left to reveal */}
          <div
            className="absolute left-0 top-0 bottom-0 flex items-center justify-end"
            style={{ width: overlayWidth, transition: overlayTransition, paddingRight: 4,
                     backdropFilter: 'blur(6px)', borderRadius: 9999 }}
          >
            <img
              key={spinKey}
              src="/favicon.svg"
              alt="Jack"
              className="flex-shrink-0 object-contain"
              style={{
                width: 16,
                height: 16,
                animationName: phase === 'covering' ? 'jack-wipe-spin' : 'none',
                animationDuration: `${COVER_MS}ms`,
                animationTimingFunction: 'ease-in-out',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
