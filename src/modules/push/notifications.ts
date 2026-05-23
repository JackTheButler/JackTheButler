import { events } from '@/core/events.js';
import { getConversationMeta } from '@/modules/conversations/service.js';
import { sendToStaff } from '@/modules/push/service.js';

/**
 * Domain wiring for push notifications: subscribes to bus events and maps each
 * to recipients + copy, then hands off to the transport (push/service.ts).
 *
 * This is the layer to EXTEND for new notification use cases — add an
 * `events.on(...)` block here and call sendToStaff / broadcastToActiveStaff.
 * The transport stays untouched.
 *
 * Idempotent: registers once per process.
 */

let registered = false;

const PREVIEW_MAX = 140;
const preview = (text: string): string =>
  text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;

export function registerPushNotifications(): void {
  if (registered) return;
  registered = true;

  // A customer replied. Only act on threads a human owns — while the AI is
  // handling a thread (mode 'ai') we stay quiet.
  events.on('message.created', (e) => {
    if (e.message.author !== 'customer') return;
    const meta = getConversationMeta(e.conversationId);
    if (!meta || meta.mode !== 'human') return;

    const payload = {
      title: 'New message',
      body: preview(e.message.content),
      tag: e.conversationId, // collapse repeats per conversation + across tabs
      url: `/?c=${e.conversationId}`, // deep link: opens this thread on click
      data: { conversationId: e.conversationId },
    } as const;

    if (meta.assignedAgentId) {
      // Owned thread → ping the assigned agent.
      void sendToStaff(meta.assignedAgentId, payload);
    }
    // FUTURE: when an AI→human handoff/escalation event exists, alert the whole
    // team via the already-exported broadcast helper, e.g.:
    //   events.on('conversation.handoff', (e) =>
    //     broadcastToActiveStaff({ title: 'Needs a human', body: …, tag: e.conversationId }));
  });
}
