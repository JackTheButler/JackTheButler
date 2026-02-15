/**
 * PMS Adapter Interface
 *
 * Defines the contract all PMS (Property Management System) adapters must implement.
 * This is part of the kernel - business logic depends on this interface,
 * not on concrete implementations (Mews, Cloudbeds, Opera, etc.).
 *
 * @module core/interfaces/pms
 */

/**
 * Source identifier for external systems
 */
export type IntegrationSource = 'mews' | 'cloudbeds' | 'opera' | 'apaleo' | 'protel' | 'manual' | 'mock';

/**
 * Guest preference
 */
export interface GuestPreference {
  category: string;
  value: string;
}

/**
 * Normalized guest from any PMS
 */
export interface NormalizedGuest {
  externalId: string;
  source: IntegrationSource;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  language?: string;
  nationality?: string;
  loyaltyTier?: string;
  vipStatus?: string;
  preferences?: GuestPreference[];
  notes?: string;
}

/**
 * Reservation status normalized across PMSes
 */
export type ReservationStatus =
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

/**
 * Normalized reservation from any PMS
 */
export interface NormalizedReservation {
  externalId: string;
  source: IntegrationSource;
  confirmationNumber: string;
  guest: NormalizedGuest;
  roomNumber?: string;
  roomType: string;
  arrivalDate: string; // ISO date
  departureDate: string; // ISO date
  status: ReservationStatus;
  adults: number;
  children: number;
  rateCode?: string;
  totalRate?: number;
  currency?: string;
  specialRequests?: string[];
  notes?: string[];
}

/**
 * Room status
 */
export type RoomStatus = 'vacant' | 'occupied' | 'dirty' | 'clean' | 'inspected' | 'out_of_order';

/**
 * Normalized room from any PMS
 */
export interface NormalizedRoom {
  number: string;
  type: string;
  status: RoomStatus;
  floor?: string;
  currentGuestId?: string;
  currentReservationId?: string;
}

/**
 * PMS event types for webhooks
 */
export type PMSEventType =
  | 'reservation.created'
  | 'reservation.updated'
  | 'reservation.cancelled'
  | 'guest.checked_in'
  | 'guest.checked_out'
  | 'guest.updated'
  | 'room.status_changed';

/**
 * Normalized PMS event (for inbound webhooks)
 */
export interface PMSEvent {
  type: PMSEventType;
  source: IntegrationSource;
  timestamp: string;
  data: {
    reservation?: NormalizedReservation;
    guest?: NormalizedGuest;
    room?: NormalizedRoom;
    previousStatus?: string;
    newStatus?: string;
  };
}

/**
 * Query parameters for reservation search
 */
export interface ReservationQuery {
  arrivalFrom?: string;
  arrivalTo?: string;
  departureFrom?: string;
  departureTo?: string;
  modifiedSince?: Date;
  status?: ReservationStatus;
  roomNumber?: string;
  guestPhone?: string;
  guestEmail?: string;
  limit?: number;
}

/**
 * PMS Adapter interface
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

/**
 * Sync result tracking
 */
export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorDetails?: Array<{ id: string; error: string }>;
}
