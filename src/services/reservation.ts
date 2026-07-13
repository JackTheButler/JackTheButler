/**
 * Reservation Service
 *
 * Read-only queries for reservation lists, today's activity, and reservation detail.
 */

import { eq, and, desc, gte, inArray, sql } from 'drizzle-orm';
import { db, reservations, guests, conversations, tasks } from '@/db/index.js';
import type { Guest, Reservation } from '@/db/schema.js';
import { settingsService } from '@/services/settings.js';
import { NotFoundError } from '@/errors/index.js';
import { now } from '@/utils/time.js';

export interface ReservationGuestSummary {
  id: string;
  firstName: string;
  lastName: string;
  vipStatus: string | null;
  loyaltyTier: string | null;
}

export interface ReservationSummary extends Omit<Reservation, 'specialRequests' | 'notes'> {
  specialRequests: string[];
  notes: string[];
  guest: ReservationGuestSummary | null;
}

export interface TodaySummary {
  date: string;
  arrivals: { count: number; pending: number; checkedIn: number };
  departures: { count: number; checkedOut: number; late: number };
  inHouse: number;
  occupancyRate: number | null;
}

export interface ListReservationsOptions {
  search?: string | undefined;
  status?: string | undefined;
  arrivalFrom?: string | undefined;
  arrivalTo?: string | undefined;
  departureFrom?: string | undefined;
  departureTo?: string | undefined;
  roomNumber?: string | undefined;
  guestId?: string | undefined;
  limit: number;
  offset: number;
}

export interface ListReservationsResult {
  reservations: ReservationSummary[];
  total: number;
}

export interface ReservationDetailGuest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  vipStatus: string | null;
  loyaltyTier: string | null;
  preferences: string[];
}

export interface ReservationDetail extends Omit<Reservation, 'specialRequests' | 'notes'> {
  specialRequests: string[];
  notes: string[];
  guest: ReservationDetailGuest | null;
  _related: {
    conversations: { id: string; channelType: string; state: string; lastMessageAt: string | null }[];
    tasks: { id: string; type: string; description: string; status: string; priority: string }[];
  };
}

function toGuestSummary(guest: Guest | null): ReservationGuestSummary | null {
  if (!guest) return null;
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    vipStatus: guest.vipStatus,
    loyaltyTier: guest.loyaltyTier,
  };
}

function toReservationSummary(reservation: Reservation, guest: Guest | null): ReservationSummary {
  return {
    ...reservation,
    specialRequests: JSON.parse(reservation.specialRequests || '[]'),
    notes: JSON.parse(reservation.notes || '[]'),
    guest: toGuestSummary(guest),
  };
}

export class ReservationService {
  /**
   * Today's arrivals/departures/in-house summary, plus occupancy rate when
   * the hotel_profile setting has a totalRooms value configured.
   */
  async getTodaySummary(): Promise<TodaySummary> {
    const todayStr: string = now().split('T')[0]!;

    const arrivalsResult = await db.select().from(reservations).where(eq(reservations.arrivalDate, todayStr)).all();

    const arrivals = {
      count: arrivalsResult.length,
      pending: arrivalsResult.filter((r) => r.status === 'confirmed').length,
      checkedIn: arrivalsResult.filter((r) => r.status === 'checked_in').length,
    };

    const departuresResult = await db.select().from(reservations).where(eq(reservations.departureDate, todayStr)).all();

    const departures = {
      count: departuresResult.length,
      checkedOut: departuresResult.filter((r) => r.status === 'checked_out').length,
      late: departuresResult.filter((r) => r.status === 'checked_in').length,
    };

    const inHouseResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(and(eq(reservations.status, 'checked_in'), gte(reservations.departureDate, todayStr)))
      .get();

    const hotelProfile = await settingsService.get<{ totalRooms?: number } | null>('hotel_profile', null);
    const totalRooms: number | null = hotelProfile?.totalRooms ?? null;
    const inHouse = inHouseResult?.count || 0;
    const occupancyRate = totalRooms ? Math.round((inHouse / totalRooms) * 100) : null;

    return { date: todayStr, arrivals, departures, inHouse, occupancyRate };
  }

  /**
   * Reservations arriving on the given date, optionally filtered by status.
   */
  async getArrivals(date: string, status?: string | undefined): Promise<ReservationSummary[]> {
    const results = await db
      .select({ reservation: reservations, guest: guests })
      .from(reservations)
      .leftJoin(guests, eq(reservations.guestId, guests.id))
      .where(eq(reservations.arrivalDate, date))
      .orderBy(reservations.estimatedArrival)
      .all();

    const filtered = status ? results.filter((r) => r.reservation.status === status) : results;

    return filtered.map((r) => toReservationSummary(r.reservation, r.guest));
  }

  /**
   * Reservations departing on the given date, optionally filtered by status.
   */
  async getDepartures(date: string, status?: string | undefined): Promise<ReservationSummary[]> {
    const results = await db
      .select({ reservation: reservations, guest: guests })
      .from(reservations)
      .leftJoin(guests, eq(reservations.guestId, guests.id))
      .where(eq(reservations.departureDate, date))
      .orderBy(reservations.estimatedDeparture)
      .all();

    const filtered = status ? results.filter((r) => r.reservation.status === status) : results;

    return filtered.map((r) => toReservationSummary(r.reservation, r.guest));
  }

  /**
   * Currently checked-in guests whose stay has not ended (departure date >= today).
   */
  async getInHouse(): Promise<ReservationSummary[]> {
    const today: string = now().split('T')[0]!;

    const results = await db
      .select({ reservation: reservations, guest: guests })
      .from(reservations)
      .leftJoin(guests, eq(reservations.guestId, guests.id))
      .where(and(eq(reservations.status, 'checked_in'), gte(reservations.departureDate, today)))
      .orderBy(reservations.roomNumber)
      .all();

    return results.map((r) => toReservationSummary(r.reservation, r.guest));
  }

  /**
   * List reservations with guest info, filtered and paginated.
   * Filtering happens in JS to support the free-text search across
   * confirmation number, guest name, and room number.
   */
  async list(options: ListReservationsOptions): Promise<ListReservationsResult> {
    const results = await db
      .select({ reservation: reservations, guest: guests })
      .from(reservations)
      .leftJoin(guests, eq(reservations.guestId, guests.id))
      .orderBy(desc(reservations.arrivalDate))
      .all();

    let filtered = results;

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.reservation.confirmationNumber.toLowerCase().includes(searchLower) ||
          (r.guest && `${r.guest.firstName} ${r.guest.lastName}`.toLowerCase().includes(searchLower)) ||
          (r.reservation.roomNumber && r.reservation.roomNumber.toLowerCase().includes(searchLower))
      );
    }

    if (options.status && options.status !== 'all') {
      filtered = filtered.filter((r) => r.reservation.status === options.status);
    }

    if (options.arrivalFrom) {
      filtered = filtered.filter((r) => r.reservation.arrivalDate >= options.arrivalFrom!);
    }

    if (options.arrivalTo) {
      filtered = filtered.filter((r) => r.reservation.arrivalDate <= options.arrivalTo!);
    }

    if (options.departureFrom) {
      filtered = filtered.filter((r) => r.reservation.departureDate >= options.departureFrom!);
    }

    if (options.departureTo) {
      filtered = filtered.filter((r) => r.reservation.departureDate <= options.departureTo!);
    }

    if (options.roomNumber) {
      filtered = filtered.filter((r) => r.reservation.roomNumber === options.roomNumber);
    }

    if (options.guestId) {
      filtered = filtered.filter((r) => r.reservation.guestId === options.guestId);
    }

    const total = filtered.length;
    const paginated = filtered.slice(options.offset, options.offset + options.limit);

    return { reservations: paginated.map((r) => toReservationSummary(r.reservation, r.guest)), total };
  }

  /**
   * A single reservation with full guest details and related conversations/tasks.
   * Throws NotFoundError if the reservation does not exist.
   */
  async getById(id: string): Promise<ReservationDetail> {
    const result = await db
      .select({ reservation: reservations, guest: guests })
      .from(reservations)
      .leftJoin(guests, eq(reservations.guestId, guests.id))
      .where(eq(reservations.id, id))
      .get();

    if (!result) {
      throw new NotFoundError('Reservation', id);
    }

    const relatedConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.reservationId, id))
      .orderBy(desc(conversations.lastMessageAt))
      .all();

    // Tasks link to conversations, not reservations directly, so we first
    // find the conversation IDs belonging to this reservation's guest, then
    // fetch tasks scoped to that set.
    const guestConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.guestId, result.reservation.guestId))
      .all();

    const guestConversationIds = guestConversations.map((c) => c.id);

    const relatedTasks =
      guestConversationIds.length > 0
        ? await db
            .select()
            .from(tasks)
            .where(inArray(tasks.conversationId, guestConversationIds))
            .orderBy(desc(tasks.createdAt))
            .limit(10)
            .all()
        : [];

    return {
      ...result.reservation,
      specialRequests: JSON.parse(result.reservation.specialRequests || '[]'),
      notes: JSON.parse(result.reservation.notes || '[]'),
      guest: result.guest
        ? {
            id: result.guest.id,
            firstName: result.guest.firstName,
            lastName: result.guest.lastName,
            email: result.guest.email,
            phone: result.guest.phone,
            vipStatus: result.guest.vipStatus,
            loyaltyTier: result.guest.loyaltyTier,
            preferences: JSON.parse(result.guest.preferences || '[]'),
          }
        : null,
      _related: {
        conversations: relatedConversations.map((c) => ({
          id: c.id,
          channelType: c.channelType,
          state: c.state,
          lastMessageAt: c.lastMessageAt,
        })),
        tasks: relatedTasks.map((t) => ({
          id: t.id,
          type: t.type,
          description: t.description,
          status: t.status,
          priority: t.priority,
        })),
      },
    };
  }
}

export const reservationService = new ReservationService();
