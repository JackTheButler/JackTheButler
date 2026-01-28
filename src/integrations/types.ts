/**
 * Integration Types
 *
 * Normalized types for external system integrations.
 * All PMS/external data gets converted to these internal types.
 */

/**
 * Source identifier for external systems
 */
export type IntegrationSource = 'mews' | 'cloudbeds' | 'opera' | 'apaleo' | 'manual' | 'mock';

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

export interface GuestPreference {
  category: string;
  value: string;
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
 * Sync result tracking
 */
export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorDetails?: Array<{ id: string; error: string }>;
}
