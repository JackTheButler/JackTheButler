/**
 * Plugin interface types.
 *
 * These are the public types plugin authors depend on from @jack/shared.
 * This file has zero external imports — @jack/shared is types-only.
 *
 * @module shared/apps
 */

/**
 * Instrumentation logger injected into every plugin via PluginContext.
 * Wraps outbound calls with structured logging to the database.
 */
export type AppLogger = <T>(
  eventType: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>
) => Promise<T>;

/**
 * Context injected into every plugin factory by the registry.
 * Plugins receive this rather than importing createAppLogger directly.
 *
 * @example
 * class MyAdapter {
 *   readonly appLog: AppLogger;
 *   constructor(config: MyConfig, context: PluginContext) {
 *     this.appLog = context.appLog;
 *   }
 * }
 */
export interface PluginContext {
  appLog: AppLogger;
}

/**
 * Operator plugin configuration (jack.config.ts).
 * Deployment-time decision — separate from runtime dashboard configuration.
 */
export interface JackConfig {
  /**
   * List of plugin package names or local paths to load at startup.
   * Each must export a { manifest } object conforming to AnyAppManifest.
   * Example: '@jack-plugins/pms-mews' or './packages/pms-mews/src/index.js'
   */
  plugins: string[];
}
