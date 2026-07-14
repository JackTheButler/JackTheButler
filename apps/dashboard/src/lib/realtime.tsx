import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

/**
 * One shared dashboard WebSocket, with type-keyed pub/sub on top.
 *
 * The whole app holds a single connection to `/api/app/realtime` (authed
 * via the protected wildcard). Features subscribe to the event types they
 * care about with `useRealtimeEvent(type, handler)` — no central switch,
 * no per-feature sockets. Adding a new realtime feature is one
 * subscription call; it never touches shared plumbing.
 *
 * Server envelope is `{ type, data }` (see core/realtime.ts). Reconnect is
 * automatic with a fixed backoff; subscriptions survive reconnects because
 * the handler registry lives outside the socket lifecycle.
 */

type Handler = (data: unknown) => void;

interface RealtimeBus {
  subscribe(type: string, handler: Handler): () => void;
}

const RealtimeContext = createContext<RealtimeBus | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  // Handler registry persists across reconnects (not tied to the socket).
  const handlers = useRef<Map<string, Set<Handler>>>(new Map());

  // Stable bus identity so subscribing effects don't re-run on every render.
  const bus = useRef<RealtimeBus>({
    subscribe(type, handler) {
      const map = handlers.current;
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(handler);
      return () => {
        map.get(type)?.delete(handler);
      };
    },
  });

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/app/realtime`);
      // Liveness heartbeat: refreshes this agent's server-side presence
      // (lastSeenAt) while the tab stays open. Started on open, stopped on close.
      let ping: ReturnType<typeof setInterval> | undefined;
      ws.onopen = () => {
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 45_000);
      };
      ws.onmessage = (e) => {
        try {
          const { type, data } = JSON.parse(e.data);
          handlers.current.get(type)?.forEach((h) => h(data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (alive) setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      alive = false;
      ws?.close();
    };
  }, []);

  return <RealtimeContext.Provider value={bus.current}>{children}</RealtimeContext.Provider>;
}

/**
 * Subscribe to a realtime event type for the lifetime of the calling
 * component. The handler is held in a ref so re-renders don't churn the
 * subscription. Generic over the payload shape for call-site ergonomics.
 */
export function useRealtimeEvent<T = unknown>(
  type: string,
  handler: (data: T) => void,
): void {
  const bus = useContext(RealtimeContext);
  if (!bus) {
    throw new Error('useRealtimeEvent must be used within <RealtimeProvider>');
  }
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bus.subscribe(type, (data) => ref.current(data as T)), [bus, type]);
}
