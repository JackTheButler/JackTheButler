import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Presentational chat widget. Props in, events out — no network, no theme
 * resolution. It receives an already-resolved `theme`; deciding auto vs
 * prefers-color-scheme vs attribute is the runtime/loader's job (slice 4).
 * Shared by the live embed and the dashboard preview, so it stays logic-free
 * and self-styled (no external CSS).
 */

/* ── MarkdownBody ──────────────────────────────────────────────── */

/**
 * Renders trusted markdown (LLM output) inside a chat bubble. Used for
 * `author === 'ai'` only — customer/agent content stays plain text so a
 * stray `**` never gets interpreted as formatting. Self-styled with inline
 * `components` overrides so it works in both the widget iframe (no
 * Tailwind, no CSS bundle) and the dashboard inbox (Tailwind theme).
 *
 * react-markdown sanitises by default: no raw HTML pass-through, no
 * scripts, autolinking via remark-gfm.
 */
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ margin: '4px 0', paddingLeft: 20, listStyle: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '4px 0', paddingLeft: 20, listStyle: 'decimal' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'inherit', textDecoration: 'underline' }}
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // react-markdown v9 no longer passes an `inline` prop; fenced blocks
    // carry a `language-*` className, inline code has none. Inline gets a
    // small background pill; fenced code lets the surrounding `pre`
    // override paint the block background.
    const isFenced = typeof className === 'string' && className.startsWith('language-');
    return (
      <code
        className={className}
        style={{
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '0.92em',
          background: isFenced ? 'transparent' : 'rgba(127,127,127,0.18)',
          borderRadius: isFenced ? 0 : 4,
          padding: isFenced ? 0 : '0 4px',
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: '6px 0',
        padding: 8,
        borderRadius: 6,
        background: 'rgba(127,127,127,0.14)',
        overflowX: 'auto',
        fontSize: '0.92em',
      }}
    >
      {children}
    </pre>
  ),
  // Headings inside a chat bubble are heavy — render bold paragraphs.
  h1: ({ children }) => <p style={{ margin: '4px 0 2px', fontWeight: 600 }}>{children}</p>,
  h2: ({ children }) => <p style={{ margin: '4px 0 2px', fontWeight: 600 }}>{children}</p>,
  h3: ({ children }) => <p style={{ margin: '4px 0 2px', fontWeight: 600 }}>{children}</p>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '4px 0',
        padding: '0 8px',
        borderLeft: '3px solid rgba(127,127,127,0.4)',
        opacity: 0.92,
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: 0, borderTop: '1px solid rgba(127,127,127,0.3)', margin: '8px 0' }} />
  ),
};

export function MarkdownBody({ children }: { children: string }) {
  return (
    <div
      // `dir="auto"` lets the browser pick LTR/RTL per script-block — invisible
      // for English, correct for Farsi/Arabic/Hebrew content.
      dir="auto"
      style={{
        // Children carry their own margins; this wrapper just contains them
        // so adjacent paragraphs/lists don't collapse outside the bubble.
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export type WidgetTheme = 'light' | 'dark';

export interface WidgetConfig {
  title: string;
  welcomeMessage: string;
  accentColor: string;
  position: 'bottom-right' | 'bottom-left';
}

export interface WidgetMessage {
  id: string;
  author: 'customer' | 'agent' | 'ai';
  content: string;
  /** BCP-47 code of `content`. Optional (locally-added optimistic messages
   *  may not have it; server-served messages do via MessageDTO). */
  language?: string | null;
  /** Customer-language version of an AI / agent reply. When present and the
   *  author isn't `'customer'`, the widget prefers it over `content` so the
   *  customer reads in their own language. */
  translation?: string | null;
  time?: string;
}

export interface ChatWidgetProps {
  config: WidgetConfig;
  /** Already resolved by the runtime — the component just renders it. */
  theme: WidgetTheme;
  messages: WidgetMessage[];
  open: boolean;
  onToggle: () => void;
  onSend: (text: string) => void;
  /** Preview mode: position within the parent instead of the viewport. */
  inline?: boolean;
  /** Fullscreen panel layout. The widget runs inside an iframe whose own
   *  size is loader-controlled, so matchMedia here can't see the device
   *  viewport — the loader passes this in (live) or the preview pane
   *  passes it explicitly (dashboard). Defaults to false. */
  mobile?: boolean;
}

interface Palette {
  panel: string;
  body: string;
  text: string;
  border: string;
  agentBubble: string;
  inputBg: string;
}

const PALETTES: Record<WidgetTheme, Palette> = {
  light: {
    panel: '#ffffff',
    body: '#f7f7f8',
    text: '#1f1f1f',
    border: '#ececec',
    agentBubble: '#ffffff',
    inputBg: '#ffffff',
  },
  dark: {
    panel: '#1f2023',
    body: '#161719',
    text: '#e8e8ea',
    border: '#2e2f33',
    agentBubble: '#26272b',
    inputBg: '#1f2023',
  },
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Pick a readable foreground (dark or white) for text/icons on the accent,
 *  by perceived brightness. Falls back to white on unparseable input. */
function onAccent(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 150 ? '#1f1f1f' : '#ffffff';
}

export function ChatWidget({
  config,
  theme,
  messages,
  open,
  onToggle,
  onSend,
  inline = false,
  mobile = false,
}: ChatWidgetProps) {
  const [draft, setDraft] = useState('');
  const p = PALETTES[theme];
  const fg = onAccent(config.accentColor);
  const side = config.position === 'bottom-left' ? { left: 20 } : { right: 20 };
  const isMobile = mobile;

  // Scroll behaviour. Three rules, matching the chat-widget norm:
  //  1. Opening the panel always lands at the newest turn.
  //  2. While at the bottom, new messages auto-scroll into view.
  //  3. While scrolled up reading history, we DON'T yank — instead we show
  //     a floating "jump to latest" button that the user can click.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : '';

  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // 24px of forgiveness — sub-pixel layout + the gap above the input
    // shouldn't count as "scrolled up".
    const scrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 24;
    setShowJumpDown(scrolledUp);
  };

  const scrollToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpDown(false);
  };

  // Snap on open + on new messages (only if not currently scrolled up).
  // useLayoutEffect avoids a one-frame flash where the panel paints at
  // the top before snapping down.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) {
      wasOpen.current = open;
      return;
    }
    const justOpened = !wasOpen.current;
    wasOpen.current = open;
    if (justOpened) {
      el.scrollTop = el.scrollHeight;
      setShowJumpDown(false);
      return;
    }
    if (!showJumpDown) {
      el.scrollTop = el.scrollHeight;
    }
  }, [open, showJumpDown, lastMessageId, messages.length]);

  // Re-snap on the next paint to catch markdown content that lays out
  // after our synchronous layout effect (long AI replies otherwise land
  // mid-message). Guarded by !showJumpDown so the user reading history
  // stays put.
  useEffect(() => {
    if (!open || showJumpDown) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [open, showJumpDown, lastMessageId, messages.length]);

  // Anchor for both states. In mobile + open, the panel fills its frame
  // (inline parent or viewport) and the launcher's bottom-corner anchor
  // doesn't apply.
  const fullscreen = isMobile && open;
  // Live embed needs near-max z so customer-site CSS can't bury it. Preview
  // (inline) uses a normal stacking value so the dashboard's own portals
  // (Select dropdowns, menus) layer above it correctly.
  const z = inline ? 1 : 2147483000;
  const root: CSSProperties = fullscreen
    ? {
        position: inline ? 'absolute' : 'fixed',
        inset: 0,
        fontFamily: FONT,
        zIndex: z,
      }
    : {
        position: inline ? 'absolute' : 'fixed',
        bottom: 20,
        ...side,
        fontFamily: FONT,
        zIndex: z,
      };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  if (!open) {
    return (
      <div style={root}>
        <WidgetKeyframes />
        <button
          aria-label="Open chat"
          onClick={onToggle}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: config.accentColor,
            color: fg,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            display: 'grid',
            placeItems: 'center',
            // Entrance flourish: subtle scale-up + fade so the launcher
            // doesn't appear as a hard pop when the page loads.
            animation: 'jane-launcher-in 260ms cubic-bezier(0.2, 0.8, 0.3, 1.15)',
            transformOrigin: 'center',
          }}
        >
          <ChatIcon />
        </button>
      </div>
    );
  }

  return (
    <div style={root}>
      <WidgetKeyframes />
      <div
        style={{
          width: fullscreen ? '100%' : 360,
          maxWidth: fullscreen ? 'none' : 'calc(100vw - 40px)',
          height: fullscreen ? '100%' : 520,
          maxHeight: fullscreen ? 'none' : inline ? '100%' : 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: p.panel,
          borderRadius: fullscreen ? 0 : 16,
          overflow: 'hidden',
          boxShadow: fullscreen ? 'none' : '0 12px 40px rgba(0,0,0,0.28)',
          position: 'relative',
        }}
      >
        <header
          style={{
            background: config.accentColor,
            color: fg,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15 }}>{config.title}</span>
          <button
            aria-label="Close chat"
            onClick={onToggle}
            style={{
              background: 'transparent',
              border: 'none',
              color: fg,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onMessagesScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            background: p.body,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <Bubble author="ai" content={config.welcomeMessage} accent={config.accentColor} accentFg={fg} p={p} />
          {messages.map((m) => (
            <Bubble
              key={m.id}
              author={m.author}
              content={m.content}
              translation={m.translation ?? null}
              accent={config.accentColor}
              accentFg={fg}
              p={p}
            />
          ))}
        </div>

        {showJumpDown && (
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Scroll to latest message"
            style={{
              position: 'absolute',
              bottom: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1px solid ${p.border}`,
              background: p.panel,
              color: p.text,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
              zIndex: 1,
              animation: 'jane-fade-in 140ms ease-out',
            }}
          >
            <DownIcon />
          </button>
        )}

        <form
          onSubmit={submit}
          style={{
            display: 'flex',
            gap: 8,
            padding: 12,
            borderTop: `1px solid ${p.border}`,
            background: p.panel,
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            style={{
              flex: 1,
              border: `1px solid ${p.border}`,
              background: p.inputBg,
              color: p.text,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              outline: 'none',
              fontFamily: FONT,
            }}
          />
          <button
            type="submit"
            style={{
              border: 'none',
              borderRadius: 10,
              padding: '0 16px',
              cursor: 'pointer',
              background: config.accentColor,
              color: fg,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({
  author,
  content,
  translation,
  accent,
  accentFg,
  p,
}: {
  author: WidgetMessage['author'];
  content: string;
  translation?: string | null;
  accent: string;
  accentFg: string;
  p: Palette;
}) {
  const mine = author === 'customer';
  // The customer reads their own words back (content). AI/agent replies are
  // surfaced in the customer's language — the pipeline's translateOutbound
  // populates `translation` when the system language ≠ conversation
  // language; we prefer it over `content` for delivery.
  const text = mine ? content : (translation ?? content);
  // Markdown only for AI output. Human authors (customer / agent) stay as
  // plain text so a stray `**` never gets interpreted as formatting.
  const renderMarkdown = author === 'ai';
  return (
    <div
      // `dir="auto"` lets the browser pick LTR / RTL per script — invisible
      // for English, correct for Farsi / Arabic / Hebrew, including the
      // customer's own message bubble.
      dir="auto"
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: mine ? accent : p.agentBubble,
        color: mine ? accentFg : p.text,
        border: mine ? 'none' : `1px solid ${p.border}`,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 14,
        lineHeight: 1.4,
        whiteSpace: renderMarkdown ? 'normal' : 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {renderMarkdown ? <MarkdownBody>{text}</MarkdownBody> : text}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h16v11H7l-3 3V5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Single inline stylesheet for the widget's CSS-only animations. Rendered
 *  in both the closed and open branches so the keyframes are always present
 *  in the DOM (the launcher animation references them on first mount; the
 *  jump-down button references them on appearance). */
function WidgetKeyframes() {
  return (
    <style>{`
      @keyframes jane-launcher-in {
        from { opacity: 0; transform: scale(0.6); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes jane-fade-in {
        from { opacity: 0; transform: translate(-50%, 6px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
    `}</style>
  );
}

function DownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
