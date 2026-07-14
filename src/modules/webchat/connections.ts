/**
 * In-process registry of live widget sockets, keyed by visitorId. Transport
 * state only (no hono import) — the gateway fills it, the event subscription
 * pushes through it. A single visitor may have several tabs open.
 */

type Sink = (data: string) => void;

const byVisitor = new Map<string, Set<Sink>>();

export function addConnection(visitorId: string, sink: Sink): () => void {
  let set = byVisitor.get(visitorId);
  if (!set) {
    set = new Set();
    byVisitor.set(visitorId, set);
  }
  set.add(sink);
  return () => {
    set.delete(sink);
    if (set.size === 0) byVisitor.delete(visitorId);
  };
}

export function pushToVisitor(visitorId: string, data: string): void {
  const set = byVisitor.get(visitorId);
  if (!set) return;
  for (const sink of set) {
    try {
      sink(data);
    } catch {
      /* a dead socket is cleaned up on its own close event */
    }
  }
}
