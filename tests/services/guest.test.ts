/**
 * Guest Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/index.js';
import { guests } from '@/db/schema.js';
import { GuestService, normalizePhone } from '@/services/guest.js';
import { eq } from 'drizzle-orm';

describe('GuestService', () => {
  let service: GuestService;

  beforeEach(async () => {
    service = new GuestService();
    // Clean up test data
    await db.delete(guests).where(eq(guests.firstName, 'Guest'));
    await db.delete(guests).where(eq(guests.firstName, 'Test'));
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
      // Use a phone number NOT in seeded data (mock PMS has +14155551234 and +14155555678)
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
  });
});
