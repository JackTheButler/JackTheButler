/**
 * PMS Adapter Interface
 *
 * Defines the contract all PMS adapters must implement.
 * This allows Jack to work with any PMS by simply creating a new adapter.
 */

import type {
  IntegrationSource,
  NormalizedGuest,
  NormalizedReservation,
  NormalizedRoom,
  ReservationQuery,
  PMSEvent,
} from '../types.js';

/**
 * Base PMS adapter interface
 *
 * All PMS providers must implement this interface.
 * Methods return normalized types regardless of the underlying PMS format.
 */
export interface PMSAdapter {
  /**
   * Identifier for this PMS provider
   */
  readonly provider: IntegrationSource;

  /**
   * Check if the adapter is properly configured and can connect
   */
  testConnection(): Promise<boolean>;

  // ==================
  // Reservations
  // ==================

  /**
   * Get a reservation by external ID
   */
  getReservation(externalId: string): Promise<NormalizedReservation | null>;

  /**
   * Get a reservation by confirmation number
   */
  getReservationByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null>;

  /**
   * Search reservations with filters
   */
  searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]>;

  /**
   * Get reservations modified since a given date (for sync)
   */
  getModifiedReservations(since: Date): Promise<NormalizedReservation[]>;

  // ==================
  // Guests
  // ==================

  /**
   * Get a guest by external ID
   */
  getGuest(externalId: string): Promise<NormalizedGuest | null>;

  /**
   * Find guest by phone number
   */
  getGuestByPhone(phone: string): Promise<NormalizedGuest | null>;

  /**
   * Find guest by email
   */
  getGuestByEmail(email: string): Promise<NormalizedGuest | null>;

  /**
   * Search guests by name
   */
  searchGuests(query: string): Promise<NormalizedGuest[]>;

  // ==================
  // Rooms
  // ==================

  /**
   * Get room status
   */
  getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null>;

  /**
   * Get all rooms with current status
   */
  getAllRooms(): Promise<NormalizedRoom[]>;

  // ==================
  // Webhooks (Optional)
  // ==================

  /**
   * Parse an incoming webhook payload into normalized event
   * Not all PMSes support webhooks, so this is optional.
   */
  parseWebhook?(payload: unknown, headers?: Record<string, string>): Promise<PMSEvent | null>;

  /**
   * Verify webhook signature (if PMS supports it)
   */
  verifyWebhookSignature?(payload: string, signature: string): boolean;
}

/**
 * Configuration for PMS adapters
 */
export interface PMSConfig {
  provider: IntegrationSource;
  apiUrl?: string | undefined;
  apiKey?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  propertyId?: string | undefined;
  webhookSecret?: string | undefined;
  // Provider-specific options
  options?: Record<string, unknown> | undefined;
}

/**
 * Factory function type for creating PMS adapters
 */
export type PMSAdapterFactory = (config: PMSConfig) => PMSAdapter;
