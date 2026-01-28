/**
 * Mock PMS Adapter
 *
 * In-memory PMS adapter for testing and development.
 * Can be seeded with test data.
 */

import type { PMSAdapter, PMSConfig } from '../adapter.js';
import type {
  NormalizedGuest,
  NormalizedReservation,
  NormalizedRoom,
  ReservationQuery,
  PMSEvent,
  PMSEventType,
} from '../../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('pms:mock');

export class MockPMSAdapter implements PMSAdapter {
  readonly provider = 'mock' as const;

  private reservations = new Map<string, NormalizedReservation>();
  private guests = new Map<string, NormalizedGuest>();
  private rooms = new Map<string, NormalizedRoom>();
  private guestByPhone = new Map<string, string>(); // phone -> guestId
  private guestByEmail = new Map<string, string>(); // email -> guestId
  private reservationByConfirmation = new Map<string, string>(); // confirmation -> reservationId

  constructor(_config: PMSConfig) {
    log.info('Mock PMS adapter initialized');
    this.seedDefaultData();
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  // ==================
  // Reservations
  // ==================

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    return this.reservations.get(externalId) || null;
  }

  async getReservationByConfirmation(confirmationNumber: string): Promise<NormalizedReservation | null> {
    const id = this.reservationByConfirmation.get(confirmationNumber);
    if (!id) return null;
    return this.reservations.get(id) || null;
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    let results = Array.from(this.reservations.values());

    if (query.arrivalFrom) {
      results = results.filter((r) => r.arrivalDate >= query.arrivalFrom!);
    }
    if (query.arrivalTo) {
      results = results.filter((r) => r.arrivalDate <= query.arrivalTo!);
    }
    if (query.status) {
      results = results.filter((r) => r.status === query.status);
    }
    if (query.roomNumber) {
      results = results.filter((r) => r.roomNumber === query.roomNumber);
    }
    if (query.guestPhone) {
      results = results.filter((r) => r.guest.phone === query.guestPhone);
    }
    if (query.guestEmail) {
      results = results.filter((r) => r.guest.email === query.guestEmail);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getModifiedReservations(_since: Date): Promise<NormalizedReservation[]> {
    // In mock, return all reservations
    return Array.from(this.reservations.values());
  }

  // ==================
  // Guests
  // ==================

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    return this.guests.get(externalId) || null;
  }

  async getGuestByPhone(phone: string): Promise<NormalizedGuest | null> {
    // Normalize phone for lookup
    const normalized = phone.replace(/\D/g, '');
    const guestId = this.guestByPhone.get(normalized);
    if (!guestId) return null;
    return this.guests.get(guestId) || null;
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    const guestId = this.guestByEmail.get(email.toLowerCase());
    if (!guestId) return null;
    return this.guests.get(guestId) || null;
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.guests.values()).filter(
      (g) =>
        g.firstName.toLowerCase().includes(lowerQuery) ||
        g.lastName.toLowerCase().includes(lowerQuery) ||
        g.email?.toLowerCase().includes(lowerQuery)
    );
  }

  // ==================
  // Rooms
  // ==================

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    return this.rooms.get(roomNumber) || null;
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    return Array.from(this.rooms.values());
  }

  // ==================
  // Webhooks
  // ==================

  async parseWebhook(payload: unknown): Promise<PMSEvent | null> {
    // Mock webhook format
    const data = payload as {
      type: PMSEventType;
      reservation?: NormalizedReservation;
      guest?: NormalizedGuest;
      room?: NormalizedRoom;
    };

    if (!data.type) return null;

    const eventData: PMSEvent['data'] = {};
    if (data.reservation) eventData.reservation = data.reservation;
    if (data.guest) eventData.guest = data.guest;
    if (data.room) eventData.room = data.room;

    return {
      type: data.type,
      source: 'mock',
      timestamp: new Date().toISOString(),
      data: eventData,
    };
  }

  // ==================
  // Test Helpers
  // ==================

  /**
   * Seed the mock adapter with test data
   */
  seed(data: {
    guests?: NormalizedGuest[];
    reservations?: NormalizedReservation[];
    rooms?: NormalizedRoom[];
  }): void {
    if (data.guests) {
      for (const guest of data.guests) {
        this.addGuest(guest);
      }
    }
    if (data.reservations) {
      for (const res of data.reservations) {
        this.addReservation(res);
      }
    }
    if (data.rooms) {
      for (const room of data.rooms) {
        this.rooms.set(room.number, room);
      }
    }
    log.info(
      {
        guests: this.guests.size,
        reservations: this.reservations.size,
        rooms: this.rooms.size,
      },
      'Mock PMS seeded'
    );
  }

  /**
   * Add a single guest
   */
  addGuest(guest: NormalizedGuest): void {
    this.guests.set(guest.externalId, guest);
    if (guest.phone) {
      this.guestByPhone.set(guest.phone.replace(/\D/g, ''), guest.externalId);
    }
    if (guest.email) {
      this.guestByEmail.set(guest.email.toLowerCase(), guest.externalId);
    }
  }

  /**
   * Add a single reservation
   */
  addReservation(reservation: NormalizedReservation): void {
    this.reservations.set(reservation.externalId, reservation);
    this.reservationByConfirmation.set(reservation.confirmationNumber, reservation.externalId);
    // Also add the guest
    this.addGuest(reservation.guest);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.reservations.clear();
    this.guests.clear();
    this.rooms.clear();
    this.guestByPhone.clear();
    this.guestByEmail.clear();
    this.reservationByConfirmation.clear();
  }

  /**
   * Seed with default test data
   */
  private seedDefaultData(): void {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const formatDate = (d: Date): string => d.toISOString().split('T')[0]!;

    this.seed({
      guests: [
        {
          externalId: 'pms-guest-001',
          source: 'mock',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          phone: '+14155551234',
          language: 'en',
          loyaltyTier: 'Gold',
          preferences: [
            { category: 'room', value: 'High floor' },
            { category: 'pillow', value: 'Firm' },
          ],
        },
        {
          externalId: 'pms-guest-002',
          source: 'mock',
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah.j@example.com',
          phone: '+14155555678',
          language: 'en',
          vipStatus: 'VIP',
        },
      ],
      reservations: [
        {
          externalId: 'pms-res-001',
          source: 'mock',
          confirmationNumber: 'CONF123456',
          guest: {
            externalId: 'pms-guest-001',
            source: 'mock',
            firstName: 'John',
            lastName: 'Smith',
            email: 'john.smith@example.com',
            phone: '+14155551234',
            language: 'en',
            loyaltyTier: 'Gold',
          },
          roomNumber: '415',
          roomType: 'Deluxe King',
          arrivalDate: formatDate(today),
          departureDate: formatDate(nextWeek),
          status: 'checked_in',
          adults: 2,
          children: 0,
          rateCode: 'BAR',
          totalRate: 1750.0,
          currency: 'USD',
          specialRequests: ['Late checkout if available', 'Extra pillows'],
        },
        {
          externalId: 'pms-res-002',
          source: 'mock',
          confirmationNumber: 'CONF789012',
          guest: {
            externalId: 'pms-guest-002',
            source: 'mock',
            firstName: 'Sarah',
            lastName: 'Johnson',
            email: 'sarah.j@example.com',
            phone: '+14155555678',
            language: 'en',
            vipStatus: 'VIP',
          },
          roomNumber: '302',
          roomType: 'Suite',
          arrivalDate: formatDate(tomorrow),
          departureDate: formatDate(nextWeek),
          status: 'confirmed',
          adults: 1,
          children: 0,
          rateCode: 'CORP',
          totalRate: 2100.0,
          currency: 'USD',
        },
      ],
      rooms: [
        { number: '302', type: 'Suite', status: 'clean', floor: '3' },
        { number: '415', type: 'Deluxe King', status: 'occupied', floor: '4', currentReservationId: 'pms-res-001' },
        { number: '416', type: 'Deluxe King', status: 'dirty', floor: '4' },
        { number: '501', type: 'Presidential Suite', status: 'clean', floor: '5' },
      ],
    });
  }
}
