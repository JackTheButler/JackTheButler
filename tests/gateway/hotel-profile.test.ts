/**
 * Hotel Profile API Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, settings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { AuthService } from '@/auth/auth.js';

describe('Hotel Profile API', () => {
  const authService = new AuthService();

  const adminUserId = 'hotel-profile-api-admin';
  const staffUserId = 'hotel-profile-api-staff';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));

    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'hotel-profile-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'hotel-profile-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF, // has neither SETTINGS_VIEW nor SETTINGS_MANAGE
        status: 'active',
        passwordHash,
      },
    ]);

    const adminTokens = await authService.login('hotel-profile-admin@test.com', 'test123');
    const staffTokens = await authService.login('hotel-profile-staff@test.com', 'test123');
    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(settings).where(eq(settings.key, 'hotel_profile'));
    await db.delete(settings).where(eq(settings.key, 'property_language'));
  });

  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'hotel_profile'));
    await db.delete(settings).where(eq(settings.key, 'property_language'));
  });

  describe('auth', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.request('/api/v1/settings/hotel');
      expect(res.status).toBe(401);
    });

    it('should deny GET to users without SETTINGS_VIEW', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('should deny PUT to users without SETTINGS_MANAGE', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Should Not Save', timezone: 'UTC' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/settings/hotel', () => {
    it('should return default profile and isConfigured=false when unset', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isConfigured).toBe(false);
      expect(json.profile.name).toBe('');
      expect(json.profile.timezone).toBe('UTC');
      expect(json.profile.currency).toBe('USD');
      expect(json.profile.checkInTime).toBe('15:00');
      expect(json.profile.checkOutTime).toBe('11:00');
    });

    it('should return the saved profile and isConfigured=true once set', async () => {
      await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Grand Hotel',
          timezone: 'Europe/Paris',
          currency: 'EUR',
          propertyLanguage: 'fr',
        }),
      });

      const res = await app.request('/api/v1/settings/hotel', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isConfigured).toBe(true);
      expect(json.profile.name).toBe('Grand Hotel');
      expect(json.profile.timezone).toBe('Europe/Paris');
      expect(json.profile.currency).toBe('EUR');
      expect(json.profile.propertyLanguage).toBe('fr');
    });

    it('should merge in the standalone property_language setting for legacy profiles missing it', async () => {
      // Simulate a profile saved before propertyLanguage existed on the schema.
      await db.insert(settings).values({ key: 'hotel_profile', value: JSON.stringify({ name: 'Legacy Hotel', timezone: 'UTC', currency: 'USD' }) });
      await db.insert(settings).values({ key: 'property_language', value: 'de' });

      const res = await app.request('/api/v1/settings/hotel', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.profile.propertyLanguage).toBe('de');
    });
  });

  describe('PUT /api/v1/settings/hotel', () => {
    it('should update the profile and dual-write property_language', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Seaside Inn',
          timezone: 'America/New_York',
          currency: 'USD',
          propertyLanguage: 'es',
          checkInTime: '16:00',
          checkOutTime: '10:00',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toBe('Hotel profile updated');
      expect(json.profile.name).toBe('Seaside Inn');
      expect(json.profile.checkInTime).toBe('16:00');

      const langRow = await db.select().from(settings).where(eq(settings.key, 'property_language')).get();
      expect(langRow).toBeDefined();
      // settingsService stores plain strings raw (not JSON-encoded), unlike objects.
      expect(langRow!.value).toBe('es');
    });

    it('should apply defaults for optional fields (currency, checkIn/Out, propertyLanguage)', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Minimal Hotel', timezone: 'UTC' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.profile.currency).toBe('USD');
      expect(json.profile.checkInTime).toBe('15:00');
      expect(json.profile.checkOutTime).toBe('11:00');
      expect(json.profile.propertyLanguage).toBe('en');
    });

    it('should reject missing name', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: 'UTC' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing timezone', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No Timezone' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid checkInTime format', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Time', timezone: 'UTC', checkInTime: '3pm' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject a currency code that is not exactly 3 characters', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Currency', timezone: 'UTC', currency: 'DOLLAR' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject an invalid propertyType enum value', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Type', timezone: 'UTC', propertyType: 'castle' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject an invalid contactEmail', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Email', timezone: 'UTC', contactEmail: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject an invalid website URL', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Website', timezone: 'UTC', website: 'not-a-url' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject a non-positive totalRooms', async () => {
      const res = await app.request('/api/v1/settings/hotel', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Rooms', timezone: 'UTC', totalRooms: 0 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/settings/hotel/timezones', () => {
    it('should return a list of timezones', async () => {
      const res = await app.request('/api/v1/settings/hotel/timezones', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.timezones)).toBe(true);
      expect(json.timezones.length).toBeGreaterThan(10);
      expect(json.timezones.some((t: { value: string }) => t.value === 'UTC')).toBe(true);
      expect(json.timezones[0]).toHaveProperty('value');
      expect(json.timezones[0]).toHaveProperty('label');
    });

    it('should deny access without SETTINGS_VIEW', async () => {
      const res = await app.request('/api/v1/settings/hotel/timezones', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/settings/hotel/currencies', () => {
    it('should return a list of currencies including symbols', async () => {
      const res = await app.request('/api/v1/settings/hotel/currencies', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.currencies)).toBe(true);
      const usd = json.currencies.find((c: { value: string }) => c.value === 'USD');
      expect(usd).toBeDefined();
      expect(usd.symbol).toBe('$');
    });
  });

  describe('GET /api/v1/settings/hotel/countries', () => {
    it('should return a list of countries', async () => {
      const res = await app.request('/api/v1/settings/hotel/countries', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.countries)).toBe(true);
      expect(json.countries.some((c: { value: string }) => c.value === 'US')).toBe(true);
    });
  });

  describe('GET /api/v1/settings/hotel/languages', () => {
    it('should return a list of languages', async () => {
      const res = await app.request('/api/v1/settings/hotel/languages', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.languages)).toBe(true);
      expect(json.languages.some((l: { value: string }) => l.value === 'en')).toBe(true);
    });
  });
});
