/**
 * EntityProvider — resolves the domain entity from an inbound message.
 *
 * Implementations talk to the consumer's user/account/guest store and
 * return whatever shape extends `Entity` (with id at minimum). The
 * pipeline only reads `entity.id`; the rich domain shape is read by
 * the consumer's `PromptProvider` and other vertical code.
 *
 * @module services/entities
 */

import type { Entity } from '../types/entity.js';
import type { InboundMessage } from '../types/messages.js';

export interface EntityProvider {
  /**
   * Resolve the domain entity for an inbound message.
   *
   * Implementations may create a new entity if the inbound identifier is
   * unrecognised (e.g. a phone number sending its first WhatsApp), or
   * return `null` if the channel doesn't carry enough identity to resolve.
   */
  resolve(inbound: InboundMessage): Promise<Entity | null>;

  /**
   * Look up a previously resolved entity by id.
   *
   * Used when the inbound channel can't auto-identify but the conversation
   * already has an `entityId` from a prior message or verification step.
   */
  findById(id: string): Promise<Entity | null>;
}
