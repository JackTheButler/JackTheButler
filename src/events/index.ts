/**
 * Event System
 *
 * Centralized event emitter for application-wide events.
 * Used for decoupled communication between components.
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@/utils/logger.js';
import type { AppEvent, EventType, EventHandler } from '@/types/events.js';

const log = createLogger('events');

/**
 * Typed event emitter for application events
 */
class TypedEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners for busy systems
    this.emitter.setMaxListeners(50);
  }

  /**
   * Emit an event
   */
  emit<T extends AppEvent>(event: T): boolean {
    log.debug({ type: event.type }, 'Event emitted');
    return this.emitter.emit(event.type, event);
  }

  /**
   * Subscribe to an event type
   */
  on<T extends AppEvent>(type: EventType, handler: EventHandler<T>): this {
    this.emitter.on(type, handler as EventHandler);
    log.debug({ type }, 'Event handler registered');
    return this;
  }

  /**
   * Subscribe to an event type (once)
   */
  once<T extends AppEvent>(type: EventType, handler: EventHandler<T>): this {
    this.emitter.once(type, handler as EventHandler);
    return this;
  }

  /**
   * Unsubscribe from an event type
   */
  off<T extends AppEvent>(type: EventType, handler: EventHandler<T>): this {
    this.emitter.off(type, handler as EventHandler);
    return this;
  }

  /**
   * Remove all listeners for an event type
   */
  removeAllListeners(type?: EventType): this {
    this.emitter.removeAllListeners(type);
    return this;
  }

  /**
   * Get listener count for an event type
   */
  listenerCount(type: EventType): number {
    return this.emitter.listenerCount(type);
  }
}

/**
 * Global event emitter instance
 */
export const events = new TypedEventEmitter();

/**
 * Re-export event types for convenience
 */
export { EventTypes } from '@/types/events.js';
export type { AppEvent, EventType, EventHandler } from '@/types/events.js';
