/**
 * Jack The Butler — Plugin Starter
 *
 * This is a fully annotated example PMS plugin. Copy this package, rename it,
 * and replace the implementation with your actual PMS integration.
 *
 * The only import you need is @jackthebutler/shared — never import from Jack's core.
 *
 * Steps to create your own plugin:
 * 1. Copy this package to packages/pms-yourpms/ (or a separate repo)
 * 2. Update package.json: name, description, add any SDK dependencies
 * 3. Replace StarterAdapter with your real implementation
 * 4. Update the manifest: id, name, description, configSchema
 * 5. Add to root package.json as `"@jackthebutler/pms-yourpms": "workspace:*"` and run: pnpm install
 * 6. Run: pnpm typecheck
 */

import type {
  // Manifest type for PMS plugins
  PMSAppManifest,

  // Implement this interface on your adapter class
  PMSAdapter,

  // Types for the data your adapter returns
  NormalizedGuest,
  NormalizedReservation,
  NormalizedRoom,
  PMSEvent,
  ReservationQuery,

  // Logging — received via PluginContext, never imported directly
  AppLogger,
  PluginContext,
} from '@jackthebutler/shared';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Define the shape of your plugin's configuration.
 * These fields map 1:1 to the configSchema entries in the manifest below.
 */
export interface StarterConfig {
  apiKey: string;
  baseUrl?: string;
  propertyId?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Your adapter class must implement both PMSAdapter and BaseProvider.
 *
 * PMSAdapter  — the data methods Jack calls to fetch reservations, guests, rooms
 * BaseProvider — requires readonly appLog and testConnection()
 */
export class StarterAdapter implements PMSAdapter {
  // Required for instrumentation — always assign from context.appLog
  readonly appLog: AppLogger;

  // Required by PMSAdapter — identifies which PMS this data came from
  readonly provider = 'starter';

  private config: StarterConfig;

  constructor(config: StarterConfig, context: PluginContext) {
    // Always assign appLog from the injected context — never call createAppLogger directly
    this.appLog = context.appLog;
    this.config = config;
  }

  // ── BaseProvider ────────────────────────────────────────────────────────────

  /**
   * Called when the hotel admin clicks "Test Connection" in the dashboard.
   * Make a lightweight API call to verify credentials are valid.
   *
   * Wrap every outbound call with this.appLog() — this powers the System Health
   * dashboard. The signature is: appLog(operation, metadata, () => promise)
   */
  // PMSAdapter.testConnection returns boolean (true = connected, false = failed)
  async testConnection(): Promise<boolean> {
    try {
      await this.appLog('connection_test', { baseUrl: this.config.baseUrl }, async () => {
        // Replace with a real lightweight call to your PMS API
        await fetch(`${this.config.baseUrl ?? 'https://api.example.com'}/ping`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── PMSAdapter ──────────────────────────────────────────────────────────────

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation', { externalId }, async () => {
      // Replace with real API call
      // Return null when not found, throw on unexpected errors
      return null;
    });
  }

  async getReservationByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation_by_confirmation', { confirmationNumber }, async () => {
      return null;
    });
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    return this.appLog('search_reservations', { query }, async () => {
      return [];
    });
  }

  async getModifiedReservations(since: Date): Promise<NormalizedReservation[]> {
    return this.appLog('get_modified_reservations', { since }, async () => {
      return [];
    });
  }

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest', { externalId }, async () => {
      return null;
    });
  }

  async getGuestByPhone(phone: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest_by_phone', { phone }, async () => {
      return null;
    });
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest_by_email', { email }, async () => {
      return null;
    });
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    return this.appLog('search_guests', { query }, async () => {
      return [];
    });
  }

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    return this.appLog('get_room_status', { roomNumber }, async () => {
      return null;
    });
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    return this.appLog('get_all_rooms', {}, async () => {
      return [];
    });
  }

  /**
   * Optional — implement if your PMS sends webhooks.
   * Parse the raw webhook payload into a normalized PMSEvent.
   * Return null for events you don't handle.
   */
  async parseWebhook(payload: unknown, _headers?: Record<string, string>): Promise<PMSEvent | null> {
    void payload;
    return null;
  }

  /**
   * Optional — implement if your PMS signs webhooks.
   * Return true if the signature is valid, false otherwise.
   */
  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStarterAdapter(config: StarterConfig, context: PluginContext): StarterAdapter {
  return new StarterAdapter(config, context);
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * The manifest is the contract between your plugin and Jack's registry.
 *
 * id          — unique across all plugins, used as the database key
 * configSchema — defines the form fields shown in the dashboard
 * createAdapter — factory called by the registry when the hotel admin activates the plugin
 */
export const manifest: PMSAppManifest = {
  id: 'pms-starter',
  name: 'Starter PMS',
  category: 'pms',
  version: '1.0.0',
  description: 'Example PMS plugin — replace with your real integration',
  icon: '🏨',
  docsUrl: 'https://jackthebutler.com/docs/plugins',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Your PMS API key',
    },
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: false,
      placeholder: 'https://api.yourpms.com',
      description: 'API base URL (leave empty for default)',
    },
    {
      key: 'propertyId',
      label: 'Property ID',
      type: 'text',
      required: false,
      description: 'Your property identifier in the PMS',
    },
    {
      key: 'stalenessThreshold',
      label: 'Cache Staleness (seconds)',
      type: 'number',
      required: false,
      default: 300,
      description: 'Seconds before cached data is considered stale',
    },
    {
      key: 'syncInterval',
      label: 'Sync Interval (seconds)',
      type: 'number',
      required: false,
      default: 3600,
      description: 'Seconds between background sync runs',
    },
  ],
  features: {
    reservations: true,
    guests: true,
    rooms: true,
    webhooks: false,
  },
  createAdapter: (config, context) => createStarterAdapter(config as unknown as StarterConfig, context),
};

/**
 * Default export — convenience for manual imports.
 * Jack's loader calls: const { manifest } = await import('@jackthebutler/your-plugin')
 */
export default { manifest };
