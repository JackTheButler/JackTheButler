/**
 * Guest Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db/index.js';
import { guests } from '@/db/schema.js';
import { GuestService, normalizePhone } from '@/services/guest.js';
import { eq, inArray } from 'drizzle-orm';

describe('GuestService', () => {
  let service: GuestService;

  beforeEach(async () => {
    service = new GuestService();
    // Clean up test data
    await db.delete(guests).where(eq(guests.firstName, 'Guest'));
    await db.delete(guests).where(eq(guests.firstName, 'Test'));
    await db.delete(guests).where(
      inArray(guests.firstName, ['Findable', 'ApiErr', 'Digits', 'Updater', 'Listed'])
    );
  });

  describe('normalizePhone', () => {
    it('should normalize US phone numbers', () => {
      expect(normalizePhone('(415) 555-1234')).toBe('+14155551234');
      expect(normalizePhone('415-555-1234')).toBe('+14155551234');
      expect(normalizePhone('4155551234')).toBe('+14155551234');
      expect(normalizePhone('+1 415 555 1234')).toBe('+14155551234');
    });

    it('should normalize international phone numbers', () => {
      expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
      expect(normalizePhone('+971501234567')).toBe('+971501234567');
    });

    it('should return null for invalid phone numbers', () => {
      expect(normalizePhone('invalid')).toBeNull();
      expect(normalizePhone('123')).toBeNull();
      expect(normalizePhone('')).toBeNull();
    });
  });

  describe('findOrCreateByPhone', () => {
    it('should create a new guest when none exists', async () => {
      // Use a phone number unique to this test (not reused by other tests in this file)
      const phone = '+14155550000';

      const guest = await service.findOrCreateByPhone(phone);

      expect(guest).toBeDefined();
      expect(guest.phone).toBe(phone);
      expect(guest.firstName).toBe('Guest');
      expect(guest.lastName).toBe('0000'); // Last 4 digits
    });

    it('should return existing guest when phone matches', async () => {
      const phone = '+14155559999';

      // Create first guest
      const first = await service.findOrCreateByPhone(phone);

      // Find again should return same guest
      const second = await service.findOrCreateByPhone(phone);

      expect(second.id).toBe(first.id);
    });

    it('should normalize phone number before matching', async () => {
      // Create with formatted number
      const guest1 = await service.findOrCreateByPhone('(415) 555-8888');

      // Find with different format
      const guest2 = await service.findOrCreateByPhone('+14155558888');

      expect(guest2.id).toBe(guest1.id);
    });

    it('should throw error for invalid phone number', async () => {
      await expect(service.findOrCreateByPhone('invalid')).rejects.toThrow();
    });
  });

  describe('findByPhone', () => {
    it('should find guest by phone', async () => {
      const phone = '+14155557777';
      const created = await service.findOrCreateByPhone(phone);

      const found = await service.findByPhone(phone);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null when guest not found', async () => {
      const found = await service.findByPhone('+19999999999');

      expect(found).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a guest with full details', async () => {
      const guest = await service.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+14155556666',
      });

      expect(guest.firstName).toBe('Test');
      expect(guest.lastName).toBe('User');
      expect(guest.email).toBe('test@example.com');
      expect(guest.phone).toBe('+14155556666');
    });

    it('should normalize email to lowercase', async () => {
      const guest = await service.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'TEST@EXAMPLE.COM',
      });

      expect(guest.email).toBe('test@example.com');
    });
  });

  describe('update', () => {
    it('should update guest fields', async () => {
      const guest = await service.create({
        firstName: 'Test',
        lastName: 'User',
      });

      const updated = await service.update(guest.id, {
        lastName: 'Updated',
        vipStatus: 'gold',
      });

      expect(updated.lastName).toBe('Updated');
      expect(updated.vipStatus).toBe('gold');
    });

    it('should throw error when guest not found', async () => {
      await expect(service.update('non-existent-id', { firstName: 'Test' })).rejects.toThrow();
    });

    it('should normalize a new phone number when updating', async () => {
      const guest = await service.create({ firstName: 'Updater', lastName: 'User' });

      const updated = await service.update(guest.id, { phone: '(415) 555-2222' });

      expect(updated.phone).toBe('+14155552222');
    });

    it('should keep the existing phone when no phone is provided in the update', async () => {
      const guest = await service.create({
        firstName: 'Updater',
        lastName: 'User',
        phone: '+14155553333',
      });

      const updated = await service.update(guest.id, { lastName: 'Renamed' });

      expect(updated.phone).toBe('+14155553333');
    });

    it('should normalize a new email to lowercase when updating', async () => {
      const guest = await service.create({ firstName: 'Updater', lastName: 'User' });

      const updated = await service.update(guest.id, { email: 'UPDATED@EXAMPLE.COM' });

      expect(updated.email).toBe('updated@example.com');
    });

    it('should keep the existing email when no email is provided in the update', async () => {
      const guest = await service.create({
        firstName: 'Updater',
        lastName: 'User',
        email: 'keep@example.com',
      });

      const updated = await service.update(guest.id, { lastName: 'Renamed' });

      expect(updated.email).toBe('keep@example.com');
    });

    // Characterization test: update() calls findById() twice — once to load the
    // existing guest, once to re-read after the write. If the second read
    // somehow returns nothing, the current code throws a generic AppError
    // rather than a NotFoundError. This forces that path via a spy since it
    // cannot be reached through normal DB behavior.
    it('should throw AppError if the guest disappears between update and re-read', async () => {
      const guest = await service.create({ firstName: 'Updater', lastName: 'User' });

      const spy = vi.spyOn(service, 'findById');
      spy.mockResolvedValueOnce(guest); // existing-guest check
      spy.mockResolvedValueOnce(null); // post-update re-read

      await expect(service.update(guest.id, { lastName: 'Ghost' })).rejects.toThrow(
        'Failed to update guest'
      );

      spy.mockRestore();
    });
  });

  describe('findByEmail', () => {
    it('should find a guest by email', async () => {
      const created = await service.create({
        firstName: 'Findable',
        lastName: 'User',
        email: 'findable@example.com',
      });

      const found = await service.findByEmail('findable@example.com');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should be case-insensitive and trim whitespace', async () => {
      await service.create({
        firstName: 'Findable',
        lastName: 'User',
        email: 'trimmed@example.com',
      });

      const found = await service.findByEmail('  TRIMMED@EXAMPLE.COM  ');

      expect(found).not.toBeNull();
      expect(found!.email).toBe('trimmed@example.com');
    });

    it('should return null when no guest matches the email', async () => {
      const found = await service.findByEmail('nobody@example.com');

      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    it('should return all guests including newly created ones', async () => {
      const created = await service.create({ firstName: 'Listed', lastName: 'User' });

      const all = await service.list();

      expect(all.some((g) => g.id === created.id)).toBe(true);
    });
  });

  describe('findByPhone flexible matching', () => {
    it('should match a phone number stored without a leading +', async () => {
      const digitsOnly = '14155554321';
      await db.insert(guests).values({
        id: 'digits-test-guest',
        firstName: 'Digits',
        lastName: 'User',
        phone: digitsOnly,
      });

      const found = await service.findByPhone('+14155554321');

      expect(found).not.toBeNull();
      expect(found!.id).toBe('digits-test-guest');

      await db.delete(guests).where(eq(guests.id, 'digits-test-guest'));
    });

    it('should match on the last 9 digits for legacy data with a different prefix', async () => {
      // Stored with a different leading digits/formatting than the search term,
      // but sharing the final 9 digits ('155551234').
      await db.insert(guests).values({
        id: 'digits-test-legacy',
        firstName: 'Digits',
        lastName: 'Legacy',
        phone: '9155551234',
      });

      const found = await service.findByPhone('+14155551234');

      expect(found).not.toBeNull();
      expect(found!.id).toBe('digits-test-legacy');

      await db.delete(guests).where(eq(guests.id, 'digits-test-legacy'));
    });

    it('should return null when the phone fails to normalize', async () => {
      const found = await service.findByPhone('not-a-phone');

      expect(found).toBeNull();
    });
  });

  describe('create — AppError on missing re-read', () => {
    // Characterization test: create() inserts then re-reads via findById(). If
    // that re-read somehow returns nothing, the current code throws a generic
    // AppError rather than surfacing the insert result directly.
    it('should throw AppError if the guest cannot be re-read after insert', async () => {
      const spy = vi.spyOn(service, 'findById').mockResolvedValueOnce(null);

      await expect(
        service.create({ firstName: 'ApiErr', lastName: 'User' })
      ).rejects.toThrow('Failed to create guest');

      spy.mockRestore();
    });
  });

  describe('findOrCreateByPhone — AppError on missing re-read', () => {
    it('should throw AppError if the guest cannot be re-read after insert', async () => {
      const phone = '+14155551111';
      const spy = vi.spyOn(service, 'findById').mockResolvedValueOnce(null);

      await expect(service.findOrCreateByPhone(phone)).rejects.toThrow('Failed to create guest');

      spy.mockRestore();
      // The row was actually inserted before the forced-null re-read; clean it up.
      await db.delete(guests).where(eq(guests.phone, phone));
    });
  });

  describe('normalizePhone edge cases', () => {
    it('should return null and hit the catch branch for non-string input', () => {
      // parsePhoneNumberFromString throws a TypeError for non-string input;
      // normalizePhone's try/catch converts that into a null return.
      expect(normalizePhone(null as unknown as string)).toBeNull();
    });
  });
});
