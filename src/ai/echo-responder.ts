/**
 * Echo Responder
 *
 * Simple responder for testing that echoes back the received message.
 */

import type { Conversation } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/services/guest-context.js';
import type { Response, Responder } from './types.js';
import type { KnowledgeSearchResult } from './knowledge/index.js';

/**
 * Echo responder for testing
 * Simply echoes back the received message.
 */
export class EchoResponder implements Responder {
  async generate(
    _conversation: Conversation,
    message: InboundMessage,
    guestContext?: GuestContext,
    _knowledgeResults?: KnowledgeSearchResult[]
  ): Promise<Response> {
    // Include guest name in echo if available
    const greeting = guestContext?.guest ? `Hello ${guestContext.guest.firstName}! ` : '';
    return {
      content: `${greeting}Echo: ${message.content}`,
      confidence: 1.0,
      intent: 'echo',
    };
  }
}
