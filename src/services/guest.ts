/**
 * Guest Service
 *
 * Manages guest profiles and identification.
 */

import { eq, or, sql } from 'drizzle-orm';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { db } from '@/db/index.js';
import { guests, type Guest, type NewGuest } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('guest');

/**
 * Default country for phone number parsing
 */
const DEFAULT_COUNTRY: CountryCode = 'US';

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
      throw new Error(`Invalid phone number: ${phone}`);
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
      throw new Error('Failed to create guest');
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
      throw new Error('Failed to create guest');
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
      throw new Error(`Guest not found: ${id}`);
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
        updatedAt: new Date().toISOString(),
      })
      .where(eq(guests.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to update guest');
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
