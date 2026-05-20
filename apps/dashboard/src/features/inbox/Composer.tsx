import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsRight, Send, Bot } from 'lucide-react';
import { cn } from '@/components/ui';

const KNOB = 32; // h-8 w-8
const PAD = 4; // left-1
const THRESHOLD = 0.6;

/**
 * One persistent composer with two states:
 *  - AI:    slate bar collapsed; the round knob (arrow) sits left and is
 *           dragged right across the row to take over.
 *  - Human: knob rests right as the Send button; the row is the text input;
 *           the slate bar slides up into view.
 * "Hand back to AI" reverses the same elements (no cross-fade).
 */
export function Composer({
  human,
  onTakeOver,
  onHandBack,
  onSend,
  translateHint,
}: {
  human: boolean;
  onTakeOver: () => void;
  onHandBack: () => void;
  onSend: (text: string) => void;
  /** Set when the conversation language differs from the business default
   *  — staff types in the default, the server translates before delivery.
   *  Renders a small unobtrusive note inside the active composer. */
  translateHint?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [draft, setDraft] = useState('');
  const draggingRef = useRef(false);
  draggingRef.current = dragging;

  const maxX = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - KNOB - PAD * 2);

  useLayoutEffect(() => {
    if (!draggingRef.current) setX(human ? maxX() : 0);
    const id = requestAnimationFrame(() => setAnimate(true));
    const ro = new ResizeObserver(() => {
      if (!draggingRef.current) setX(human ? maxX() : 0);
    });
    if (trackRef.current) ro.observe(trackRef.current);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [human]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (human) return; // knob is the Send button in human state
    startX.current = e.clientX - x;
    setDragging(true);
  };

  // Window-level listeners while dragging so a release outside the knob —
  // including outside the section or the browser window — still resolves
  // the drag. `setPointerCapture` is unreliable for releases outside the
  // viewport on some browsers; window listeners always fire.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      setX(Math.min(Math.max(0, e.clientX - startX.current), maxX()));
    };
    const finish = (cancelled: boolean) => {
      setDragging(false);
      setX((current) => {
        if (!cancelled && current >= maxX() * THRESHOLD) {
          onTakeOver();
          return maxX();
        }
        return 0;
      });
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragging, onTakeOver]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-staff/30">
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          human ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 bg-staff-soft px-3 py-1.5">
            <span className="inline-flex min-w-0 items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-staff opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-staff" />
              </span>
              <span className="truncate font-semibold text-staff">
                You're handling<span className="hidden sm:inline"> this chat</span>
              </span>
            </span>
            <button
              onClick={onHandBack}
              aria-label="Hand back to AI"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-staff transition-colors hover:underline"
            >
              <Bot size={12} />
              Hand <span className="hidden sm:inline">back </span>to AI
            </button>
          </div>
        </div>
      </div>

      {human && translateHint && (
        <div className="border-t border-staff/20 bg-staff-soft/40 px-3 py-1 text-[11px] text-muted">
          {translateHint}
        </div>
      )}

      <div ref={trackRef} className="relative flex h-11 items-center bg-panel">
        {human ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a reply…"
            className="h-full flex-1 bg-transparent pl-3 pr-12 text-sm outline-none placeholder:text-muted"
          />
        ) : (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-muted"
            style={{ opacity: dragging ? 0.4 : 1 }}
          >
            Slide to take over
          </span>
        )}

        <button
          type="button"
          aria-label={human ? 'Send' : 'Slide to take over'}
          onClick={human ? send : undefined}
          onPointerDown={onPointerDown}
          className={cn(
            'absolute left-1 top-1/2 grid h-8 w-8 touch-none place-items-center rounded-lg bg-accent text-on-accent',
            !dragging && animate && 'transition-transform duration-200 ease-out',
            human ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
          )}
          style={{ transform: `translate(${x}px, -50%)` }}
        >
          {human ? <Send size={15} /> : <ChevronsRight size={16} />}
        </button>
      </div>
    </div>
  );
}
