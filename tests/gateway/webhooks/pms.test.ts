/**
 * PMS Webhook Tests
 *
 * Covers src/gateway/routes/webhooks/pms.ts:
 * - Generic /guests, /reservations, /events endpoints (secret header/bearer
 *   auth, payload validation, dispatch to pmsSyncService)
 * - PMS-specific /mews (adapter-provided signature check, batch event
 *   handling) and /cloudbeds endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/apps/config.js', () => ({
  appConfigService: {
    getAppConfig: vi.fn(),
  },
}));

const mockGetActivePMSAdapter = vi.fn();
vi.mock('@/apps/index.js', () => ({
  getAppRegistry: () => ({
    getActivePMSAdapter: mockGetActivePMSAdapter,
  }),
}));

const mockUpsertGuest = vi.fn();
const mockUpsertReservation = vi.fn();
vi.mock('@/apps/pms/sync.js', () => ({
  pmsSyncService: {
    upsertGuest: (...args: unknown[]) => mockUpsertGuest(...args),
    upsertReservation: (...args: unknown[]) => mockUpsertReservation(...args),
  },
}));

import { app } from '@/gateway/server.js';
import { appConfigService } from '@/apps/config.js';

const mockGetAppConfig = appConfigService.getAppConfig as ReturnType<typeof vi.fn>;

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Configure appConfigService so only `extId` has a webhookSecret set. */
function configureSecret(extId: string, secret: string) {
  mockGetAppConfig.mockImplementation(async (id: string) => {
    if (id === extId) {
      return { config: { webhookSecret: secret } };
    }
    return null;
  });
}

const validGuest = {
  externalId: 'guest-ext-1',
  source: 'mews',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

const validReservation = {
  externalId: 'res-ext-1',
  source: 'mews',
  confirmationNumber: 'CONF-1',
  guest: validGuest,
  roomType: 'King Suite',
  arrivalDate: '2026-08-01',
  departureDate: '2026-08-03',
  status: 'confirmed',
};

describe('PMS Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppConfig.mockResolvedValue(null);
    mockGetActivePMSAdapter.mockReturnValue(undefined);
  });

  describe('POST /webhooks/pms/guests', () => {
    it('rejects when no secret header is provided and a secret is configured (missing credential)', async () => {
      configureSecret('mews', 'guest-secret');

      const res = await postJson('/webhooks/pms/guests', validGuest);

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('rejects when the secret header value is wrong', async () => {
      configureSecret('mews', 'guest-secret');

      const res = await postJson('/webhooks/pms/guests', validGuest, { 'x-webhook-secret': 'wrong' });

      expect(res.status).toBe(401);
    });

    it('accepts a matching x-webhook-secret header and syncs the guest', async () => {
      configureSecret('mews', 'guest-secret');
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'created' });

      const res = await postJson('/webhooks/pms/guests', validGuest, { 'x-webhook-secret': 'guest-secret' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      await vi.waitFor(() => expect(mockUpsertGuest).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'guest-ext-1' })));
    });

    it('accepts a matching secret passed as a Bearer authorization header', async () => {
      configureSecret('mock-pms', 'bearer-secret');
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'created' });

      const res = await postJson('/webhooks/pms/guests', validGuest, { authorization: 'Bearer bearer-secret' });

      expect(res.status).toBe(200);
    });

    it('CHARACTERIZATION: allows requests with no header when no webhook secret is configured anywhere (dev-mode bypass)', async () => {
      mockGetAppConfig.mockResolvedValue(null); // none of the 5 PMS extensions have a secret configured
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'created' });

      const res = await postJson('/webhooks/pms/guests', validGuest);

      expect(res.status).toBe(200);
    });

    it('returns 400 for a payload missing required fields', async () => {
      const res = await postJson('/webhooks/pms/guests', { firstName: 'Jane' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await postJson('/webhooks/pms/guests', '{not-json');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /webhooks/pms/reservations', () => {
    it('rejects when secret is missing and configured elsewhere', async () => {
      configureSecret('cloudbeds', 'res-secret');

      const res = await postJson('/webhooks/pms/reservations', validReservation);

      expect(res.status).toBe(401);
    });

    it('accepts a valid payload with matching secret and syncs the reservation', async () => {
      configureSecret('cloudbeds', 'res-secret');
      mockUpsertReservation.mockResolvedValue('created');

      const res = await postJson('/webhooks/pms/reservations', validReservation, {
        'x-webhook-secret': 'res-secret',
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() =>
        expect(mockUpsertReservation).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'res-ext-1' }))
      );
    });

    it('returns 400 for a payload missing required fields', async () => {
      const res = await postJson('/webhooks/pms/reservations', { externalId: 'x' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /webhooks/pms/events', () => {
    it('rejects when secret is missing and configured', async () => {
      configureSecret('mews', 'evt-secret');

      const res = await postJson('/webhooks/pms/events', {
        type: 'guest.updated',
        source: 'mews',
        data: { guest: validGuest },
      });

      expect(res.status).toBe(401);
    });

    it('dispatches guest.updated events to upsertGuest', async () => {
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'updated' });

      const res = await postJson('/webhooks/pms/events', {
        type: 'guest.updated',
        source: 'mews',
        data: { guest: validGuest },
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(mockUpsertGuest).toHaveBeenCalled());
    });

    it('dispatches reservation.created events to upsertReservation', async () => {
      mockUpsertReservation.mockResolvedValue('created');

      const res = await postJson('/webhooks/pms/events', {
        type: 'reservation.created',
        source: 'mews',
        data: { reservation: validReservation },
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(mockUpsertReservation).toHaveBeenCalled());
    });

    it('dispatches reservation.cancelled events with status forced to cancelled', async () => {
      mockUpsertReservation.mockResolvedValue('updated');

      const res = await postJson('/webhooks/pms/events', {
        type: 'reservation.cancelled',
        source: 'mews',
        data: { reservation: validReservation },
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() =>
        expect(mockUpsertReservation).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
      );
    });

    it('handles room.status_changed events without calling the sync service', async () => {
      const res = await postJson('/webhooks/pms/events', {
        type: 'room.status_changed',
        source: 'mews',
        data: { roomNumber: '101', previousStatus: 'dirty', newStatus: 'clean' },
      });

      expect(res.status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockUpsertGuest).not.toHaveBeenCalled();
      expect(mockUpsertReservation).not.toHaveBeenCalled();
    });

    it('returns 400 for an unknown event type', async () => {
      const res = await postJson('/webhooks/pms/events', {
        type: 'not.a.real.type',
        source: 'mews',
        data: {},
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /webhooks/pms/mews', () => {
    it('returns 400 when no PMS adapter is active', async () => {
      mockGetActivePMSAdapter.mockReturnValue(undefined);

      const res = await postJson('/webhooks/pms/mews', { Events: [] });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'PMS not configured' });
    });

    it('returns 400 when the active adapter is not Mews', async () => {
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'cloudbeds' });

      const res = await postJson('/webhooks/pms/mews', { Events: [] });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'PMS mismatch' });
    });

    it('rejects when the signature header is missing entirely (missing credential)', async () => {
      const verifyWebhookSignature = vi.fn().mockReturnValue(false);
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'mews', verifyWebhookSignature });

      const res = await postJson('/webhooks/pms/mews', { Events: [{ Type: 'ReservationCreated', Id: 'e1' }] });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
      // The adapter must still be called so it can see the credential is absent —
      // an empty string, not a skipped call.
      expect(verifyWebhookSignature).toHaveBeenCalledWith(expect.any(String), '');
    });

    it('rejects when the signature header is present but the adapter rejects it', async () => {
      const verifyWebhookSignature = vi.fn().mockReturnValue(false);
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'mews', verifyWebhookSignature });

      const res = await postJson(
        '/webhooks/pms/mews',
        { Events: [{ Type: 'ReservationCreated', Id: 'e1' }] },
        { 'x-mews-signature': 'bad-sig' }
      );

      expect(res.status).toBe(401);
    });

    it('processes every event in a batched payload, not just the first', async () => {
      const verifyWebhookSignature = vi.fn().mockReturnValue(true);
      const parseWebhook = vi
        .fn()
        .mockResolvedValueOnce({ type: 'reservation.created', source: 'mews', timestamp: '2026-01-01T00:00:00Z', data: { reservation: validReservation } })
        .mockResolvedValueOnce({ type: 'guest.updated', source: 'mews', timestamp: '2026-01-01T00:00:00Z', data: { guest: validGuest } })
        .mockResolvedValueOnce({ type: 'reservation.cancelled', source: 'mews', timestamp: '2026-01-01T00:00:00Z', data: { reservation: validReservation } });
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'mews', verifyWebhookSignature, parseWebhook });
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'updated' });
      mockUpsertReservation.mockResolvedValue('created');

      const events = [
        { Type: 'ReservationCreated', Id: 'e1' },
        { Type: 'GuestUpdated', Id: 'e2' },
        { Type: 'ReservationCancelled', Id: 'e3' },
      ];
      const res = await postJson('/webhooks/pms/mews', { Events: events }, { 'x-mews-signature': 'good-sig' });

      expect(res.status).toBe(200);
      // Each event is parsed individually, wrapped in its own single-event payload.
      await vi.waitFor(() => expect(parseWebhook).toHaveBeenCalledTimes(3));
      expect(parseWebhook).toHaveBeenNthCalledWith(1, { Events: [events[0]] }, { 'x-mews-signature': 'good-sig' });
      expect(parseWebhook).toHaveBeenNthCalledWith(2, { Events: [events[1]] }, { 'x-mews-signature': 'good-sig' });
      expect(parseWebhook).toHaveBeenNthCalledWith(3, { Events: [events[2]] }, { 'x-mews-signature': 'good-sig' });
      await vi.waitFor(() => expect(mockUpsertReservation).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(mockUpsertGuest).toHaveBeenCalledTimes(1));
    });

    it('skips signature verification when the adapter does not implement it', async () => {
      const parseWebhook = vi.fn().mockResolvedValue(null);
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'mews', parseWebhook });

      const res = await postJson('/webhooks/pms/mews', { Events: [{ Type: 'X', Id: 'e1' }] });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /webhooks/pms/cloudbeds', () => {
    it('returns 400 when no PMS adapter is active', async () => {
      mockGetActivePMSAdapter.mockReturnValue(undefined);

      const res = await postJson('/webhooks/pms/cloudbeds', {});

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'PMS not configured' });
    });

    it('returns 400 when the active adapter is not Cloudbeds', async () => {
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'mews' });

      const res = await postJson('/webhooks/pms/cloudbeds', {});

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'PMS mismatch' });
    });

    it('parses and processes a Cloudbeds event', async () => {
      const parseWebhook = vi.fn().mockResolvedValue({
        type: 'guest.updated',
        source: 'cloudbeds',
        timestamp: '2026-01-01T00:00:00Z',
        data: { guest: validGuest },
      });
      mockGetActivePMSAdapter.mockReturnValue({ provider: 'cloudbeds', parseWebhook });
      mockUpsertGuest.mockResolvedValue({ guest: { id: 'g1' }, action: 'updated' });

      const res = await postJson('/webhooks/pms/cloudbeds', { event: 'reservation/status_changed' });

      expect(res.status).toBe(200);
      expect(parseWebhook).toHaveBeenCalledWith({ event: 'reservation/status_changed' });
      await vi.waitFor(() => expect(mockUpsertGuest).toHaveBeenCalled());
    });
  });
});
