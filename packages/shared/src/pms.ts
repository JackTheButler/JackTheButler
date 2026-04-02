/**
 * PMS adapter interface and normalized types.
 *
 * Plugin authors implement PMSAdapter and use these normalized types.
 * Re-exported from the core interfaces so this is the single source of truth.
 *
 * @module shared/pms
 */

import type { ReservationStatus } from './reservation.js';

export type { ReservationStatus };

/**
 * Source identifier for external PMS systems.
 * Open string type so third-party plugins can declare their own source values.
 */
export type IntegrationSource = string;

/**
 * Well-known integration source identifiers.
 */
export const IntegrationSources = {
  MEWS: 'mews',
  CLOUDBEDS: 'cloudbeds',
  OPERA: 'opera',
  APALEO: 'apaleo',
  PROTEL: 'protel',
  MANUAL: 'manual',
  MOCK: 'mock',
} as const;

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
 * PMS Adapter interface — implement this to build a PMS plugin.
 */
export interface PMSAdapter {
  readonly provider: IntegrationSource;
  testConnection(): Promise<boolean>;
  getReservation(externalId: string): Promise<NormalizedReservation | null>;
  getReservationByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null>;
  searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]>;
  getModifiedReservations(since: Date): Promise<NormalizedReservation[]>;
  getGuest(externalId: string): Promise<NormalizedGuest | null>;
  getGuestByPhone(phone: string): Promise<NormalizedGuest | null>;
  getGuestByEmail(email: string): Promise<NormalizedGuest | null>;
  searchGuests(query: string): Promise<NormalizedGuest[]>;
  getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null>;
  getAllRooms(): Promise<NormalizedRoom[]>;
  parseWebhook?(payload: unknown, headers?: Record<string, string>): Promise<PMSEvent | null>;
  verifyWebhookSignature?(payload: string, signature: string): boolean;
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
