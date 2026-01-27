/**
 * Logger - Structured logging with Pino
 *
 * Provides consistent, structured logging across the application.
 * - JSON output in production
 * - Pretty output in development
 * - Child loggers for component-specific logging
 */

import pino from 'pino';
import type { Logger } from 'pino';
import { loadConfig, isDev } from '@/config/index.js';

const config = loadConfig();

/**
 * Transport configuration for development (pretty printing)
 */
const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

/**
 * Main application logger
 */
export const logger: Logger = pino(
  isDev()
    ? {
        level: config.log.level,
        transport: devTransport,
        base: {
          app: 'jack',
          version: '0.5.0',
        },
        formatters: {
          level: (label) => ({ level: label }),
        },
      }
    : {
        level: config.log.level,
        base: {
          app: 'jack',
          version: '0.5.0',
        },
        formatters: {
          level: (label) => ({ level: label }),
        },
      }
);

/**
 * Create a child logger for a specific component
 *
 * @param component - Component name (e.g., 'gateway', 'db', 'ai')
 * @returns Logger instance with component context
 *
 * @example
 * const log = createLogger('gateway');
 * log.info('Server started');
 * // Output: {"level":"info","component":"gateway","msg":"Server started"}
 */
export function createLogger(component: string): Logger {
  return logger.child({ component });
}

/**
 * Log levels for reference:
 * - trace: Very detailed debugging information
 * - debug: Debugging information
 * - info: General operational information
 * - warn: Warning conditions
 * - error: Error conditions
 * - fatal: System is unusable
 */
