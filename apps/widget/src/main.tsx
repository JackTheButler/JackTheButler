import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChatWidget,
  type WidgetConfig,
  type WidgetMessage,
  type WidgetTheme,
} from '@janetheoperator/widget-ui';

/**
 * Iframe runtime: composes the presentational ChatWidget with live behaviour
 * (history fetch, WebSocket, send, theme from the parent loader). Same-origin
 * with the API, so all calls are relative. visitorId/host/theme come from the
 * loader via the URL hash; theme changes arrive via postMessage.
 */

const params = new URLSearchParams(location.hash.slice(1));
const visitorId = params.get('visitorId') ?? '';
const host = params.get('host') ?? '';
const q = `visitorId=${encodeURIComponent(visitorId)}&host=${encodeURIComponent(host)}`;

function post(msg: unknown) {
  parent.postMessage(msg, '*');
}

function App() {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<WidgetTheme>(
    (params.get('theme') as WidgetTheme) || 'light',
  );
  // Mobile state is loader-driven (only the host page can see the device
  // viewport — matchMedia inside the iframe reflects the iframe's own size
  // and is meaningless). Seeded from the hash, updated via `jane:viewport`.
  const [mobile, setMobile] = useState(params.get('mobile') === '1');
  const [typing, setTyping] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/widget/config?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c) =>
        setConfig({
          title: c.title,
          welcomeMessage: c.welcomeMessage,
          accentColor: c.accentColor,
          position: c.position,
        }),
      )
      .catch(() => {});

    fetch(`/widget/messages?${q}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});

    let alive = true;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/widget/socket?${q}`);
      ws.current = sock;
      sock.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.type === 'message' && data.message) {
            setMessages((m) => [...m, data.message]);
            // Reply landed → stop the typing indicator.
            if (typingTimer.current) clearTimeout(typingTimer.current);
            setTyping(false);
          } else if (data?.type === 'typing') {
            setTyping(true);
            // Auto-clear after a pause: covers an errored AI turn and a staff
            // member who types then stops without sending. Refreshed on each
            // typing ping while they're active.
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 10000);
          }
        } catch {
          /* ignore */
        }
      };
      sock.onclose = () => {
        if (alive) setTimeout(connect, 2000);
      };
    };
    connect();

    const onParent = (e: MessageEvent) => {
      if (e.data?.type === 'jane:theme') setTheme(e.data.theme);
      if (e.data?.type === 'jane:viewport') setMobile(!!e.data.mobile);
    };
    window.addEventListener('message', onParent);
    post({ type: 'jane:ready' });

    return () => {
      alive = false;
      window.removeEventListener('message', onParent);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      ws.current?.close();
    };
  }, []);

  useEffect(() => {
    post({ type: 'jane:resize', open });
  }, [open]);

  if (!config) return null;

  return (
    <ChatWidget
      inline
      mobile={mobile}
      config={config}
      theme={theme}
      messages={messages}
      isTyping={typing}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      onSend={(text) => {
        setMessages((m) => [
          ...m,
          { id: `local-${Date.now()}`, author: 'customer', content: text },
        ]);
        ws.current?.send(JSON.stringify({ content: text }));
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
