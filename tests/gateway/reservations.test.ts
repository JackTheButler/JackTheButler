/**
 * Reservations API Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, roles, guests, reservations, conversations, tasks } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { AuthService } from '@/auth/auth.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import { settingsService } from '@/services/settings.js';

// Build arrival/departure fixtures relative to "now" so nothing rots.
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0]!;
}

describe('Reservations API', () => {
  const authService = new AuthService();

  const adminUserId = 'staff-reservations-admin';
  const noPermUserId = 'staff-reservations-noperm';
  const noPermRoleId = 'role-reservations-test-noperm';

  const guestId = generateId('guest');
  const todayArrivalResId = generateId('reservation');
  const todayDepartureResId = generateId('reservation');
  const inHouseResId = generateId('reservation');
  const futureResId = generateId('reservation');

  let adminToken: string;
  let noPermToken: string;

  const today = daysFromNow(0);

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, noPermUserId));
    await db.delete(roles).where(eq(roles.id, noPermRoleId));

    // Custom role with no permissions, to exercise the 403 path (every
    // default system role includes RESERVATIONS_VIEW).
    await db.insert(roles).values({
      id: noPermRoleId,
      name: 'Reservations Test No-Perm',
      description: 'Role with no permissions, for 403 tests',
      permissions: JSON.stringify([]),
      isSystem: false,
    });

    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'reservations-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: noPermUserId,
        email: 'reservations-noperm@test.com',
        name: 'No Perm User',
        roleId: noPermRoleId,
        status: 'active',
        passwordHash,
      },
    ]);

    const adminTokens = await authService.login('reservations-admin@test.com', 'test123');
    const noPermTokens = await authService.login('reservations-noperm@test.com', 'test123');
    adminToken = adminTokens.accessToken;
    noPermToken = noPermTokens.accessToken;

    await db.insert(guests).values({
      id: guestId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada-reservations-test@example.com',
      vipStatus: 'gold',
      loyaltyTier: 'platinum',
      preferences: JSON.stringify(['quiet room']),
      createdAt: now(),
      updatedAt: now(),
    });

    await db.insert(reservations).values([
      {
        id: todayArrivalResId,
        guestId,
        confirmationNumber: 'CONF-ARRIVAL-1',
        roomNumber: '101',
        roomType: 'standard',
        arrivalDate: today,
        departureDate: daysFromNow(3),
        status: 'confirmed',
        estimatedArrival: `${today}T15:00:00.000Z`,
        specialRequests: JSON.stringify(['late checkout']),
        notes: JSON.stringify(['VIP guest']),
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: todayDepartureResId,
        guestId,
        confirmationNumber: 'CONF-DEPARTURE-1',
        roomNumber: '102',
        roomType: 'suite',
        arrivalDate: daysFromNow(-3),
        departureDate: today,
        status: 'checked_in', // "late" departure per /today semantics
        estimatedDeparture: `${today}T11:00:00.000Z`,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: inHouseResId,
        guestId,
        confirmationNumber: 'CONF-INHOUSE-1',
        roomNumber: '103',
        roomType: 'deluxe',
        arrivalDate: daysFromNow(-1),
        departureDate: daysFromNow(2),
        status: 'checked_in',
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: futureResId,
        guestId,
        confirmationNumber: 'CONF-FUTURE-1',
        roomNumber: '104',
        roomType: 'standard',
        arrivalDate: daysFromNow(10),
        departureDate: daysFromNow(13),
        status: 'confirmed',
        createdAt: now(),
        updatedAt: now(),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(reservations).where(eq(reservations.id, todayArrivalResId));
    await db.delete(reservations).where(eq(reservations.id, todayDepartureResId));
    await db.delete(reservations).where(eq(reservations.id, inHouseResId));
    await db.delete(reservations).where(eq(reservations.id, futureResId));
    await db.delete(guests).where(eq(guests.id, guestId));
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, noPermUserId));
    await db.delete(roles).where(eq(roles.id, noPermRoleId));
    await settingsService.delete('hotel_profile');
  });

  // ==================
  // GET /today
  // ==================
  describe('GET /api/v1/reservations/today', () => {
    it('returns 401 without authentication', async () => {
      const res = await app.request('/api/v1/reservations/today');
      expect(res.status).toBe(401);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/reservations/today', {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('summarizes arrivals, departures, and in-house counts', async () => {
      const res = await app.request('/api/v1/reservations/today', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.date).toBe(today);
      expect(json.arrivals.count).toBeGreaterThanOrEqual(1);
      expect(json.arrivals.pending).toBeGreaterThanOrEqual(1); // status confirmed
      expect(json.departures.count).toBeGreaterThanOrEqual(1);
      expect(json.departures.late).toBeGreaterThanOrEqual(1); // status checked_in
      expect(json.inHouse).toBeGreaterThanOrEqual(1);
      // No hotel_profile setting configured yet -> occupancy cannot be computed
      expect(json.occupancyRate).toBeNull();
    });

    it('computes occupancy rate when hotel_profile.totalRooms is configured', async () => {
      await settingsService.set('hotel_profile', { totalRooms: 10 });

      const res = await app.request('/api/v1/reservations/today', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.occupancyRate).not.toBeNull();
      expect(typeof json.occupancyRate).toBe('number');

      await settingsService.delete('hotel_profile');
    });
  });

  // ==================
  // GET /arrivals
  // ==================
  describe('GET /api/v1/reservations/arrivals', () => {
    it('returns today\'s arrivals with guest info by default', async () => {
      const res = await app.request('/api/v1/reservations/arrivals', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.date).toBe(today);
      const found = json.arrivals.find((r: { id: string }) => r.id === todayArrivalResId);
      expect(found).toBeDefined();
      expect(found.specialRequests).toEqual(['late checkout']);
      expect(found.notes).toEqual(['VIP guest']);
      expect(found.guest).toMatchObject({ id: guestId, firstName: 'Ada', lastName: 'Lovelace' });
    });

    it('supports an explicit date query param', async () => {
      const res = await app.request(`/api/v1/reservations/arrivals?date=${daysFromNow(10)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.arrivals.some((r: { id: string }) => r.id === futureResId)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await app.request('/api/v1/reservations/arrivals?status=checked_in', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.arrivals.some((r: { id: string }) => r.id === todayArrivalResId)).toBe(false);
      expect(json.arrivals.every((r: { status: string }) => r.status === 'checked_in')).toBe(true);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/reservations/arrivals', {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET /departures
  // ==================
  describe('GET /api/v1/reservations/departures', () => {
    it("returns today's departures with guest info", async () => {
      const res = await app.request('/api/v1/reservations/departures', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.date).toBe(today);
      const found = json.departures.find((r: { id: string }) => r.id === todayDepartureResId);
      expect(found).toBeDefined();
      expect(found.guest.id).toBe(guestId);
    });

    it('filters by status', async () => {
      const res = await app.request('/api/v1/reservations/departures?status=checked_out', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.departures.some((r: { id: string }) => r.id === todayDepartureResId)).toBe(false);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/reservations/departures', {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET /in-house
  // ==================
  describe('GET /api/v1/reservations/in-house', () => {
    it('returns checked-in guests whose stay has not ended', async () => {
      const res = await app.request('/api/v1/reservations/in-house', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      const ids = json.reservations.map((r: { id: string }) => r.id);
      expect(ids).toContain(inHouseResId);
      expect(ids).toContain(todayDepartureResId); // checked_in, departs today (>= today)
      expect(ids).not.toContain(todayArrivalResId); // still just "confirmed"
      expect(ids).not.toContain(futureResId); // not checked in yet
      expect(json.count).toBe(json.reservations.length);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/reservations/in-house', {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET / (list with filters)
  // ==================
  describe('GET /api/v1/reservations', () => {
    it('lists all reservations with guest info, newest arrival first', async () => {
      const res = await app.request('/api/v1/reservations', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBeGreaterThanOrEqual(4);
      expect(json.limit).toBe(50);
      expect(json.offset).toBe(0);
      const ids = json.reservations.map((r: { id: string }) => r.id);
      expect(ids).toContain(todayArrivalResId);
      expect(ids).toContain(futureResId);
    });

    it('searches by confirmation number', async () => {
      const res = await app.request('/api/v1/reservations?search=CONF-ARRIVAL-1', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations).toHaveLength(1);
      expect(json.reservations[0].id).toBe(todayArrivalResId);
    });

    it('searches by guest name', async () => {
      const res = await app.request('/api/v1/reservations?search=lovelace', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations.length).toBeGreaterThanOrEqual(4);
    });

    it('searches by room number', async () => {
      const res = await app.request('/api/v1/reservations?search=104', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations.some((r: { id: string }) => r.id === futureResId)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await app.request('/api/v1/reservations?status=confirmed', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations.every((r: { status: string }) => r.status === 'confirmed')).toBe(true);
    });

    it("treats status=all as 'no filter'", async () => {
      const res = await app.request('/api/v1/reservations?status=all', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.total).toBeGreaterThanOrEqual(4);
    });

    it('filters by arrival date range', async () => {
      const res = await app.request(
        `/api/v1/reservations?arrivalFrom=${daysFromNow(9)}&arrivalTo=${daysFromNow(11)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      const json = await res.json();
      const ids = json.reservations.map((r: { id: string }) => r.id);
      expect(ids).toEqual([futureResId]);
    });

    it('filters by departure date range', async () => {
      const res = await app.request(
        `/api/v1/reservations?departureFrom=${today}&departureTo=${today}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      const json = await res.json();
      const ids = json.reservations.map((r: { id: string }) => r.id);
      expect(ids).toContain(todayDepartureResId);
    });

    it('filters by room number', async () => {
      const res = await app.request('/api/v1/reservations?roomNumber=103', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations).toHaveLength(1);
      expect(json.reservations[0].id).toBe(inHouseResId);
    });

    it('filters by guestId', async () => {
      const res = await app.request(`/api/v1/reservations?guestId=${guestId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.reservations.length).toBeGreaterThanOrEqual(4);
      expect(json.reservations.every((r: { guest: { id: string } }) => r.guest.id === guestId)).toBe(true);
    });

    it('paginates with limit and offset', async () => {
      const page1 = await app.request('/api/v1/reservations?limit=2&offset=0', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const page1Json = await page1.json();
      expect(page1Json.reservations).toHaveLength(2);
      expect(page1Json.limit).toBe(2);

      const page2 = await app.request('/api/v1/reservations?limit=2&offset=2', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const page2Json = await page2.json();
      expect(page2Json.offset).toBe(2);

      const page1Ids = page1Json.reservations.map((r: { id: string }) => r.id);
      const page2Ids = page2Json.reservations.map((r: { id: string }) => r.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });

    it('clamps limit to a maximum of 200', async () => {
      const res = await app.request('/api/v1/reservations?limit=99999', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.limit).toBe(200);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/reservations', {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET /:id
  // ==================
  describe('GET /api/v1/reservations/:id', () => {
    it('returns a single reservation with guest and related data', async () => {
      const conversationId = generateId('conversation');
      const taskId = generateId('task');

      // Other-guest fixtures: a second guest with their own conversation and
      // task, used to prove related tasks are scoped to the *correct* guest
      // and not leaked across guests.
      const otherGuestId = generateId('guest');
      const otherConversationId = generateId('conversation');
      const otherTaskId = generateId('task');

      await db.insert(conversations).values({
        id: conversationId,
        guestId,
        reservationId: todayArrivalResId,
        channelType: 'webchat',
        channelId: `session_${guestId}`,
        state: 'active',
        metadata: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      // Tasks link to conversations, not reservations directly. Related
      // tasks for a reservation are found via the guest's conversations
      // (reservation -> guest -> conversations -> tasks), so this task is
      // linked through `conversationId`, not the reservation id.
      await db.insert(tasks).values({
        id: taskId,
        conversationId,
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Extra towels',
        status: 'pending',
        priority: 'standard',
        createdAt: now(),
        updatedAt: now(),
      });

      // A different guest with their own conversation and task — this task
      // must NOT show up in the first guest's reservation related tasks.
      await db.insert(guests).values({
        id: otherGuestId,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace-reservations-test@example.com',
        createdAt: now(),
        updatedAt: now(),
      });

      await db.insert(conversations).values({
        id: otherConversationId,
        guestId: otherGuestId,
        channelType: 'webchat',
        channelId: `session_${otherGuestId}`,
        state: 'active',
        metadata: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      await db.insert(tasks).values({
        id: otherTaskId,
        conversationId: otherConversationId,
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Should not appear',
        status: 'pending',
        priority: 'standard',
        createdAt: now(),
        updatedAt: now(),
      });

      const res = await app.request(`/api/v1/reservations/${todayArrivalResId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(todayArrivalResId);
      expect(json.guest.email).toBe('ada-reservations-test@example.com');
      expect(json.guest.preferences).toEqual(['quiet room']);
      expect(json._related.conversations.some((c: { id: string }) => c.id === conversationId)).toBe(true);
      expect(json._related.tasks.some((t: { id: string }) => t.id === taskId)).toBe(true);
      expect(json._related.tasks.some((t: { id: string }) => t.id === otherTaskId)).toBe(false);

      await db.delete(tasks).where(eq(tasks.id, taskId));
      await db.delete(tasks).where(eq(tasks.id, otherTaskId));
      await db.delete(conversations).where(eq(conversations.id, conversationId));
      await db.delete(conversations).where(eq(conversations.id, otherConversationId));
      await db.delete(guests).where(eq(guests.id, otherGuestId));
    });

    it('returns 404 for a non-existent reservation', async () => {
      const res = await app.request('/api/v1/reservations/nonexistent-reservation', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for a role without RESERVATIONS_VIEW', async () => {
      const res = await app.request(`/api/v1/reservations/${todayArrivalResId}`, {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
