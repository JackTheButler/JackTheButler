/**
 * Guest Service
 *
 * Manages guest profiles and identification.
 */

import { eq, or, sql, desc } from 'drizzle-orm';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { db } from '@/db/index.js';
import { guests, reservations, conversations, type Guest, type NewGuest, type Reservation, type Conversation } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError, ValidationError, ConflictError, AppError } from '@/errors/index.js';
import { now } from '@/utils/time.js';

const log = createLogger('guest');

/**
 * Default country for phone number parsing
 */
const DEFAULT_COUNTRY: CountryCode = 'US';

/**
 * Guest profile with JSON text columns parsed into their native shapes
 */
export interface GuestDTO extends Omit<Guest, 'preferences' | 'tags' | 'externalIds'> {
  preferences: string[];
  tags: string[];
  externalIds: Record<string, unknown>;
}

/**
 * Guest profile with related-record counts, as returned by the guest detail endpoint
 */
export interface GuestWithCounts extends GuestDTO {
  _counts: {
    reservations: number;
    conversations: number;
  };
}

/**
 * Aggregate guest statistics
 */
export interface GuestStats {
  total: number;
  vip: number;
  repeatGuests: number;
  newThisMonth: number;
}

/**
 * Options for searching/filtering the guest list
 */
export interface GuestSearchOptions {
  search?: string | undefined;
  vipStatus?: string | undefined;
  loyaltyTier?: string | undefined;
  tag?: string | undefined;
  limit: number;
  offset: number;
}

export interface GuestSearchResult {
  guests: GuestDTO[];
  total: number;
}

export interface GuestReservation extends Omit<Reservation, 'specialRequests' | 'notes'> {
  specialRequests: string[];
  notes: string[];
}

export interface GuestReservationsResult {
  reservations: GuestReservation[];
  total: number;
}

export interface GuestConversation extends Omit<Conversation, 'metadata'> {
  metadata: Record<string, unknown>;
}

export interface GuestConversationsResult {
  conversations: GuestConversation[];
  total: number;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Input for creating a guest via the API (JSON-friendly shape — array/object
 * fields are serialized to their stored text-column form internally)
 */
export interface CreateGuestInput {
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  language: string;
  loyaltyTier?: string | null | undefined;
  vipStatus?: string | null | undefined;
  preferences?: string[] | undefined;
  notes?: string | null | undefined;
  tags?: string[] | undefined;
}

/**
 * Input for updating a guest via the API
 */
export interface UpdateGuestInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  language?: string | undefined;
  loyaltyTier?: string | null | undefined;
  vipStatus?: string | null | undefined;
  preferences?: string[] | undefined;
  notes?: string | null | undefined;
  tags?: string[] | undefined;
}

export interface DeleteGuestOptions {
  permanent?: boolean | undefined;
}

/**
 * Parse a guest's JSON text columns into their native shapes
 */
function toGuestDTO(guest: Guest): GuestDTO {
  return {
    ...guest,
    preferences: JSON.parse(guest.preferences || '[]'),
    tags: JSON.parse(guest.tags || '[]'),
    externalIds: JSON.parse(guest.externalIds || '{}'),
  };
}

/**
 * Guest service class
 */
export class GuestService {
  /**
   * Find a guest by ID
   */
  async findById(id: string): Promise<Guest | null> {
    const result = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Find a guest by phone number
   *
   * Flexible matching to handle different phone formats:
   * - E.164 with + (e.g., +971543219865)
   * - Without + (e.g., 971543219865)
   * - Last 9 digits for legacy data
   */
  async findByPhone(phone: string): Promise<Guest | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return null;
    }

    // Extract digits only (without +)
    const digitsOnly = normalized.replace(/^\+/, '');
    // Last 9 digits for flexible matching (handles country code variations)
    const last9Digits = digitsOnly.slice(-9);

    // Try multiple formats: with +, without +, or ending with last 9 digits
    const result = await db
      .select()
      .from(guests)
      .where(
        or(
          eq(guests.phone, normalized),           // +971543219865
          eq(guests.phone, digitsOnly),           // 971543219865
          sql`${guests.phone} LIKE ${'%' + last9Digits}` // %543219865
        )
      )
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Find a guest by email
   */
  async findByEmail(email: string): Promise<Guest | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const result = await db.select().from(guests).where(eq(guests.email, normalizedEmail)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Find or create a guest by phone number
   *
   * If a guest with this phone exists, returns them.
   * Otherwise, creates a new guest with minimal info.
   */
  async findOrCreateByPhone(phone: string): Promise<Guest> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      throw new ValidationError(`Invalid phone number: ${phone}`);
    }

    // Try to find existing guest
    const existing = await this.findByPhone(normalized);
    if (existing) {
      log.debug({ guestId: existing.id, phone: normalized }, 'Found existing guest by phone');
      return existing;
    }

    // Create new guest with placeholder name
    const id = generateId('guest');
    const lastName = normalized.slice(-4); // Last 4 digits as placeholder

    const newGuest: NewGuest = {
      id,
      firstName: 'Guest',
      lastName,
      phone: normalized,
    };

    await db.insert(guests).values(newGuest);

    log.info({ guestId: id, phone: normalized }, 'Created new guest from phone');

    const created = await this.findById(id);
    if (!created) {
      throw new AppError('Failed to create guest', 'INTERNAL_ERROR', 500);
    }

    return created;
  }

  /**
   * Create a new guest
   */

  async create(data: Omit<NewGuest, 'id'>): Promise<Guest> {
    const id = generateId('guest');

    // Normalize phone if provided
    const phone = data.phone ? normalizePhone(data.phone) : undefined;

    // Normalize email if provided
    const email = data.email ? data.email.toLowerCase().trim() : undefined;

    await db.insert(guests).values({
      ...data,
      id,
      phone: phone ?? null,
      email: email ?? null,
    });

    const created = await this.findById(id);
    if (!created) {
      throw new AppError('Failed to create guest', 'INTERNAL_ERROR', 500);
    }

    log.info({ guestId: id }, 'Guest created');
    return created;
  }

  /**
   * Update a guest's profile
   */
  async update(id: string, data: Partial<Omit<NewGuest, 'id'>>): Promise<Guest> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('Guest', id);
    }

    // Normalize phone if provided
    const phone = data.phone ? normalizePhone(data.phone) : undefined;

    // Normalize email if provided
    const email = data.email ? data.email.toLowerCase().trim() : undefined;

    await db
      .update(guests)
      .set({
        ...data,
        phone: phone !== undefined ? phone : existing.phone,
        email: email !== undefined ? email : existing.email,
        updatedAt: now(),
      })
      .where(eq(guests.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new AppError('Failed to update guest', 'INTERNAL_ERROR', 500);
    }

    log.info({ guestId: id }, 'Guest updated');
    return updated;
  }

  /**
   * List all guests
   */
  async list(): Promise<Guest[]> {
    return db.select().from(guests);
  }

  /**
   * Get aggregate guest statistics (total, VIP count, repeat guests, new this month)
   */
  async getStats(): Promise<GuestStats> {
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .get();

    const vipResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .where(sql`${guests.vipStatus} IS NOT NULL AND ${guests.vipStatus} != 'none'`)
      .get();

    const repeatResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .where(sql`${guests.stayCount} > 1`)
      .get();

    // New guests this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const newThisMonthResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .where(sql`${guests.createdAt} >= ${startOfMonth.toISOString()}`)
      .get();

    return {
      total: totalResult?.count || 0,
      vip: vipResult?.count || 0,
      repeatGuests: repeatResult?.count || 0,
      newThisMonth: newThisMonthResult?.count || 0,
    };
  }

  /**
   * Search/filter guests, sorted by most recently updated.
   * Filtering happens in JS to support the complex OR-style search across
   * name/email/phone and the "any VIP status" filter.
   */
  async search(options: GuestSearchOptions): Promise<GuestSearchResult> {
    const allGuests = await db
      .select()
      .from(guests)
      .orderBy(desc(guests.updatedAt))
      .all();

    let filtered = allGuests;

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.firstName.toLowerCase().includes(searchLower) ||
          g.lastName.toLowerCase().includes(searchLower) ||
          (g.email && g.email.toLowerCase().includes(searchLower)) ||
          (g.phone && g.phone.includes(options.search!))
      );
    }

    if (options.vipStatus && options.vipStatus !== 'all') {
      if (options.vipStatus === 'any') {
        filtered = filtered.filter((g) => g.vipStatus && g.vipStatus !== 'none');
      } else {
        filtered = filtered.filter((g) => g.vipStatus === options.vipStatus);
      }
    }

    if (options.loyaltyTier && options.loyaltyTier !== 'all') {
      filtered = filtered.filter((g) => g.loyaltyTier === options.loyaltyTier);
    }

    if (options.tag) {
      filtered = filtered.filter((g) => {
        const tags = JSON.parse(g.tags || '[]');
        return tags.includes(options.tag);
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(options.offset, options.offset + options.limit);

    return { guests: paginated.map(toGuestDTO), total };
  }

  /**
   * Get a single guest profile with related-record counts.
   * Throws NotFoundError if the guest does not exist.
   */
  async getWithCounts(id: string): Promise<GuestWithCounts> {
    const guest = await this.findById(id);
    if (!guest) {
      throw new NotFoundError('Guest', id);
    }

    const reservationCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(eq(reservations.guestId, id))
      .get();

    const conversationCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.guestId, id))
      .get();

    return {
      ...toGuestDTO(guest),
      _counts: {
        reservations: reservationCount?.count || 0,
        conversations: conversationCount?.count || 0,
      },
    };
  }

  /**
   * List reservations for a guest, most recent arrival first.
   * Does not verify the guest exists — returns an empty list for unknown IDs.
   */
  async getReservations(guestId: string, options: PaginationOptions): Promise<GuestReservationsResult> {
    const rows = await db
      .select()
      .from(reservations)
      .where(eq(reservations.guestId, guestId))
      .orderBy(desc(reservations.arrivalDate))
      .limit(options.limit)
      .offset(options.offset)
      .all();

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(eq(reservations.guestId, guestId))
      .get();

    return {
      reservations: rows.map((r) => ({
        ...r,
        specialRequests: JSON.parse(r.specialRequests || '[]'),
        notes: JSON.parse(r.notes || '[]'),
      })),
      total: total?.count || 0,
    };
  }

  /**
   * List conversations for a guest, most recently active first.
   * Does not verify the guest exists — returns an empty list for unknown IDs.
   */
  async getConversations(guestId: string, options: PaginationOptions): Promise<GuestConversationsResult> {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.guestId, guestId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(options.limit)
      .offset(options.offset)
      .all();

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.guestId, guestId))
      .get();

    return {
      conversations: rows.map((c) => ({
        ...c,
        metadata: JSON.parse(c.metadata || '{}'),
      })),
      total: total?.count || 0,
    };
  }

  /**
   * Create a guest profile from API input, rejecting duplicate email/phone.
   */
  async createGuest(data: CreateGuestInput): Promise<GuestDTO> {
    if (data.email) {
      const existingByEmail = await this.findByEmail(data.email);
      if (existingByEmail) {
        throw new ConflictError('A guest with this email already exists', { field: 'email' });
      }
    }

    const normalizedPhone = data.phone ? normalizePhone(data.phone) : null;
    if (normalizedPhone) {
      const existingByPhone = await this.findByPhone(normalizedPhone);
      if (existingByPhone) {
        throw new ConflictError('A guest with this phone number already exists', { field: 'phone' });
      }
    }

    const id = generateId('guest');

    await db
      .insert(guests)
      .values({
        id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: normalizedPhone,
        language: data.language,
        loyaltyTier: data.loyaltyTier || null,
        vipStatus: data.vipStatus || null,
        preferences: JSON.stringify(data.preferences ?? []),
        notes: data.notes || null,
        tags: JSON.stringify(data.tags ?? []),
        externalIds: '{}',
        stayCount: 0,
        totalRevenue: 0,
        createdAt: now(),
        updatedAt: now(),
      })
      .run();

    log.info({ id, name: `${data.firstName} ${data.lastName}` }, 'Guest created');

    const guest = await this.findById(id);
    if (!guest) {
      throw new AppError('Failed to create guest', 'INTERNAL_ERROR', 500);
    }

    return toGuestDTO(guest);
  }

  /**
   * Update a guest profile from API input.
   * Throws NotFoundError if the guest does not exist.
   */
  async updateGuest(id: string, data: UpdateGuestInput): Promise<GuestDTO> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('Guest', id);
    }

    await db
      .update(guests)
      .set({
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone ? normalizePhone(data.phone) : null }),
        ...(data.language && { language: data.language }),
        ...(data.loyaltyTier !== undefined && { loyaltyTier: data.loyaltyTier }),
        ...(data.vipStatus !== undefined && { vipStatus: data.vipStatus }),
        ...(data.preferences && { preferences: JSON.stringify(data.preferences) }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.tags && { tags: JSON.stringify(data.tags) }),
        updatedAt: now(),
      })
      .where(eq(guests.id, id))
      .run();

    log.info({ id }, 'Guest updated');

    const guest = await this.findById(id);
    if (!guest) {
      throw new AppError('Failed to update guest', 'INTERNAL_ERROR', 500);
    }

    return toGuestDTO(guest);
  }

  /**
   * Delete a guest. By default this is a soft delete that anonymizes PII
   * while preserving historical records. Pass `permanent: true` to hard-delete,
   * which is rejected if the guest still has reservations.
   * Throws NotFoundError if the guest does not exist.
   */
  async deleteGuest(id: string, options: DeleteGuestOptions = {}): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('Guest', id);
    }

    if (options.permanent) {
      const reservationCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(reservations)
        .where(eq(reservations.guestId, id))
        .get();

      if ((reservationCount?.count || 0) > 0) {
        throw new ValidationError('Cannot delete guest with existing reservations');
      }

      await db.delete(guests).where(eq(guests.id, id)).run();
      log.info({ id }, 'Guest permanently deleted');
    } else {
      await db
        .update(guests)
        .set({
          firstName: 'Deleted',
          lastName: 'Guest',
          email: null,
          phone: null,
          notes: null,
          preferences: '[]',
          tags: '["deleted"]',
          updatedAt: now(),
        })
        .where(eq(guests.id, id))
        .run();
      log.info({ id }, 'Guest anonymized (soft delete)');
    }
  }
}

/**
 * Normalize a phone number to E.164 format
 *
 * @param phone - Phone number in any format
 * @param defaultCountry - Default country code if not included in number
 * @returns Normalized phone number in E.164 format, or null if invalid
 */
export function normalizePhone(phone: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string | null {
  try {
    // Parse the phone number
    const parsed = parsePhoneNumberFromString(phone, defaultCountry);

    if (!parsed || !parsed.isValid()) {
      log.debug({ phone }, 'Invalid phone number');
      return null;
    }

    // Return in E.164 format (e.g., +14155552671)
    return parsed.format('E.164');
  } catch (error) {
    log.debug({ phone, error }, 'Failed to parse phone number');
    return null;
  }
}

/**
 * Default guest service instance
 */
export const guestService = new GuestService();
