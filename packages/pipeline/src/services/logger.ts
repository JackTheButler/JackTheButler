/**
 * Logger — structured logging used by every stage.
 *
 * Pino-style: data fields first, optional human-readable message. The
 * consumer wires up their preferred logger (pino, winston, console, …)
 * by implementing this interface.
 *
 * @module services/logger
 */

import type { LogFields } from '../types/logger.js';

export interface Logger {
  debug(fields: LogFields, message?: string): void;
  info(fields: LogFields, message?: string): void;
  warn(fields: LogFields, message?: string): void;
  error(fields: LogFields, message?: string): void;
}
