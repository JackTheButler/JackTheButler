/**
 * PMS Sync Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/db/index.js';
import { guests, reservations } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import type { NormalizedGuest, NormalizedReservation, PMSAdapter } from '@jackthebutler/shared';

vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(),
}));

const { pmsSyncService, getPMSSyncConfig } = await import('@/apps/pms/sync.js');
const { getAppRegistry } = await import('@/apps/index.js');
const { events, EventTypes } = await import('@/events/index.js');

// ==================
// Fixtures
// ==================

function makeNormalizedGuest(overrides: Partial<NormalizedGuest> = {}): NormalizedGuest {
  return {
    externalId: 'pms-guest-1',
    source: 'mews',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+14155551234',
    language: 'en',
    ...overrides,
  };
}

function makeNormalizedReservation(overrides: Partial<NormalizedReservation> = {}): NormalizedReservation {
  return {
    externalId: 'pms-res-1',
    source: 'mews',
    confirmationNumber: 'CONF-0001',
    guest: makeNormalizedGuest(),
    roomNumber: '101',
    roomType: 'Standard King',
    arrivalDate: '2026-08-01',
    departureDate: '2026-08-05',
    status: 'confirmed',
    adults: 2,
    children: 0,
    ...overrides,
  };
}

function makeAdapter(overrides: Partial<PMSAdapter> = {}): PMSAdapter {
  return {
    provider: 'mews',
    testConnection: vi.fn().mockResolvedValue(true),
    getReservation: vi.fn().mockResolvedValue(null),
    getReservationByConfirmation: vi.fn().mockResolvedValue(null),
    searchReservations: vi.fn().mockResolvedValue([]),
    getModifiedReservations: vi.fn().mockResolvedValue([]),
    getGuest: vi.fn().mockResolvedValue(null),
    getGuestByPhone: vi.fn().mockResolvedValue(null),
    getGuestByEmail: vi.fn().mockResolvedValue(null),
    searchGuests: vi.fn().mockResolvedValue([]),
    getRoomStatus: vi.fn().mockResolvedValue(null),
    getAllRooms: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function mockRegistry(adapter: PMSAdapter | undefined, appConfig?: Record<string, unknown>) {
  vi.mocked(getAppRegistry).mockReturnValue({
    getActivePMSAdapter: () => adapter,
    getActivePMSApp: () => (adapter ? { config: appConfig ?? {} } : undefined),
  } as never);
}

describe('PMSSyncService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The temp DB is shared across all tests in this file (fresh per file, not per test),
    // so reset guest/reservation state before each test to avoid unique-constraint
    // collisions (email/phone/confirmationNumber) and stale cross-test matches.
    await db.delete(reservations);
    await db.delete(guests);
  });

  describe('syncReservations', () => {
    it('returns a zeroed result when no PMS adapter is configured', async () => {
      mockRegistry(undefined);

      const result = await pmsSyncService.syncReservations();

      expect(result).toEqual({ created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] });
    });

    it('creates a new guest and reservation on first sync', async () => {
      const pmsRes = makeNormalizedReservation();
      const adapter = makeAdapter({
        getModifiedReservations: vi.fn().mockResolvedValue([pmsRes]),
      });
      mockRegistry(adapter);

      const result = await pmsSyncService.syncReservations(new Date());

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);

      const storedGuests = await db.select().from(guests).where(eq(guests.email, 'jane.doe@example.com'));
      expect(storedGuests).toHaveLength(1);

      const storedRes = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, 'CONF-0001'));
      expect(storedRes).toHaveLength(1);
      expect(storedRes[0]!.roomNumber).toBe('101');
      expect(storedRes[0]!.status).toBe('confirmed');
    });

    it('defaults to a 24h lookback window when no since date is given', async () => {
      const adapter = makeAdapter({
        getModifiedReservations: vi.fn().mockResolvedValue([]),
      });
      mockRegistry(adapter);

      await pmsSyncService.syncReservations();

      const call = vi.mocked(adapter.getModifiedReservations).mock.calls[0]![0] as Date;
      const expected = Date.now() - 24 * 60 * 60 * 1000;
      // Allow a few seconds of tolerance for test execution time
      expect(Math.abs(call.getTime() - expected)).toBeLessThan(5000);
    });

    it('marks unchanged reservations as unchanged and still refreshes syncedAt', async () => {
      const pmsRes = makeNormalizedReservation();
      const adapter = makeAdapter({ getModifiedReservations: vi.fn().mockResolvedValue([pmsRes]) });
      mockRegistry(adapter);

      // First sync creates the reservation
      await pmsSyncService.syncReservations(new Date());
      const [firstRow] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, 'CONF-0001'));
      const firstSyncedAt = firstRow!.syncedAt;

      // Second sync with identical data should be a no-op except syncedAt bump
      await new Promise((r) => setTimeout(r, 10));
      const result = await pmsSyncService.syncReservations(new Date());

      expect(result.unchanged).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);

      const [secondRow] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, 'CONF-0001'));
      expect(secondRow!.syncedAt >= firstSyncedAt).toBe(true);
    });

    it('updates an existing reservation when status/room/dates change', async () => {
      const pmsRes = makeNormalizedReservation();
      const adapter = makeAdapter({ getModifiedReservations: vi.fn().mockResolvedValue([pmsRes]) });
      mockRegistry(adapter);

      await pmsSyncService.syncReservations(new Date());

      const updatedRes = makeNormalizedReservation({ roomNumber: '202' });
      vi.mocked(adapter.getModifiedReservations).mockResolvedValue([updatedRes]);

      const result = await pmsSyncService.syncReservations(new Date());

      expect(result.updated).toBe(1);
      const [row] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, 'CONF-0001'));
      expect(row!.roomNumber).toBe('202');
    });

    it('emits reservation.checked_in when status transitions to checked_in', async () => {
      const pmsRes = makeNormalizedReservation({ status: 'confirmed' });
      const adapter = makeAdapter({ getModifiedReservations: vi.fn().mockResolvedValue([pmsRes]) });
      mockRegistry(adapter);

      await pmsSyncService.syncReservations(new Date());

      const checkedIn = makeNormalizedReservation({ status: 'checked_in' });
      vi.mocked(adapter.getModifiedReservations).mockResolvedValue([checkedIn]);

      const handler = vi.fn();
      events.on(EventTypes.RESERVATION_CHECKED_IN, handler);
      try {
        await pmsSyncService.syncReservations(new Date());
        expect(handler).toHaveBeenCalledTimes(1);
        const emitted = handler.mock.calls[0]![0];
        expect(emitted.roomNumber).toBe('101');
      } finally {
        events.off(EventTypes.RESERVATION_CHECKED_IN, handler);
      }
    });

    it('emits reservation.checked_out when status transitions to checked_out', async () => {
      const pmsRes = makeNormalizedReservation({ status: 'checked_in' });
      const adapter = makeAdapter({ getModifiedReservations: vi.fn().mockResolvedValue([pmsRes]) });
      mockRegistry(adapter);

      await pmsSyncService.syncReservations(new Date());

      const checkedOut = makeNormalizedReservation({ status: 'checked_out' });
      vi.mocked(adapter.getModifiedReservations).mockResolvedValue([checkedOut]);

      const handler = vi.fn();
      events.on(EventTypes.RESERVATION_CHECKED_OUT, handler);
      try {
        await pmsSyncService.syncReservations(new Date());
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        events.off(EventTypes.RESERVATION_CHECKED_OUT, handler);
      }
    });

    it('records a per-reservation error and continues syncing remaining reservations', async () => {
      // First reservation is malformed (missing roomType triggers a DB NOT NULL failure),
      // second reservation is valid and should still be synced.
      const badRes = makeNormalizedReservation({
        externalId: 'pms-res-bad',
        confirmationNumber: 'CONF-BAD',
        // @ts-expect-error -- intentionally malformed to force an upsert failure
        roomType: null,
      });
      const goodRes = makeNormalizedReservation({
        externalId: 'pms-res-good',
        confirmationNumber: 'CONF-GOOD',
        guest: makeNormalizedGuest({ externalId: 'pms-guest-good', email: 'good@example.com' }),
      });
      const adapter = makeAdapter({
        getModifiedReservations: vi.fn().mockResolvedValue([badRes, goodRes]),
      });
      mockRegistry(adapter);

      const result = await pmsSyncService.syncReservations(new Date());

      expect(result.errors).toBe(1);
      expect(result.errorDetails).toHaveLength(1);
      expect(result.errorDetails![0]!.id).toBe('pms-res-bad');
      expect(result.created).toBe(1);

      const storedGood = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, 'CONF-GOOD'));
      expect(storedGood).toHaveLength(1);
    });

    it('propagates the error when the PMS fetch itself fails', async () => {
      const adapter = makeAdapter({
        getModifiedReservations: vi.fn().mockRejectedValue(new Error('PMS unreachable')),
      });
      mockRegistry(adapter);

      await expect(pmsSyncService.syncReservations(new Date())).rejects.toThrow('PMS unreachable');
    });
  });

  describe('upsertGuest', () => {
    it('serializes preferences onto an existing guest when provided', async () => {
      const existingId = generateId('guest');
      await db.insert(guests).values({
        id: existingId,
        firstName: 'Old',
        lastName: 'Name',
        email: 'prefs@example.com',
        externalIds: '{}',
        preferences: '[]',
        createdAt: now(),
        updatedAt: now(),
      });

      const { guest } = await pmsSyncService.upsertGuest(
        makeNormalizedGuest({
          externalId: 'ext-prefs',
          email: 'prefs@example.com',
          phone: undefined,
          preferences: [{ category: 'room', value: 'high floor' }],
        })
      );

      expect(JSON.parse(guest.preferences)).toEqual([{ category: 'room', value: 'high floor' }]);
    });

    it('matches an existing guest by phone when externalId is unknown', async () => {
      const existingId = generateId('guest');
      await db.insert(guests).values({
        id: existingId,
        firstName: 'Old',
        lastName: 'Name',
        phone: '+14155551234',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      const { guest, action } = await pmsSyncService.upsertGuest(
        makeNormalizedGuest({ externalId: 'new-ext-id', email: undefined, firstName: 'New' })
      );

      expect(action).toBe('updated');
      expect(guest.id).toBe(existingId);
      expect(guest.firstName).toBe('New');
    });

    it('matches an existing guest by email when phone is absent', async () => {
      const existingId = generateId('guest');
      await db.insert(guests).values({
        id: existingId,
        firstName: 'Old',
        lastName: 'Name',
        email: 'shared@example.com',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      const { guest, action } = await pmsSyncService.upsertGuest(
        makeNormalizedGuest({ externalId: 'ext-2', phone: undefined, email: 'shared@example.com' })
      );

      expect(action).toBe('updated');
      expect(guest.id).toBe(existingId);
    });

    it('creates a new guest when no match is found', async () => {
      const { guest, action } = await pmsSyncService.upsertGuest(
        makeNormalizedGuest({ externalId: 'brand-new', email: 'brandnew@example.com', phone: undefined })
      );

      expect(action).toBe('created');
      const externalIds = JSON.parse(guest.externalIds || '{}');
      expect(externalIds.mews).toBe('brand-new');
    });
  });

  describe('findActiveReservation', () => {
    it('returns the soonest upcoming confirmed/checked_in reservation', async () => {
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'Active',
        lastName: 'Guest',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

      await db.insert(reservations).values([
        {
          id: generateId('reservation'),
          guestId,
          confirmationNumber: 'ACTIVE-1',
          roomType: 'Standard',
          arrivalDate: farFuture,
          departureDate: farFuture,
          status: 'confirmed',
          createdAt: now(),
          updatedAt: now(),
        },
        {
          id: generateId('reservation'),
          guestId,
          confirmationNumber: 'ACTIVE-2',
          roomType: 'Standard',
          arrivalDate: future,
          departureDate: future,
          status: 'confirmed',
          createdAt: now(),
          updatedAt: now(),
        },
      ]);

      const active = await pmsSyncService.findActiveReservation(guestId);
      expect(active?.confirmationNumber).toBe('ACTIVE-2');
    });

    it('returns null when the guest has no active reservation', async () => {
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'No',
        lastName: 'Reservations',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      const active = await pmsSyncService.findActiveReservation(guestId);
      expect(active).toBeNull();
    });
  });

  describe('refreshIfStale', () => {
    async function insertReservation(overrides: Partial<typeof reservations.$inferInsert> = {}) {
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'Stale',
        lastName: 'Guest',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });
      const id = generateId('reservation');
      await db.insert(reservations).values({
        id,
        guestId,
        confirmationNumber: 'STALE-1',
        externalId: 'ext-stale-1',
        roomType: 'Standard',
        arrivalDate: '2026-08-01',
        departureDate: '2026-08-05',
        status: 'confirmed',
        syncedAt: now(),
        createdAt: now(),
        updatedAt: now(),
        ...overrides,
      });
      return id;
    }

    it('returns null when the reservation does not exist locally', async () => {
      mockRegistry(makeAdapter());
      const result = await pmsSyncService.refreshIfStale('does-not-exist');
      expect(result).toBeNull();
    });

    it('returns local data unchanged when no PMS adapter is active', async () => {
      const id = await insertReservation();
      mockRegistry(undefined);

      const result = await pmsSyncService.refreshIfStale(id);
      expect(result?.id).toBe(id);
    });

    it('returns fresh local data without calling the PMS when within the staleness threshold', async () => {
      const id = await insertReservation({ syncedAt: now() });
      const adapter = makeAdapter();
      mockRegistry(adapter);

      const result = await pmsSyncService.refreshIfStale(id, 60 * 60 * 1000);

      expect(result?.id).toBe(id);
      expect(adapter.getReservation).not.toHaveBeenCalled();
    });

    it('refreshes from the PMS when local data is stale', async () => {
      const staleTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const id = await insertReservation({ syncedAt: staleTime });

      const fresh = makeNormalizedReservation({
        externalId: 'ext-stale-1',
        confirmationNumber: 'STALE-1',
        roomNumber: '999',
      });
      const adapter = makeAdapter({ getReservation: vi.fn().mockResolvedValue(fresh) });
      mockRegistry(adapter);

      const result = await pmsSyncService.refreshIfStale(id, 1000);

      expect(adapter.getReservation).toHaveBeenCalledWith('ext-stale-1');
      expect(result?.roomNumber).toBe('999');
    });

    it('falls back to getReservationByConfirmation when the local record has no externalId', async () => {
      const staleTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const id = await insertReservation({ syncedAt: staleTime, externalId: null });

      const fresh = makeNormalizedReservation({ externalId: 'ext-stale-1', confirmationNumber: 'STALE-1' });
      const adapter = makeAdapter({
        getReservationByConfirmation: vi.fn().mockResolvedValue(fresh),
      });
      mockRegistry(adapter);

      const result = await pmsSyncService.refreshIfStale(id, 1000);

      expect(adapter.getReservationByConfirmation).toHaveBeenCalledWith('STALE-1');
      expect(adapter.getReservation).not.toHaveBeenCalled();
      expect(result?.confirmationNumber).toBe('STALE-1');
    });

    it('uses the configured stalenessThreshold from the active PMS app over the maxAgeMs param', async () => {
      // syncedAt is 2 seconds old; app config says 1ms threshold (always stale),
      // so even a large maxAgeMs param should be ignored in favor of config.
      const recentTime = new Date(Date.now() - 2000).toISOString();
      const id = await insertReservation({ syncedAt: recentTime });

      const fresh = makeNormalizedReservation({ externalId: 'ext-stale-1', confirmationNumber: 'STALE-1' });
      const adapter = makeAdapter({ getReservation: vi.fn().mockResolvedValue(fresh) });
      mockRegistry(adapter, { stalenessThreshold: 0.001 });

      await pmsSyncService.refreshIfStale(id, 60 * 60 * 1000);

      expect(adapter.getReservation).toHaveBeenCalled();
    });

    it('returns stale local data when the PMS call fails during refresh', async () => {
      const staleTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const id = await insertReservation({ syncedAt: staleTime });

      const adapter = makeAdapter({
        getReservation: vi.fn().mockRejectedValue(new Error('PMS timeout')),
      });
      mockRegistry(adapter);

      const result = await pmsSyncService.refreshIfStale(id, 1000);

      expect(result?.id).toBe(id);
      expect(result?.confirmationNumber).toBe('STALE-1');
    });

    it('dedupes concurrent refresh calls for the same reservation', async () => {
      const staleTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const id = await insertReservation({ syncedAt: staleTime });

      let resolveGetReservation!: (v: NormalizedReservation | null) => void;
      const pending = new Promise<NormalizedReservation | null>((resolve) => {
        resolveGetReservation = resolve;
      });
      const adapter = makeAdapter({ getReservation: vi.fn().mockReturnValue(pending) });
      mockRegistry(adapter);

      const call1 = pmsSyncService.refreshIfStale(id, 1000);
      const call2 = pmsSyncService.refreshIfStale(id, 1000);

      resolveGetReservation(null);
      const [res1, res2] = await Promise.all([call1, call2]);

      expect(adapter.getReservation).toHaveBeenCalledTimes(1);
      expect(res1?.id).toBe(id);
      expect(res2?.id).toBe(id);
    });
  });

  describe('refreshReservationByConfirmation', () => {
    it('returns null when no reservation matches the confirmation number', async () => {
      mockRegistry(makeAdapter());
      const result = await pmsSyncService.refreshReservationByConfirmation('NOPE');
      expect(result).toBeNull();
    });

    it('looks up by confirmation number then delegates to refreshIfStale', async () => {
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'Conf',
        lastName: 'Lookup',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });
      const resId = generateId('reservation');
      await db.insert(reservations).values({
        id: resId,
        guestId,
        confirmationNumber: 'CONF-LOOKUP',
        roomType: 'Standard',
        arrivalDate: '2026-08-01',
        departureDate: '2026-08-05',
        status: 'confirmed',
        syncedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      });
      mockRegistry(undefined);

      const result = await pmsSyncService.refreshReservationByConfirmation('CONF-LOOKUP');
      expect(result?.id).toBe(resId);
    });
  });

  describe('mapReservationStatus (via upsertReservation)', () => {
    it('falls back to confirmed for an unrecognized PMS status', async () => {
      const pmsRes = makeNormalizedReservation({
        // @ts-expect-error -- intentionally invalid status to exercise the fallback branch
        status: 'some_unknown_status',
      });

      const outcome = await pmsSyncService.upsertReservation(pmsRes);
      expect(outcome).toBe('created');

      const [row] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.confirmationNumber, pmsRes.confirmationNumber));
      expect(row!.status).toBe('confirmed');
    });
  });
});

describe('getPMSSyncConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns code defaults when no PMS app is active', () => {
    mockRegistry(undefined);
    const config = getPMSSyncConfig();
    expect(config.stalenessThresholdMs).toBe(5 * 60 * 1000);
    expect(config.syncIntervalMs).toBe(900 * 1000);
  });

  it('reads stalenessThreshold and syncInterval from the active PMS app config', () => {
    mockRegistry(makeAdapter(), { stalenessThreshold: 120, syncInterval: 60 });
    const config = getPMSSyncConfig();
    expect(config.stalenessThresholdMs).toBe(120 * 1000);
    expect(config.syncIntervalMs).toBe(60 * 1000);
  });
});
