/**
 * WebChat Action Service Tests
 *
 * Covers the critical verification flow and action handlers.
 * Written before extracting webchat-verification.ts to prevent regressions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, webchatSessions, guests, reservations } from '@/db/index.js';
import { WebChatActionService } from '@/apps/channels/webchat/actions.js';
import { webchatSessionService } from '@/services/webchat-session.js';
import { guestService } from '@/services/guest.js';
import type { NormalizedReservation } from '@/core/interfaces/pms.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so variables used inside
// them must be defined with vi.hoisted() to avoid "cannot access before init" errors.

const { mockSend, mockGetActivePMSAdapter } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetActivePMSAdapter: vi.fn(() => null as unknown),
}));

vi.mock('@/apps/channels/webchat/connections.js', () => ({
  webchatConnectionManager: { send: mockSend },
  getSessionLocale: vi.fn(() => 'en'),
}));

vi.mock('@/apps/registry.js', () => ({
  getAppRegistry: () => ({ getActivePMSAdapter: mockGetActivePMSAdapter }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unique suffix per test run to avoid cross-test data collisions */
const RUN = Date.now();

function uid(label: string) {
  return `${label}-${RUN}-${Math.random().toString(36).slice(2)}`;
}

/** ISO date (YYYY-MM-DD) N days from now — avoids hardcoded calendar dates rotting. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
}

/**
 * All fixture reservations in this file share the confirmation number 'BK-TEST'
 * (the makeReservation() default). completeVerification() upserts a local
 * `reservations` row keyed by confirmationNumber, so any test that drives a
 * successful verification must delete that row before deleting the guest it
 * points at, or the FK constraint on reservations.guestId trips.
 */
async function cleanupBkTestReservation() {
  await db.delete(reservations).where(eq(reservations.confirmationNumber, 'BK-TEST'));
}

function makeReservation(overrides: Partial<NormalizedReservation> = {}): NormalizedReservation {
  return {
    externalId: 'ext-1',
    source: 'mock',
    confirmationNumber: 'BK-TEST',
    guest: {
      externalId: 'guest-ext-1',
      source: 'mock',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+15551234567',
    },
    roomType: 'standard',
    arrivalDate: '2026-04-01',
    departureDate: '2026-04-05',
    status: 'confirmed',
    adults: 1,
    children: 0,
    ...overrides,
  };
}

function makePMS(reservation: NormalizedReservation | null = makeReservation()) {
  return {
    getReservationByConfirmation: vi.fn(async () => reservation),
    searchReservations: vi.fn(async () => (reservation ? [reservation] : [])),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebChatActionService', () => {
  let service: WebChatActionService;

  beforeEach(() => {
    service = new WebChatActionService();
    mockSend.mockClear();
    mockGetActivePMSAdapter.mockReset();
    mockGetActivePMSAdapter.mockReturnValue(null);
  });

  // ── getActions ──────────────────────────────────────────────────────────────

  describe('getActions', () => {
    it('returns the verify-reservation action', () => {
      // Only verify-reservation remains after the "simplify webchat actions"
      // refactor (commit 0321dc6) removed extend-stay/request-service/
      // order-room-service/book-spa from src/apps/channels/webchat/actions.ts.
      const actions = service.getActions();
      expect(actions).toHaveLength(1);
      expect(actions.map((a) => a.id)).toEqual(['verify-reservation']);
    });

    it('strips endpoint from returned actions', () => {
      for (const action of service.getActions()) {
        expect(action).not.toHaveProperty('endpoint');
      }
    });
  });

  // ── execute() pre-flight guards ─────────────────────────────────────────────
  //
  // NOTE: getEnabledActions()/isActionEnabled() and the action_disabled /
  // verification_required checks that depended on them were removed from
  // src/apps/channels/webchat/actions.ts in commit 0321dc6 ("simplify webchat
  // actions"), along with the extend-stay/request-service/order-room-service/
  // book-spa actions. Those tests are gone too — there is no method left to
  // call and, since verify-reservation is the only remaining action and it has
  // requiresVerification: false, the verification_required branch in
  // execute() is currently unreachable through any registered action. That
  // looks like dead code left over from the simplification, not something to
  // paper over here — see final report.

  describe('execute() pre-flight', () => {
    it('returns invalid_session for an unknown token', async () => {
      const result = await service.execute('verify-reservation', 'bad-token-xyz', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_session');
    });

    it('returns input_too_long when a field exceeds 500 characters', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-123',
          lastName: 'a'.repeat(501),
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('input_too_long');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });
  });

  // ── verify-reservation: top-level guards ────────────────────────────────────

  describe('verify-reservation: top-level guards', () => {
    it('returns attempts_exceeded when session has >= 5 failed attempts', async () => {
      const session = await webchatSessionService.create();
      for (let i = 0; i < 5; i++) {
        await webchatSessionService.incrementVerificationAttempts(session.id);
      }
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-000',
          lastName: 'Test',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('attempts_exceeded');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns invalid_method for an unrecognised method', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'pigeon-post',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_method');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });
  });

  // ── verifyByBookingName ──────────────────────────────────────────────────────

  describe('verifyByBookingName', () => {
    it('returns missing_fields when confirmationNumber is absent', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          lastName: 'Smith',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_fields');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns missing_fields when lastName is absent', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-123',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_fields');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns not_found and increments attempts when PMS returns no reservation', async () => {
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(makePMS(null));
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-UNKNOWN',
          lastName: 'Smith',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('not_found');
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationAttempts).toBe(1);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns mismatch and increments attempts when last name does not match', async () => {
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(makePMS());
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Wrong',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('mismatch');
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationAttempts).toBe(1);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('is case-insensitive for last name comparison', async () => {
      const email = uid('case-name') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'g1', source: 'mock', firstName: 'Jane', lastName: 'Smith', email } }))
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'SMITH',
        });
        expect(result.success).toBe(true);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });

    it('marks session verified and returns guest name on success', async () => {
      const email = uid('name-ok') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'g2', source: 'mock', firstName: 'Jane', lastName: 'Smith', email } }))
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Smith',
        });
        expect(result.success).toBe(true);
        expect(result.data?.guestName).toBe('Jane Smith');
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationStatus).toBe('verified');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });
  });

  // ── verifyByBookingEmail ─────────────────────────────────────────────────────

  describe('verifyByBookingEmail', () => {
    it('returns missing_fields when email is absent', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-email',
          confirmationNumber: 'BK-TEST',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_fields');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns mismatch and increments attempts when email does not match', async () => {
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(makePMS());
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-email',
          confirmationNumber: 'BK-TEST',
          email: 'wrong@test.com',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('mismatch');
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationAttempts).toBe(1);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('is case-insensitive for email comparison', async () => {
      const email = uid('case-email') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'g3', source: 'mock', firstName: 'Jane', lastName: 'Smith', email } }))
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-email',
          confirmationNumber: 'BK-TEST',
          email: email.toUpperCase(),
        });
        expect(result.success).toBe(true);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });

    it('marks session verified on correct email match', async () => {
      const email = uid('email-ok') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'g4', source: 'mock', firstName: 'Jane', lastName: 'Smith', email } }))
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'booking-email',
          confirmationNumber: 'BK-TEST',
          email,
        });
        expect(result.success).toBe(true);
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationStatus).toBe('verified');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });
  });

  // ── verifyEmailCodeStep1 (send code) ─────────────────────────────────────────

  describe('verifyEmailCodeStep1', () => {
    it('returns missing_fields when email is absent', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_fields');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns not_found when no PMS adapter is configured and no local guest matches', async () => {
      // src/services/verification.ts has no distinct "no PMS" error: when
      // getActivePMSAdapter() returns null, lookupReservationsByEmail() falls
      // straight through to the local-DB fallback (see the module docstring),
      // and an unknown email there just yields not_found.
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(null);
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: uid('nopms') + '@test.com',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('not_found');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns not_found when PMS finds no reservations for the email', async () => {
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue({
        getReservationByConfirmation: vi.fn(),
        searchReservations: vi.fn(async () => []),
      });
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: uid('notfound') + '@test.com',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('not_found');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns nextStep with code field and persists hashed code on success', async () => {
      const email = uid('step1ok') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue({
        getReservationByConfirmation: vi.fn(),
        searchReservations: vi.fn(async () => [
          makeReservation({ guest: { externalId: 'g5', source: 'mock', firstName: 'A', lastName: 'B', email } }),
        ]),
      });
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email,
        });
        expect(result.success).toBe(true);
        expect(result.nextStep).toBeDefined();
        expect(result.nextStep?.fields[0]?.key).toBe('code');
        expect(result.nextStep?.context?.email).toBe(email);

        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationCode).toHaveLength(64); // SHA-256 hex
        expect(updated?.verificationCodeExpiresAt).toBeTruthy();
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('rate-limits requests per session (max 3 per hour)', async () => {
      const email = uid('ratelimit-session') + '@test.com';
      const session = await webchatSessionService.create();
      const pms = {
        getReservationByConfirmation: vi.fn(),
        searchReservations: vi.fn(async () => [
          makeReservation({ guest: { externalId: 'g6', source: 'mock', firstName: 'A', lastName: 'B', email } }),
        ]),
      };
      mockGetActivePMSAdapter.mockReturnValue(pms);

      try {
        // First 3 succeed (or fail for other reasons but not rate limit)
        for (let i = 0; i < 3; i++) {
          const r = await service.execute('verify-reservation', session.token, {
            method: 'email-code',
            email,
          });
          expect(r.error).not.toBe('rate_limited');
        }
        // 4th should be rate limited
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('rate_limited');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });
  });

  // ── verifyEmailCodeStep2 (submit code) ───────────────────────────────────────

  describe('verifyEmailCodeStep2', () => {
    it('returns no_code when session has no pending verification code', async () => {
      const session = await webchatSessionService.create();
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: 'x@test.com',
          code: '123456',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('no_code');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns code_expired when code is past its expiry time', async () => {
      const session = await webchatSessionService.create();
      const hash = createHash('sha256').update('000000').digest('hex');
      await webchatSessionService.setVerificationCode(
        session.id,
        hash,
        new Date(Date.now() - 1000).toISOString(), // already expired
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: 'x@test.com',
          code: '000000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('code_expired');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns code_mismatch and increments attempts for wrong code', async () => {
      const session = await webchatSessionService.create();
      const hash = createHash('sha256').update('654321').digest('hex');
      await webchatSessionService.setVerificationCode(
        session.id,
        hash,
        new Date(Date.now() + 600_000).toISOString(),
      );
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: 'x@test.com',
          code: '000000', // wrong
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('code_mismatch');
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationAttempts).toBe(1);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('returns not_found when correct code but no PMS adapter and no local match', async () => {
      const session = await webchatSessionService.create();
      const code = '112233';
      const hash = createHash('sha256').update(code).digest('hex');
      await webchatSessionService.setVerificationCode(
        session.id,
        hash,
        new Date(Date.now() + 600_000).toISOString(),
      );
      mockGetActivePMSAdapter.mockReturnValue(null);
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email: 'x@test.com',
          code,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('not_found');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
      }
    });

    it('marks session verified with correct code and returns guest check-in/out dates', async () => {
      const email = uid('step2ok') + '@test.com';
      const session = await webchatSessionService.create();
      const code = '987654';
      const hash = createHash('sha256').update(code).digest('hex');
      await webchatSessionService.setVerificationCode(
        session.id,
        hash,
        new Date(Date.now() + 600_000).toISOString(),
      );
      const checkIn = daysFromNow(10);
      const checkOut = daysFromNow(14);
      mockGetActivePMSAdapter.mockReturnValue({
        getReservationByConfirmation: vi.fn(),
        searchReservations: vi.fn(async () => [
          makeReservation({
            guest: { externalId: 'g7', source: 'mock', firstName: 'Bob', lastName: 'Jones', email },
            arrivalDate: checkIn,
            departureDate: checkOut,
          }),
        ]),
      });
      try {
        const result = await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email,
          code,
        });
        expect(result.success).toBe(true);
        expect(result.data?.checkIn).toBe(checkIn);
        expect(result.data?.checkOut).toBe(checkOut);
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.verificationStatus).toBe('verified');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });
  });

  // ── completeVerification ─────────────────────────────────────────────────────

  describe('completeVerification', () => {
    it('creates a new guest when not already in DB', async () => {
      const email = uid('newguest') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'gn', source: 'mock', firstName: 'New', lastName: 'Person', email } }))
      );
      try {
        await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Person',
        });
        const created = await guestService.findByEmail(email);
        expect(created).toBeTruthy();
        expect(created?.firstName).toBe('New');
        expect(created?.lastName).toBe('Person');
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });

    it('finds existing guest by email without creating a duplicate', async () => {
      const email = uid('existing') + '@test.com';
      const existing = await guestService.create({ firstName: 'Existing', lastName: 'Person', email });
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'ge', source: 'mock', firstName: 'Existing', lastName: 'Person', email } }))
      );
      try {
        await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Person',
        });
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.guestId).toBe(existing.id);
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.id, existing.id));
      }
    });

    it('broadcasts session_update with verified status to all tabs', async () => {
      const email = uid('broadcast') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'gb', source: 'mock', firstName: 'Bc', lastName: 'Test', email } }))
      );
      try {
        await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Test',
        });
        const sessionUpdateCall = mockSend.mock.calls.find(([, msg]) => msg?.type === 'session_update');
        expect(sessionUpdateCall).toBeTruthy();
        expect(sessionUpdateCall?.[1]).toMatchObject({
          type: 'session_update',
          verificationStatus: 'verified',
        });
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });

    it('links session to guestId after verification', async () => {
      const email = uid('link') + '@test.com';
      const session = await webchatSessionService.create();
      mockGetActivePMSAdapter.mockReturnValue(
        makePMS(makeReservation({ guest: { externalId: 'gl', source: 'mock', firstName: 'Link', lastName: 'Test', email } }))
      );
      try {
        await service.execute('verify-reservation', session.token, {
          method: 'booking-name',
          confirmationNumber: 'BK-TEST',
          lastName: 'Test',
        });
        const updated = await webchatSessionService.findById(session.id);
        expect(updated?.guestId).toBeTruthy();
        expect(updated?.reservationId).toBeTruthy();
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    });
  });

  // ── pickBestReservation ───────────────────────────────────────────────────────
  // Exercised indirectly through verifyEmailCodeStep2 which calls searchReservations.

  describe('pickBestReservation', () => {
    // Takes `email` as a parameter (rather than generating its own) so the
    // cleanup below actually targets the guest that verification creates —
    // it previously used an unrelated uid('pick') email, so the delete
    // matched nothing and the created guest/reservation silently leaked.
    async function runWithReservations(email: string, reservations: NormalizedReservation[]) {
      const session = await webchatSessionService.create();
      const code = '333333';
      const hash = createHash('sha256').update(code).digest('hex');
      await webchatSessionService.setVerificationCode(
        session.id,
        hash,
        new Date(Date.now() + 600_000).toISOString(),
      );
      mockGetActivePMSAdapter.mockReturnValue({
        getReservationByConfirmation: vi.fn(),
        searchReservations: vi.fn(async () => reservations),
      });
      try {
        return await service.execute('verify-reservation', session.token, {
          method: 'email-code',
          email,
          code,
        });
      } finally {
        await db.delete(webchatSessions).where(eq(webchatSessions.id, session.id));
        await cleanupBkTestReservation();
        await db.delete(guests).where(eq(guests.email, email));
      }
    }

    it('returns not_found gracefully when list is empty', async () => {
      const email = uid('pick-empty') + '@test.com';
      const result = await runWithReservations(email, []);
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });

    it('prefers checked_in reservation over confirmed future ones', async () => {
      const email = uid('pick-checkin') + '@test.com';
      const checkedIn = makeReservation({ externalId: 'ci', status: 'checked_in', arrivalDate: daysFromNow(-5), departureDate: daysFromNow(4), guest: { externalId: 'gi', source: 'mock', firstName: 'CI', lastName: 'Guest', email } });
      const upcoming = makeReservation({ externalId: 'up', status: 'confirmed', arrivalDate: daysFromNow(20), departureDate: daysFromNow(24), guest: { externalId: 'gi', source: 'mock', firstName: 'CI', lastName: 'Guest', email } });
      const result = await runWithReservations(email, [upcoming, checkedIn]);
      // checked_in should win — confirmed by check-in dates in result
      expect(result.success).toBe(true);
      expect(result.data?.checkIn).toBe(checkedIn.arrivalDate);
    });

    it('picks earliest upcoming confirmed when none checked in', async () => {
      const email = uid('pick-upcoming') + '@test.com';
      const soon = makeReservation({ externalId: 'soon', status: 'confirmed', arrivalDate: daysFromNow(10), departureDate: daysFromNow(14), guest: { externalId: 'gu', source: 'mock', firstName: 'Up', lastName: 'Guest', email } });
      const later = makeReservation({ externalId: 'later', status: 'confirmed', arrivalDate: daysFromNow(60), departureDate: daysFromNow(64), guest: { externalId: 'gu', source: 'mock', firstName: 'Up', lastName: 'Guest', email } });
      const result = await runWithReservations(email, [later, soon]);
      expect(result.success).toBe(true);
      expect(result.data?.checkIn).toBe(soon.arrivalDate);
    });
  });

  // NOTE: this file used to end with handleExtendStay/handleRequestService/
  // handleOrderRoomService/handleBookSpa describe blocks. Those handlers
  // (and the extend-stay/request-service/order-room-service/book-spa actions
  // that dispatched to them) were deleted from
  // src/apps/channels/webchat/actions.ts in commit 0321dc6 ("simplify
  // webchat actions") — see the note above execute() pre-flight. The tests
  // were removed here rather than left calling actions that no longer exist.
});
