/**
 * Guests API Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { db, staff, guests, reservations, conversations, guestMemories } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/permissions/defaults.js';
import { AuthService } from '@/auth/index.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';

// guests.ts imports getAppRegistry from '@/apps/index.js' — mock the whole module
// the same way tests/services/email.test.ts does.
vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(),
}));

import { app } from '@/gateway/server.js';
import { getAppRegistry } from '@/apps/index.js';

const mockGetAppRegistry = vi.mocked(getAppRegistry);

describe('Guests API', () => {
  const authService = new AuthService();

  const adminUserId = 'guests-api-admin';
  const staffUserId = 'guests-api-staff';

  let adminToken: string;
  let staffToken: string;

  // Track everything created by individual tests so it can be cleaned up.
  const createdGuestIds: string[] = [];

  async function cleanupGuest(id: string) {
    await db.delete(conversations).where(eq(conversations.guestId, id));
    await db.delete(reservations).where(eq(reservations.guestId, id));
    await db.delete(guestMemories).where(eq(guestMemories.guestId, id));
    await db.delete(guests).where(eq(guests.id, id));
  }

  async function insertGuest(overrides: Partial<typeof guests.$inferInsert> = {}) {
    const id = generateId('guest');
    await db.insert(guests).values({
      id,
      firstName: 'Test',
      lastName: 'Guest',
      email: null,
      phone: null,
      language: 'en',
      loyaltyTier: null,
      vipStatus: null,
      preferences: '[]',
      notes: null,
      tags: '[]',
      externalIds: '{}',
      stayCount: 0,
      totalRevenue: 0,
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    });
    createdGuestIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));

    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'guests-api-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'guests-api-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF, // has GUESTS_VIEW but not GUESTS_MANAGE
        status: 'active',
        passwordHash,
      },
    ]);

    const adminTokens = await authService.login('guests-api-admin@test.com', 'test123');
    const staffTokens = await authService.login('guests-api-staff@test.com', 'test123');
    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    // Clean up any guests created during the test.
    while (createdGuestIds.length) {
      const id = createdGuestIds.pop()!;
      await cleanupGuest(id);
    }
  });

  describe('auth', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.request('/api/v1/guests');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/guests/stats', () => {
    it('should return aggregate guest statistics', async () => {
      await insertGuest({ vipStatus: 'gold', stayCount: 3 });
      await insertGuest({ vipStatus: 'none', stayCount: 0 });

      // A guest created last month should not count toward "new this month"
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await insertGuest({ createdAt: lastMonth.toISOString() });

      const res = await app.request('/api/v1/guests/stats', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBeGreaterThanOrEqual(3);
      expect(json.vip).toBeGreaterThanOrEqual(1);
      expect(json.repeatGuests).toBeGreaterThanOrEqual(1);
      expect(typeof json.newThisMonth).toBe('number');
    });
  });

  describe('GET /api/v1/guests', () => {
    it('should list guests with parsed JSON fields', async () => {
      await insertGuest({ firstName: 'Alice', lastName: 'Anderson', preferences: '["late checkout"]', tags: '["vip-lounge"]' });

      const res = await app.request('/api/v1/guests', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.guests)).toBe(true);
      const alice = json.guests.find((g: { firstName: string }) => g.firstName === 'Alice');
      expect(alice).toBeDefined();
      expect(Array.isArray(alice.preferences)).toBe(true);
      expect(alice.preferences).toContain('late checkout');
      expect(alice.tags).toContain('vip-lounge');
      expect(typeof json.total).toBe('number');
      expect(json.limit).toBe(50);
      expect(json.offset).toBe(0);
    });

    it('should filter by search term across name/email/phone', async () => {
      const id = await insertGuest({ firstName: 'Zelda', lastName: 'Zephyr', email: 'zelda@example.com' });

      const res = await app.request('/api/v1/guests?search=zelda', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.guests.some((g: { id: string }) => g.id === id)).toBe(true);
      expect(json.guests.every((g: { firstName: string; lastName: string; email: string | null }) =>
        g.firstName.toLowerCase().includes('zelda') ||
        g.lastName.toLowerCase().includes('zelda') ||
        (g.email && g.email.toLowerCase().includes('zelda'))
      )).toBe(true);
    });

    it('should match search term against lastName, email, and phone too', async () => {
      const byLastName = await insertGuest({ lastName: 'Uniquelastname' });
      const byEmail = await insertGuest({ email: 'uniqueemail@example.com' });
      const byPhone = await insertGuest({ phone: '+14085551234' });

      const lastNameRes = await app.request('/api/v1/guests?search=uniquelastname', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect((await lastNameRes.json()).guests.some((g: { id: string }) => g.id === byLastName)).toBe(true);

      const emailRes = await app.request('/api/v1/guests?search=uniqueemail', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect((await emailRes.json()).guests.some((g: { id: string }) => g.id === byEmail)).toBe(true);

      const phoneRes = await app.request('/api/v1/guests?search=4085551234', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect((await phoneRes.json()).guests.some((g: { id: string }) => g.id === byPhone)).toBe(true);
    });

    it('should filter by vipStatus=any', async () => {
      const goldId = await insertGuest({ vipStatus: 'gold' });
      const noneId = await insertGuest({ vipStatus: 'none' });

      const res = await app.request('/api/v1/guests?vipStatus=any', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.guests.some((g: { id: string }) => g.id === goldId)).toBe(true);
      expect(json.guests.some((g: { id: string }) => g.id === noneId)).toBe(false);
    });

    it('should filter by specific vipStatus', async () => {
      const platinumId = await insertGuest({ vipStatus: 'platinum' });
      const goldId = await insertGuest({ vipStatus: 'gold' });

      const res = await app.request('/api/v1/guests?vipStatus=platinum', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.guests.some((g: { id: string }) => g.id === platinumId)).toBe(true);
      expect(json.guests.some((g: { id: string }) => g.id === goldId)).toBe(false);
    });

    it('should filter by loyaltyTier', async () => {
      const memberId = await insertGuest({ loyaltyTier: 'member' });

      const res = await app.request('/api/v1/guests?loyaltyTier=member', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.guests.some((g: { id: string }) => g.id === memberId)).toBe(true);
      expect(json.guests.every((g: { loyaltyTier: string }) => g.loyaltyTier === 'member')).toBe(true);
    });

    it('should filter by tag', async () => {
      const taggedId = await insertGuest({ tags: '["honeymoon"]' });
      await insertGuest({ tags: '["business"]' });

      const res = await app.request('/api/v1/guests?tag=honeymoon', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.guests.some((g: { id: string }) => g.id === taggedId)).toBe(true);
      expect(json.guests.every((g: { tags: string[] }) => g.tags.includes('honeymoon'))).toBe(true);
    });

    it('should respect limit and offset, capping limit at 200', async () => {
      const res = await app.request('/api/v1/guests?limit=5000&offset=0', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      const json = await res.json();
      expect(json.limit).toBe(200);
      expect(json.guests.length).toBeLessThanOrEqual(200);
    });
  });

  describe('GET /api/v1/guests/:id', () => {
    it('should return a guest with counts', async () => {
      const id = await insertGuest({ firstName: 'Carl' });

      const res = await app.request(`/api/v1/guests/${id}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(id);
      expect(json._counts.reservations).toBe(0);
      expect(json._counts.conversations).toBe(0);
      expect(Array.isArray(json.preferences)).toBe(true);
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/guests/:id/reservations', () => {
    it('should list reservations for a guest with parsed JSON fields', async () => {
      const guestId = await insertGuest();
      const resId = generateId('reservation');
      await db.insert(reservations).values({
        id: resId,
        guestId,
        confirmationNumber: `CONF-${resId}`,
        roomType: 'Deluxe',
        arrivalDate: '2099-01-01',
        departureDate: '2099-01-05',
        specialRequests: '["extra pillow"]',
        notes: '["called ahead"]',
      });

      const res = await app.request(`/api/v1/guests/${guestId}/reservations`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBe(1);
      expect(json.reservations[0].specialRequests).toContain('extra pillow');
      expect(json.reservations[0].notes).toContain('called ahead');

      await db.delete(reservations).where(eq(reservations.id, resId));
    });

    it('should respect limit and offset (capped at 100)', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/reservations?limit=500`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      const json = await res.json();
      expect(json.limit).toBe(100);
    });
  });

  describe('GET /api/v1/guests/:id/conversations', () => {
    it('should list conversations for a guest with parsed metadata', async () => {
      const guestId = await insertGuest();
      const convId = generateId('conversation');
      await db.insert(conversations).values({
        id: convId,
        guestId,
        channelType: 'webchat',
        channelId: `session_${convId}`,
        state: 'active',
        metadata: '{"foo":"bar"}',
      });

      const res = await app.request(`/api/v1/guests/${guestId}/conversations`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBe(1);
      expect(json.conversations[0].metadata).toEqual({ foo: 'bar' });

      await db.delete(conversations).where(eq(conversations.id, convId));
    });
  });

  describe('GET /api/v1/guests/:id/memories', () => {
    it('should return 404 for non-existent guest', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest/memories', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('should list memories and strip embedding blob, exposing hasEmbedding', async () => {
      const guestId = await insertGuest();
      const memId = generateId('memory');
      await db.insert(guestMemories).values({
        id: memId,
        guestId,
        category: 'preference',
        content: 'Likes extra towels',
        source: 'manual',
        embedding: Buffer.from(new Float32Array([0.1, 0.2]).buffer),
      });

      const res = await app.request(`/api/v1/guests/${guestId}/memories`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.memories).toHaveLength(1);
      expect(json.memories[0].hasEmbedding).toBe(true);
      expect(json.memories[0].embedding).toBeUndefined();
    });
  });

  describe('POST /api/v1/guests/:id/memories', () => {
    beforeAll(() => {
      mockGetAppRegistry.mockReturnValue({
        getActiveAIProvider: () => undefined,
        getEmbeddingProvider: () => undefined,
      } as unknown as ReturnType<typeof getAppRegistry>);
    });

    it('should require GUESTS_MANAGE (staff denied)', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'preference', content: 'Likes tea' }),
      });
      expect(res.status).toBe(403);
    });

    it('should create a manual memory', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'preference', content: 'Likes tea' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.content).toBe('Likes tea');
      expect(json.category).toBe('preference');
      expect(json.source).toBe('manual');
      expect(json.hasEmbedding).toBe(false);
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest/memories', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'preference', content: 'Likes tea' }),
      });
      expect(res.status).toBe(404);
    });

    it('should reject invalid category', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'not-a-category', content: 'x' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject empty content', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'preference', content: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/guests/:id/memories/:memoryId', () => {
    async function insertMemory(guestId: string, overrides: Partial<typeof guestMemories.$inferInsert> = {}) {
      const id = generateId('memory');
      await db.insert(guestMemories).values({
        id,
        guestId,
        category: 'preference',
        content: 'Original content',
        source: 'manual',
        ...overrides,
      });
      return id;
    }

    it('should update category and content', async () => {
      const guestId = await insertGuest();
      const memoryId = await insertMemory(guestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.content).toBe('Updated content');
    });

    it('should return 404 for guest not found', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest/memories/mem_x', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 404 for memory not found', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories/nonexistent-memory`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 404 when memory belongs to a different guest (cross-guest safety)', async () => {
      const guestId = await insertGuest();
      const otherGuestId = await insertGuest();
      const memoryId = await insertMemory(otherGuestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Should not update' }),
      });
      expect(res.status).toBe(404);
    });

    it('should reject a body with neither category nor content', async () => {
      const guestId = await insertGuest();
      const memoryId = await insertMemory(guestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/guests/:id/memories/:memoryId', () => {
    async function insertMemory(guestId: string) {
      const id = generateId('memory');
      await db.insert(guestMemories).values({
        id,
        guestId,
        category: 'preference',
        content: 'To delete',
        source: 'manual',
      });
      return id;
    }

    it('should delete a memory', async () => {
      const guestId = await insertGuest();
      const memoryId = await insertMemory(guestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const remaining = await db.select().from(guestMemories).where(eq(guestMemories.id, memoryId)).get();
      expect(remaining).toBeUndefined();
    });

    it('should return 404 for memory not found', async () => {
      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories/nonexistent-memory`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('should return 404 when memory belongs to a different guest', async () => {
      const guestId = await insertGuest();
      const otherGuestId = await insertGuest();
      const memoryId = await insertMemory(otherGuestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);

      // Memory should still exist since it belongs to another guest
      const remaining = await db.select().from(guestMemories).where(eq(guestMemories.id, memoryId)).get();
      expect(remaining).toBeDefined();
    });
  });

  describe('POST /api/v1/guests/:id/memories/:memoryId/embed', () => {
    async function insertMemory(guestId: string) {
      const id = generateId('memory');
      await db.insert(guestMemories).values({
        id,
        guestId,
        category: 'preference',
        content: 'Needs embedding',
        source: 'manual',
      });
      return id;
    }

    it('should return 422 when no embedding provider is available', async () => {
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => undefined,
      } as unknown as ReturnType<typeof getAppRegistry>);

      const guestId = await insertGuest();
      const memoryId = await insertMemory(guestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}/embed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(422);
    });

    it('should embed a memory when a provider is available', async () => {
      const embed = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], usage: { inputTokens: 1, outputTokens: 0 } });
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => ({ embed }),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const guestId = await insertGuest();
      const memoryId = await insertMemory(guestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}/embed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(embed).toHaveBeenCalledWith({ text: 'Needs embedding', purpose: 'store' });

      const updated = await db.select().from(guestMemories).where(eq(guestMemories.id, memoryId)).get();
      expect(updated?.embedding).not.toBeNull();
    });

    it('should return 404 for memory not found', async () => {
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => ({ embed: vi.fn() }),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const guestId = await insertGuest();
      const res = await app.request(`/api/v1/guests/${guestId}/memories/nonexistent-memory/embed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('should return 404 when memory belongs to a different guest', async () => {
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => ({ embed: vi.fn() }),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const guestId = await insertGuest();
      const otherGuestId = await insertGuest();
      const memoryId = await insertMemory(otherGuestId);

      const res = await app.request(`/api/v1/guests/${guestId}/memories/${memoryId}/embed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/guests', () => {
    it('should require GUESTS_MANAGE (staff denied)', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'New', lastName: 'Guest' }),
      });
      expect(res.status).toBe(403);
    });

    it('should create a guest with minimal fields, applying defaults', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Min', lastName: 'Imal' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.firstName).toBe('Min');
      expect(json.language).toBe('en');
      expect(json.preferences).toEqual([]);
      expect(json.tags).toEqual([]);
      expect(json.stayCount).toBe(0);
      createdGuestIds.push(json.id);
    });

    it('should normalize a valid phone number to E.164', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Phone', lastName: 'Owner', phone: '+1 415-555-2671' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.phone).toBe('+14155552671');
      createdGuestIds.push(json.id);
    });

    it('should reject missing required fields', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'OnlyFirst' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Bad', lastName: 'Email', email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid vipStatus enum value', async () => {
      const res = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Bad', lastName: 'Vip', vipStatus: 'legendary' }),
      });
      expect(res.status).toBe(400);
    });

    // The route pre-checks for an existing guest by email/phone before insert,
    // so duplicates are rejected with a friendly 409 Conflict instead of
    // surfacing the underlying UNIQUE constraint as a raw 500.
    it('rejects duplicate email with 409 and a clear error message', async () => {
      const email = `dupe-${generateId('guest')}@example.com`;
      const first = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'First', lastName: 'One', email }),
      });
      expect(first.status).toBe(201);
      const firstJson = await first.json();
      createdGuestIds.push(firstJson.id);

      const second = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Second', lastName: 'Two', email }),
      });
      expect(second.status).toBe(409);
      const secondJson = await second.json();
      expect(secondJson.error.code).toBe('CONFLICT');
      expect(secondJson.error.message).toMatch(/email/i);
      expect(secondJson.error.details).toMatchObject({ field: 'email' });
    });

    it('rejects duplicate phone with 409 and a clear error message', async () => {
      const phone = '+14155552672';
      const first = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'First', lastName: 'Phone', phone }),
      });
      expect(first.status).toBe(201);
      const firstJson = await first.json();
      createdGuestIds.push(firstJson.id);

      // Submit a differently-formatted but equivalent phone number to verify
      // the duplicate check compares against the normalized value.
      const second = await app.request('/api/v1/guests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Second', lastName: 'Phone', phone: '+1 415-555-2672' }),
      });
      expect(second.status).toBe(409);
      const secondJson = await second.json();
      expect(secondJson.error.code).toBe('CONFLICT');
      expect(secondJson.error.message).toMatch(/phone/i);
      expect(secondJson.error.details).toMatchObject({ field: 'phone' });
    });
  });

  describe('PUT /api/v1/guests/:id', () => {
    it('should update a guest', async () => {
      const id = await insertGuest({ firstName: 'Before' });

      const res = await app.request(`/api/v1/guests/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'After' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.firstName).toBe('After');
    });

    it('should allow clearing nullable fields explicitly', async () => {
      const id = await insertGuest({ notes: 'Some notes', email: null });

      const res = await app.request(`/api/v1/guests/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: null }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.notes).toBeNull();
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });

    it('should require GUESTS_MANAGE (staff denied)', async () => {
      const id = await insertGuest();
      const res = await app.request(`/api/v1/guests/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'ShouldNotUpdate' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/guests/:id', () => {
    it('should soft-delete by anonymizing PII (default)', async () => {
      const id = await insertGuest({ firstName: 'Real', lastName: 'Name', email: null, phone: null, tags: '[]' });

      const res = await app.request(`/api/v1/guests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const row = await db.select().from(guests).where(eq(guests.id, id)).get();
      expect(row?.firstName).toBe('Deleted');
      expect(row?.lastName).toBe('Guest');
      expect(row?.tags).toBe('["deleted"]');
    });

    it('should permanently delete when permanent=true and no reservations exist', async () => {
      const id = await insertGuest();

      const res = await app.request(`/api/v1/guests/${id}?permanent=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const row = await db.select().from(guests).where(eq(guests.id, id)).get();
      expect(row).toBeUndefined();

      // Already deleted — remove from tracking so afterEach doesn't re-delete.
      const idx = createdGuestIds.indexOf(id);
      if (idx >= 0) createdGuestIds.splice(idx, 1);
    });

    it('should reject permanent delete when reservations exist', async () => {
      const id = await insertGuest();
      const resId = generateId('reservation');
      await db.insert(reservations).values({
        id: resId,
        guestId: id,
        confirmationNumber: `CONF-${resId}`,
        roomType: 'Standard',
        arrivalDate: '2099-01-01',
        departureDate: '2099-01-05',
      });

      const res = await app.request(`/api/v1/guests/${id}?permanent=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);

      const row = await db.select().from(guests).where(eq(guests.id, id)).get();
      expect(row).toBeDefined();
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.request('/api/v1/guests/nonexistent-guest', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('should require GUESTS_MANAGE (staff denied)', async () => {
      const id = await insertGuest();
      const res = await app.request(`/api/v1/guests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/guests/memories/backfill-embeddings', () => {
    it('should return 400 when no embedding provider is available', async () => {
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => undefined,
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/guests/memories/backfill-embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('should embed unembedded memories and report success/failed counts', async () => {
      const guestId = await insertGuest();
      const okId = generateId('memory');
      const failId = generateId('memory');
      await db.insert(guestMemories).values([
        { id: okId, guestId, category: 'preference', content: 'Likes coffee', source: 'manual' },
        { id: failId, guestId, category: 'preference', content: 'Likes tea', source: 'manual' },
      ]);

      const embed = vi.fn().mockImplementation(({ text }: { text: string }) => {
        if (text === 'Likes tea') return Promise.reject(new Error('embedding failed'));
        return Promise.resolve({ embedding: [0.1, 0.2], usage: { inputTokens: 1, outputTokens: 0 } });
      });
      mockGetAppRegistry.mockReturnValue({
        getEmbeddingProvider: () => ({ embed }),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/guests/memories/backfill-embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBeGreaterThanOrEqual(2);
      expect(json.success).toBeGreaterThanOrEqual(1);
      expect(json.failed).toBeGreaterThanOrEqual(1);

      const okRow = await db.select().from(guestMemories).where(eq(guestMemories.id, okId)).get();
      expect(okRow?.embedding).not.toBeNull();
    });

    it('should require GUESTS_MANAGE (staff denied)', async () => {
      const res = await app.request('/api/v1/guests/memories/backfill-embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
