import { useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Presentational chat widget. Props in, events out — no network, no theme
 * resolution. It receives an already-resolved `theme`; deciding auto vs
 * prefers-color-scheme vs attribute is the runtime/loader's job (slice 4).
 * Shared by the live embed and the dashboard preview, so it stays logic-free
 * and self-styled (no external CSS).
 */

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
}: ChatWidgetProps) {
  const [draft, setDraft] = useState('');
  const p = PALETTES[theme];
  const fg = onAccent(config.accentColor);
  const side = config.position === 'bottom-left' ? { left: 20 } : { right: 20 };

  const root: CSSProperties = {
    position: inline ? 'absolute' : 'fixed',
    bottom: 20,
    ...side,
    fontFamily: FONT,
    zIndex: 2147483000,
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
          }}
        >
          <ChatIcon />
        </button>
      </div>
    );
  }

  return (
    <div style={root}>
      <div
        style={{
          width: 360,
          maxWidth: 'calc(100vw - 40px)',
          height: 520,
          maxHeight: inline ? '100%' : 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: p.panel,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
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
              accent={config.accentColor}
              accentFg={fg}
              p={p}
            />
          ))}
        </div>

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
  accent,
  accentFg,
  p,
}: {
  author: WidgetMessage['author'];
  content: string;
  accent: string;
  accentFg: string;
  p: Palette;
}) {
  const mine = author === 'customer';
  return (
    <div
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
        background: mine ? accent : p.agentBubble,
        color: mine ? accentFg : p.text,
        border: mine ? 'none' : `1px solid ${p.border}`,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 14,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
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
