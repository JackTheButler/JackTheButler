import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsRight, Send, Bot, Sparkles } from 'lucide-react';
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
  onTyping,
  translateHint,
  onAskCopilot,
  prefill,
  autoFocus = false,
}: {
  human: boolean;
  onTakeOver: () => void;
  onHandBack: () => void;
  onSend: (text: string, translate: boolean) => void;
  /** Called (throttled) while the agent types, so the customer's widget shows
   *  a typing indicator. */
  onTyping?: () => void;
  /** Set when the conversation language differs from the business default
   *  — staff types in the default, the server translates before delivery.
   *  Renders the translate checkbox in the composer footer. */
  translateHint?: string;
  /** Opens the KB copilot (retrieval + draft). Shown as a footer action. */
  onAskCopilot?: () => void;
  /** A copilot-generated reply to drop into the input. Wrapped in an object so
   *  a new reference signals each insert (even if the text repeats). */
  prefill?: { text: string } | null;
  /** Focus the input when in human mode. Off while the thread isn't the visible
   *  view (e.g. the mobile conversation list) so we don't pop the keyboard. */
  autoFocus?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const startX = useRef(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [draft, setDraft] = useState('');
  // Whether to translate this reply into the customer's language (only relevant
  // when `translateHint` is shown, i.e. languages differ). Default on.
  const [translate, setTranslate] = useState(true);
  const draggingRef = useRef(false);
  draggingRef.current = dragging;

  // Drop a copilot-generated reply into the input. Runs only when a new
  // `prefill` object arrives (not on every render), so it won't clobber edits.
  useEffect(() => {
    if (prefill) setDraft(prefill.text);
  }, [prefill]);

  // Auto-grow the textarea with its content (up to a cap, then it scrolls) so a
  // multi-line reply — especially a copilot draft — is readable, not a single
  // scrolling line.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, human]);

  // Focus the composer only when it's the visible view (see `autoFocus`) — never
  // while it's the off-screen thread behind the mobile conversation list.
  useEffect(() => {
    if (human && autoFocus) textareaRef.current?.focus();
  }, [human, autoFocus]);

  // Throttle the typing broadcast — one ping per keystroke burst, not per
  // keypress. The widget's own timeout clears the indicator after a pause.
  const lastTyping = useRef(0);
  const pingTyping = () => {
    if (!onTyping) return;
    const now = Date.now();
    if (now - lastTyping.current > 2500) {
      lastTyping.current = now;
      onTyping();
    }
  };

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
    onSend(text, translate);
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
            <span className="ml-1 inline-flex min-w-0 items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-staff opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-staff" />
              </span>
              <span className="truncate font-semibold text-staff">You're handling</span>
            </span>
            <button
              onClick={onHandBack}
              aria-label="Hand back to AI"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-staff transition-colors hover:underline"
            >
              <Bot size={12} />
              Back to AI
            </button>
          </div>
        </div>
      </div>

      <div ref={trackRef} className="relative flex min-h-[2.75rem] items-center bg-panel">
        {human ? (
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              pingTyping();
            }}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a reply…"
            className="flex-1 resize-none bg-transparent py-2.5 pl-3 pr-12 text-sm leading-snug outline-none placeholder:text-muted"
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
            'absolute left-1 grid h-8 w-8 touch-none place-items-center rounded-lg bg-accent text-on-accent',
            // Bottom-aligned in human mode (so a tall draft keeps Send reachable);
            // vertically centred while sliding to take over. For a one-line draft
            // the two coincide, so takeover stays smooth.
            human ? 'bottom-1.5' : 'top-1/2',
            !dragging && animate && 'transition-transform duration-200 ease-out',
            human ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
          )}
          style={{ transform: human ? `translateX(${x}px)` : `translate(${x}px, -50%)` }}
        >
          {human ? <Send size={15} /> : <ChevronsRight size={16} />}
        </button>
      </div>

      {human && (translateHint || onAskCopilot) && (
        <div className="flex items-center justify-between gap-2 border-t border-staff/20 bg-staff-soft/40 px-3 py-1 text-[11px]">
          {translateHint ? (
            <label className="flex cursor-pointer select-none items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={translate}
                onChange={(e) => setTranslate(e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              {translateHint}
            </label>
          ) : (
            <span />
          )}
          {onAskCopilot && (
            <button
              type="button"
              onClick={() => onAskCopilot()}
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-staff transition-colors hover:underline"
            >
              <Sparkles size={12} />
              Ask Copilot
            </button>
          )}
        </div>
      )}
    </div>
  );
}
