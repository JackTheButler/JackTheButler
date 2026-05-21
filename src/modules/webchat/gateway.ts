import type { Env, Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { AppError } from '@/core/errors.js';
import { events } from '@/core/events.js';
import { ingestInboundMessage } from '@/modules/conversations/service.js';
import { assertWidgetAccess } from '@/modules/webchat/service.js';
import { addConnection, pushToVisitor } from '@/modules/webchat/connections.js';

/**
 * Public WebSocket gateway for the widget. Transport/wiring layer (hono +
 * @hono/node-ws) — not service.ts, so the no-hono guardrail holds. Outbound
 * is event-driven: services emit, this pushes; nothing socket-aware leaks
 * into the conversation logic.
 */

// Set up once on import: agent/AI messages → connected widget sockets.
events.on('message.created', (p) => {
  if (p.channel !== 'webchat') return;
  if (p.message.author === 'customer') return; // the sender already has it
  pushToVisitor(p.channelExternalId, JSON.stringify({ type: 'message', message: p.message }));
});

// "Someone is typing" (AI pre-generation, or an agent in the inbox) → widget
// shows the indicator until the reply lands. Same frame for both sources.
const pushTyping = (p: { channel: string; channelExternalId: string }) => {
  if (p.channel !== 'webchat') return;
  pushToVisitor(p.channelExternalId, JSON.stringify({ type: 'typing' }));
};
events.on('assistant.typing', pushTyping);
events.on('staff.typing', pushTyping);

export function registerWebchatSocket<E extends Env>(
  app: Hono<E>,
  upgradeWebSocket: UpgradeWebSocket,
): void {
  app.get(
    '/widget/socket',
    async (c, next) => {
      const origin = c.req.query('host') ?? c.req.header('origin') ?? null;
      const visitorId = c.req.query('visitorId') ?? '';
      try {
        assertWidgetAccess(origin);
      } catch (e) {
        return c.text('forbidden', e instanceof AppError ? 403 : 500);
      }
      if (!visitorId) return c.text('bad_request', 400);
      return next();
    },
    upgradeWebSocket((c) => {
      const visitorId = c.req.query('visitorId') ?? '';
      let remove = () => {};
      return {
        onOpen(_evt, ws) {
          remove = addConnection(visitorId, (data) => ws.send(data));
        },
        onMessage(evt) {
          try {
            const data = JSON.parse(String(evt.data));
            if (typeof data?.content === 'string' && data.content.trim()) {
              ingestInboundMessage({
                channel: 'webchat',
                externalId: visitorId,
                content: data.content,
              });
            }
          } catch {
            /* ignore malformed frames */
          }
        },
        onClose() {
          remove();
        },
      };
    }),
  );
}
