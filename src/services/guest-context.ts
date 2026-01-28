/**
 * Guest Context Service
 *
 * Matches incoming conversations with guests and their reservations.
 * Provides rich context for AI responses.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, reservations, conversations } from '@/db/index.js';
import type { Guest, Reservation } from '@/db/schema.js';
import { createLogger } from '@/utils/logger.js';
import { guestService, normalizePhone } from './guest.js';

const log = createLogger('guest-context');

/**
 * Guest context for AI responses
 */
export interface GuestContext {
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    language: string;
    loyaltyTier: string | null;
    vipStatus: string | null;
    preferences: Array<{ category: string; value: string }>;
  } | null;
  reservation: {
    id: string;
    confirmationNumber: string;
    roomNumber: string | null;
    roomType: string;
    arrivalDate: string;
    departureDate: string;
    status: string;
    specialRequests: string[];
    isCheckedIn: boolean;
    stayDuration: number;
    daysRemaining: number;
  } | null;
  conversationHistory: {
    totalMessages: number;
    previousTopics: string[];
  };
}

/**
 * Guest Context Service
 */
export class GuestContextService {
  /**
   * Get or create guest context from a phone number
   */
  async getContextByPhone(phone: string): Promise<GuestContext> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return this.emptyContext();
    }

    const guest = await guestService.findByPhone(normalized);
    if (!guest) {
      return this.emptyContext();
    }

    return this.buildContext(guest);
  }

  /**
   * Get or create guest context from an email
   */
  async getContextByEmail(email: string): Promise<GuestContext> {
    const guest = await guestService.findByEmail(email);
    if (!guest) {
      return this.emptyContext();
    }

    return this.buildContext(guest);
  }

  /**
   * Get guest context from a conversation
   */
  async getContextByConversation(conversationId: string): Promise<GuestContext> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation || !conversation.guestId) {
      return this.emptyContext();
    }

    const guest = await guestService.findById(conversation.guestId);
    if (!guest) {
      return this.emptyContext();
    }

    return this.buildContext(guest, conversationId);
  }

  /**
   * Match a conversation to a guest and reservation
   * Updates the conversation with guest/reservation IDs
   */
  async matchConversation(
    conversationId: string,
    identifier: { phone?: string; email?: string }
  ): Promise<{ guestId: string | null; reservationId: string | null }> {
    let guest: Guest | null = null;

    // Find guest by phone or email
    if (identifier.phone) {
      const normalized = normalizePhone(identifier.phone);
      if (normalized) {
        guest = await guestService.findByPhone(normalized);

        // Create guest if not found
        if (!guest) {
          guest = await guestService.findOrCreateByPhone(normalized);
        }
      }
    } else if (identifier.email) {
      guest = await guestService.findByEmail(identifier.email);
    }

    if (!guest) {
      return { guestId: null, reservationId: null };
    }

    // Find active reservation for guest
    const reservation = await this.findActiveReservation(guest.id);

    // Update conversation with guest and reservation
    const updates: { guestId?: string; reservationId?: string | null; updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    updates.guestId = guest.id;
    if (reservation) {
      updates.reservationId = reservation.id;
    }

    await db.update(conversations).set(updates).where(eq(conversations.id, conversationId));

    log.info(
      {
        conversationId,
        guestId: guest.id,
        reservationId: reservation?.id ?? null,
      },
      'Matched conversation to guest'
    );

    return {
      guestId: guest.id,
      reservationId: reservation?.id ?? null,
    };
  }

  /**
   * Build full guest context
   */
  private async buildContext(guest: Guest, conversationId?: string): Promise<GuestContext> {
    // Get active reservation
    const reservation = await this.findActiveReservation(guest.id);

    // Get conversation history if provided
    let conversationHistory = { totalMessages: 0, previousTopics: [] as string[] };
    if (conversationId) {
      conversationHistory = await this.getConversationHistory(conversationId);
    }

    // Parse preferences
    let preferences: Array<{ category: string; value: string }> = [];
    if (guest.preferences) {
      try {
        preferences = JSON.parse(guest.preferences);
      } catch {
        preferences = [];
      }
    }

    return {
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        fullName: `${guest.firstName} ${guest.lastName}`,
        email: guest.email,
        phone: guest.phone,
        language: guest.language || 'en',
        loyaltyTier: guest.loyaltyTier,
        vipStatus: guest.vipStatus,
        preferences,
      },
      reservation: reservation ? this.formatReservation(reservation) : null,
      conversationHistory,
    };
  }

  /**
   * Find active reservation for a guest
   */
  private async findActiveReservation(guestId: string): Promise<Reservation | null> {
    const today = new Date().toISOString().split('T')[0];

    const [reservation] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.guestId, guestId),
          sql`${reservations.departureDate} >= ${today}`,
          sql`${reservations.status} IN ('confirmed', 'in_house')`
        )
      )
      .orderBy(reservations.arrivalDate)
      .limit(1);

    return reservation || null;
  }

  /**
   * Format reservation for context
   */
  private formatReservation(reservation: Reservation): GuestContext['reservation'] {
    const today = new Date();
    const arrival = new Date(reservation.arrivalDate);
    const departure = new Date(reservation.departureDate);

    const stayDuration = Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((departure.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let specialRequests: string[] = [];
    if (reservation.specialRequests) {
      try {
        specialRequests = JSON.parse(reservation.specialRequests);
      } catch {
        specialRequests = [];
      }
    }

    return {
      id: reservation.id,
      confirmationNumber: reservation.confirmationNumber,
      roomNumber: reservation.roomNumber,
      roomType: reservation.roomType,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      status: reservation.status,
      specialRequests,
      isCheckedIn: reservation.status === 'in_house',
      stayDuration,
      daysRemaining: Math.max(0, daysRemaining),
    };
  }

  /**
   * Get conversation history summary
   */
  private async getConversationHistory(
    conversationId: string
  ): Promise<{ totalMessages: number; previousTopics: string[] }> {
    // Count total messages
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sql`messages`)
      .where(sql`conversation_id = ${conversationId}`);

    // Get unique intents from conversation
    const intents = await db
      .select({ intent: sql<string>`intent` })
      .from(sql`messages`)
      .where(sql`conversation_id = ${conversationId} AND intent IS NOT NULL`)
      .groupBy(sql`intent`);

    return {
      totalMessages: countResult?.count || 0,
      previousTopics: intents.map((i) => i.intent).filter(Boolean),
    };
  }

  /**
   * Create empty context
   */
  private emptyContext(): GuestContext {
    return {
      guest: null,
      reservation: null,
      conversationHistory: { totalMessages: 0, previousTopics: [] },
    };
  }
}

/**
 * Singleton instance
 */
export const guestContextService = new GuestContextService();
