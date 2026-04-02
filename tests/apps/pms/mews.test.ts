/**
 * Mews PMS Adapter Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PMSConfig } from '@/core/interfaces/pms.js';
import type { PluginContext } from '@/apps/types.js';

const mockContext: PluginContext = {
  appLog: vi.fn().mockImplementation((_e: string, _d: unknown, fn: () => Promise<unknown>) => fn()),
};

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
const { MewsPMSAdapter, createMewsPMSAdapter, manifest } = await import(
  '@/apps/pms/providers/mews.js'
);

// ==================
// Test Helpers
// ==================

/**
 * Create a config matching the flat shape the registry actually passes.
 * Keys correspond to configSchema entries, NOT PMSConfig field names.
 */
function createFlatConfig(overrides: Record<string, unknown> = {}): PMSConfig {
  return {
    clientToken: 'client-token-123',
    accessToken: 'access-token-456',
    apiUrl: 'https://api.mews-demo.com/api/connector/v1',
    propertyId: 'enterprise-001',
    webhookSecret: 'test-secret',
    ...overrides,
  } as unknown as PMSConfig;
}

function mockApiResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

const MOCK_CUSTOMER = {
  Id: 'cust-001',
  FirstName: 'John',
  LastName: 'Smith',
  Email: 'john@example.com',
  Phone: '+14155551234',
  LanguageCode: 'en-US',
  NationalityCode: 'US',
  LoyaltyCode: 'Gold',
  Classifications: ['Vip'],
  Notes: 'Prefers high floor',
};

const MOCK_RESERVATION = {
  Id: 'res-001',
  ServiceId: 'svc-001',
  State: 'Started',
  Number: 'CONF-123',
  StartUtc: '2026-02-15T14:00:00Z',
  EndUtc: '2026-02-20T11:00:00Z',
  CustomerId: 'cust-001',
  RequestedResourceCategoryId: 'cat-001',
  AssignedResourceId: 'room-415',
  AdultCount: 2,
  ChildCount: 0,
  Notes: 'Late checkout requested',
  UpdatedUtc: '2026-02-15T10:00:00Z',
};

const MOCK_RESOURCE = {
  Id: 'room-415',
  Name: 'Room 415',
  Number: '415',
  State: 'Occupied',
  FloorNumber: '4',
  ResourceCategoryId: 'cat-001',
};

const MOCK_RESOURCE_CATEGORY = {
  Id: 'cat-001',
  Name: 'Deluxe King',
  Type: 'Room',
};

const MOCK_SERVICE = {
  Id: 'svc-001',
  Name: 'Accommodation',
  Type: 'Reservable',
};

// ==================
// Helper to set up mock fetch responses
// ==================

function setupFetchMock(responses: Record<string, unknown>) {
  mockFetch.mockImplementation(async (url: string) => {
    for (const [endpoint, data] of Object.entries(responses)) {
      if ((url as string).includes(endpoint)) {
        return mockApiResponse(data);
      }
    }
    return mockApiResponse({ error: 'Not found' }, 404);
  });
}

// ==================
// Tests
// ==================

describe('MewsPMSAdapter', () => {
  let adapter: InstanceType<typeof MewsPMSAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MewsPMSAdapter(createFlatConfig(), mockContext);
  });

  describe('constructor (config mapping)', () => {
    it('should read credentials from flat config keys', async () => {
      setupFetchMock({
        'configuration/get': { Enterprise: { Id: 'enterprise-001', Name: 'Test Hotel' } },
        'services/getAll': { Services: [MOCK_SERVICE] },
      });

      await adapter.testConnection();

      // Verify the tokens were injected into the request body
      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse((call[1] as { body: string }).body);
      expect(body.ClientToken).toBe('client-token-123');
      expect(body.AccessToken).toBe('access-token-456');
    });

    it('should fall back to PMSConfig fields when flat keys are absent', async () => {
      // Simulate old-style PMSConfig (e.g. from tests)
      const legacyConfig: PMSConfig = {
        provider: 'mews',
        apiUrl: 'https://api.mews-demo.com/api/connector/v1',
        clientId: 'legacy-client',
        apiKey: 'legacy-access',
        propertyId: 'enterprise-002',
      };

      const legacyAdapter = new MewsPMSAdapter(legacyConfig, mockContext);

      setupFetchMock({
        'configuration/get': { Enterprise: { Id: 'enterprise-002', Name: 'Legacy Hotel' } },
        'services/getAll': { Services: [MOCK_SERVICE] },
      });

      await legacyAdapter.testConnection();

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse((call[1] as { body: string }).body);
      expect(body.ClientToken).toBe('legacy-client');
      expect(body.AccessToken).toBe('legacy-access');
    });
  });

  describe('testConnection', () => {
    it('should return true with valid credentials', async () => {
      setupFetchMock({
        'configuration/get': { Enterprise: { Id: 'enterprise-001', Name: 'Test Hotel' } },
        'services/getAll': { Services: [MOCK_SERVICE] },
      });

      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when API returns error', async () => {
      mockFetch.mockResolvedValue(mockApiResponse({ error: 'Unauthorized' }, 401));

      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });

    it('should discover and cache serviceId', async () => {
      setupFetchMock({
        'configuration/get': { Enterprise: { Id: 'enterprise-001', Name: 'Test Hotel' } },
        'services/getAll': { Services: [MOCK_SERVICE, { Id: 'svc-002', Name: 'Spa', Type: 'Other' }] },
      });

      await adapter.testConnection();

      // Second call should use cached serviceId (no additional services/getAll call)
      setupFetchMock({
        'reservations/getAll': { Reservations: [], Cursor: undefined },
      });

      await adapter.getModifiedReservations(new Date());
      // If serviceId wasn't cached, this would fail because services/getAll is no longer mocked
    });
  });

  describe('getReservation', () => {
    it('should fetch and normalize a reservation', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION] },
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const result = await adapter.getReservation('res-001');

      expect(result).not.toBeNull();
      expect(result!.externalId).toBe('res-001');
      expect(result!.source).toBe('mews');
      expect(result!.confirmationNumber).toBe('CONF-123');
      expect(result!.status).toBe('checked_in');
      expect(result!.roomNumber).toBe('415');
      expect(result!.roomType).toBe('Deluxe King');
      expect(result!.adults).toBe(2);
      expect(result!.children).toBe(0);
      expect(result!.arrivalDate).toBe('2026-02-15');
      expect(result!.departureDate).toBe('2026-02-20');
      expect(result!.guest.firstName).toBe('John');
      expect(result!.guest.lastName).toBe('Smith');
      expect(result!.guest.vipStatus).toBe('VIP');
    });

    it('should return null for non-existent reservation', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      const result = await adapter.getReservation('non-existent');
      expect(result).toBeNull();
    });

    it('should return null when customer is missing', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION] },
        'customers/getAll': { Customers: [] },
      });

      const result = await adapter.getReservation('res-001');
      expect(result).toBeNull();
    });
  });

  describe('getReservationByConfirmation', () => {
    it('should search by confirmation number', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION] },
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const result = await adapter.getReservationByConfirmation('CONF-123');

      expect(result).not.toBeNull();
      expect(result!.confirmationNumber).toBe('CONF-123');

      // Verify the Numbers parameter was sent
      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.Numbers).toEqual(['CONF-123']);
    });
  });

  describe('getModifiedReservations', () => {
    it('should use UpdatedUtc filter with pagination', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION] },
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const since = new Date('2026-02-14T00:00:00Z');
      const results = await adapter.getModifiedReservations(since);

      expect(results).toHaveLength(1);

      // Verify UpdatedUtc and Limitation were set in the request
      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.UpdatedUtc.StartUtc).toBe(since.toISOString());
      expect(body.Limitation).toBeDefined();
      expect(body.Limitation.Count).toBe(100);
    });

    it('should clamp since date to 3-month max window', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
        'customers/getAll': { Customers: [] },
      });

      const oldDate = new Date('2020-01-01T00:00:00Z');
      await adapter.getModifiedReservations(oldDate);

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);

      // The StartUtc should be clamped to ~3 months ago, not 2020
      const startUtc = new Date(body.UpdatedUtc.StartUtc);
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      // Allow 1 second tolerance
      expect(Math.abs(startUtc.getTime() - threeMonthsAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('searchReservations', () => {
    it('should add default 1-year window when no date filter', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      await adapter.searchReservations({ status: 'confirmed' });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);

      // Should have a StartUtc default window
      expect(body.StartUtc).toBeDefined();
      expect(body.StartUtc.StartUtc).toBeDefined();
    });

    it('should convert date-only strings to full datetime', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      await adapter.searchReservations({ arrivalFrom: '2026-02-15', arrivalTo: '2026-02-20' });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.StartUtc.StartUtc).toBe('2026-02-15T00:00:00Z');
      expect(body.StartUtc.EndUtc).toBe('2026-02-20T00:00:00Z');
    });

    it('should search customers first when filtering by email', async () => {
      const callOrder: string[] = [];
      mockFetch.mockImplementation(async (url: string) => {
        if ((url as string).includes('services/getAll')) {
          return mockApiResponse({ Services: [MOCK_SERVICE] });
        }
        if ((url as string).includes('customers/search')) {
          callOrder.push('customers/search');
          return mockApiResponse({ Results: [MOCK_CUSTOMER] });
        }
        if ((url as string).includes('reservations/getAll')) {
          callOrder.push('reservations/getAll');
          return mockApiResponse({
            Reservations: [MOCK_RESERVATION],
          });
        }
        if ((url as string).includes('customers/getAll')) {
          return mockApiResponse({ Customers: [MOCK_CUSTOMER] });
        }
        if ((url as string).includes('resources/getAll')) {
          return mockApiResponse({ Resources: [MOCK_RESOURCE] });
        }
        if ((url as string).includes('resourceCategories/getAll')) {
          return mockApiResponse({ ResourceCategories: [MOCK_RESOURCE_CATEGORY] });
        }
        return mockApiResponse({ error: 'Not found' }, 404);
      });

      await adapter.searchReservations({ guestEmail: 'john@example.com' });

      // customers/search should come BEFORE reservations/getAll
      expect(callOrder[0]).toBe('customers/search');
      expect(callOrder[1]).toBe('reservations/getAll');
    });

    it('should return empty when email search finds no customers', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'customers/search': { Results: [] },
      });

      const results = await adapter.searchReservations({ guestEmail: 'nobody@example.com' });
      expect(results).toHaveLength(0);

      // Should NOT have called reservations/getAll
      const reservationCalls = mockFetch.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      expect(reservationCalls).toHaveLength(0);
    });

    it('should map departure filters to Mews EndUtc', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      await adapter.searchReservations({ departureFrom: '2026-02-20', departureTo: '2026-02-25' });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.EndUtc.StartUtc).toBe('2026-02-20T00:00:00Z');
      expect(body.EndUtc.EndUtc).toBe('2026-02-25T00:00:00Z');
    });

    it('should map modifiedSince to Mews UpdatedUtc', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      const since = new Date('2026-02-14T00:00:00Z');
      await adapter.searchReservations({ modifiedSince: since });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.UpdatedUtc.StartUtc).toBe(since.toISOString());
      expect(body.UpdatedUtc.EndUtc).toBeDefined();
    });

    it('should skip default 1-year window when departure or modifiedSince filter is present', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [] },
      });

      await adapter.searchReservations({ departureFrom: '2026-02-20' });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      // Should NOT have a default StartUtc window since departure filter is present
      expect(body.StartUtc).toBeUndefined();
      expect(body.EndUtc).toBeDefined();
    });

    it('should pass CustomerIds server-side when filtering by email', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if ((url as string).includes('services/getAll')) {
          return mockApiResponse({ Services: [MOCK_SERVICE] });
        }
        if ((url as string).includes('customers/search')) {
          return mockApiResponse({ Results: [MOCK_CUSTOMER] });
        }
        if ((url as string).includes('reservations/getAll')) {
          return mockApiResponse({ Reservations: [MOCK_RESERVATION] });
        }
        if ((url as string).includes('customers/getAll')) {
          return mockApiResponse({ Customers: [MOCK_CUSTOMER] });
        }
        if ((url as string).includes('resources/getAll')) {
          return mockApiResponse({ Resources: [MOCK_RESOURCE] });
        }
        if ((url as string).includes('resourceCategories/getAll')) {
          return mockApiResponse({ ResourceCategories: [MOCK_RESOURCE_CATEGORY] });
        }
        return mockApiResponse({ error: 'Not found' }, 404);
      });

      await adapter.searchReservations({ guestEmail: 'john@example.com' });

      const reservationCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('reservations/getAll')
      );
      const body = JSON.parse((reservationCall![1] as { body: string }).body);
      expect(body.CustomerIds).toEqual(['cust-001']);
    });
  });

  describe('getGuest', () => {
    it('should fetch and normalize a guest', async () => {
      setupFetchMock({
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
      });

      const result = await adapter.getGuest('cust-001');

      expect(result).not.toBeNull();
      expect(result!.externalId).toBe('cust-001');
      expect(result!.source).toBe('mews');
      expect(result!.firstName).toBe('John');
      expect(result!.lastName).toBe('Smith');
      expect(result!.email).toBe('john@example.com');
      expect(result!.phone).toBe('+14155551234');
      expect(result!.vipStatus).toBe('VIP');
      expect(result!.loyaltyTier).toBe('Gold');
    });
  });

  describe('getGuestByPhone', () => {
    it('should return null (Mews does not support phone search)', async () => {
      const result = await adapter.getGuestByPhone('+14155551234');
      expect(result).toBeNull();
      // No API calls should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getGuestByEmail', () => {
    it('should search via customers/search', async () => {
      setupFetchMock({
        'customers/search': { Results: [MOCK_CUSTOMER] },
      });

      const result = await adapter.getGuestByEmail('john@example.com');

      expect(result).not.toBeNull();
      expect(result!.email).toBe('john@example.com');

      const searchCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('customers/search')
      );
      const body = JSON.parse((searchCall![1] as { body: string }).body);
      expect(body.Email).toBe('john@example.com');
    });
  });

  describe('searchGuests', () => {
    it('should search by name', async () => {
      setupFetchMock({
        'customers/search': { Results: [MOCK_CUSTOMER] },
      });

      const results = await adapter.searchGuests('John');

      expect(results).toHaveLength(1);
      expect(results[0]!.firstName).toBe('John');

      const searchCall = mockFetch.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('customers/search')
      );
      const body = JSON.parse((searchCall![1] as { body: string }).body);
      expect(body.Name).toBe('John');
    });
  });

  describe('getAllRooms', () => {
    it('should filter to room-type resources only', async () => {
      const spaCategory = { Id: 'cat-spa', Name: 'Spa Room', Type: 'Other' };
      const spaResource = {
        Id: 'spa-001',
        Name: 'Spa 1',
        Number: 'S1',
        State: 'Clean',
        ResourceCategoryId: 'cat-spa',
      };

      setupFetchMock({
        'resources/getAll': { Resources: [MOCK_RESOURCE, spaResource] },
        'resourceCategories/getAll': {
          ResourceCategories: [MOCK_RESOURCE_CATEGORY, spaCategory],
        },
      });

      const rooms = await adapter.getAllRooms();

      expect(rooms).toHaveLength(1);
      expect(rooms[0]!.number).toBe('415');
      expect(rooms[0]!.type).toBe('Deluxe King');
      expect(rooms[0]!.status).toBe('occupied');
      expect(rooms[0]!.floor).toBe('4');
    });
  });

  describe('getAllRooms (error handling)', () => {
    it('should return empty array on API failure', async () => {
      mockFetch.mockResolvedValue(mockApiResponse({ error: 'Server error' }, 500));

      const rooms = await adapter.getAllRooms();
      expect(rooms).toEqual([]);
    });
  });

  describe('getRoomStatus', () => {
    it('should find room by number', async () => {
      setupFetchMock({
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const room = await adapter.getRoomStatus('415');
      expect(room).not.toBeNull();
      expect(room!.number).toBe('415');
    });

    it('should return null for unknown room', async () => {
      setupFetchMock({
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const room = await adapter.getRoomStatus('999');
      expect(room).toBeNull();
    });
  });

  describe('parseWebhook', () => {
    it('should fetch full data for reservation ID-only payload', async () => {
      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION] },
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const event = await adapter.parseWebhook({
        Events: [{ Type: 'Reservation', Id: 'res-001' }],
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('mews');
      expect(event!.type).toBe('guest.checked_in'); // State: Started → checked_in
      expect(event!.data.reservation).toBeDefined();
      expect(event!.data.reservation!.externalId).toBe('res-001');
    });

    it('should return null for empty events', async () => {
      const event = await adapter.parseWebhook({ Events: [] });
      expect(event).toBeNull();
    });

    it('should fetch room data for resource events', async () => {
      setupFetchMock({
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const event = await adapter.parseWebhook({
        Events: [{ Type: 'Resource', Id: 'room-415' }],
      });

      expect(event).not.toBeNull();
      expect(event!.type).toBe('room.status_changed');
      expect(event!.data.room).toBeDefined();
      expect(event!.data.room!.number).toBe('415');
      expect(event!.data.newStatus).toBe('occupied');
    });

    it('should still return event when resource fetch fails', async () => {
      mockFetch.mockResolvedValue(mockApiResponse({ error: 'fail' }, 500));

      const event = await adapter.parseWebhook({
        Events: [{ Type: 'Resource', Id: 'room-415' }],
      });

      expect(event).not.toBeNull();
      expect(event!.type).toBe('room.status_changed');
      // Room data unavailable, but event is still returned
      expect(event!.data.room).toBeUndefined();
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid HMAC-SHA256 signature', async () => {
      const { createHmac } = await import('node:crypto');
      const payload = '{"Events":[]}';
      const expected = createHmac('sha256', 'test-secret').update(payload).digest('hex');

      const result = adapter.verifyWebhookSignature(payload, expected);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const { createHmac } = await import('node:crypto');
      // Create a valid-format hex string that's the wrong value
      const payload = '{"Events":[]}';
      const wrongSecret = createHmac('sha256', 'wrong-secret').update(payload).digest('hex');

      const result = adapter.verifyWebhookSignature(payload, wrongSecret);
      expect(result).toBe(false);
    });

    it('should reject signature of wrong length', () => {
      const result = adapter.verifyWebhookSignature('{"Events":[]}', 'aabb');
      expect(result).toBe(false);
    });

    it('should pass when no webhook secret is configured', () => {
      const noSecretAdapter = new MewsPMSAdapter(createFlatConfig({ webhookSecret: undefined }), mockContext);
      const result = noSecretAdapter.verifyWebhookSignature('anything', 'anything');
      expect(result).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should retry on 429 with Retry-After header', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ 'Retry-After': '0' }),
            text: () => Promise.resolve('Rate limited'),
          };
        }
        return mockApiResponse({ Customers: [MOCK_CUSTOMER] });
      });

      const result = await adapter.getGuest('cust-001');
      expect(result).not.toBeNull();
      expect(callCount).toBe(2);
    });

    it('should throw after max retries', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '0' }),
        text: () => Promise.resolve('Rate limited'),
      });

      const result = await adapter.getGuest('cust-001');
      // getGuest catches errors and returns null
      expect(result).toBeNull();
    });
  });

  describe('enrichReservations (chunked batch fetch)', () => {
    it('should chunk customer fetches for large result sets', async () => {
      // Create 150 reservations with unique customer IDs to force chunking (batch size = 100)
      const manyReservations = Array.from({ length: 150 }, (_, i) => ({
        ...MOCK_RESERVATION,
        Id: `res-${i}`,
        CustomerId: `cust-${i}`,
        AssignedResourceId: undefined,
        RequestedResourceCategoryId: 'cat-001',
      }));
      const manyCustomers = Array.from({ length: 150 }, (_, i) => ({
        ...MOCK_CUSTOMER,
        Id: `cust-${i}`,
      }));

      let customerGetAllCalls = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if ((url as string).includes('services/getAll')) {
          return mockApiResponse({ Services: [MOCK_SERVICE] });
        }
        if ((url as string).includes('reservations/getAll')) {
          return mockApiResponse({ Reservations: manyReservations });
        }
        if ((url as string).includes('customers/getAll')) {
          customerGetAllCalls++;
          // Return the subset of customers requested
          const requestBody = JSON.parse(
            (mockFetch.mock.calls[mockFetch.mock.calls.length - 1]![1] as { body: string }).body
          );
          const requestedIds = new Set(requestBody.CustomerIds as string[]);
          return mockApiResponse({
            Customers: manyCustomers.filter((c) => requestedIds.has(c.Id)),
          });
        }
        if ((url as string).includes('resourceCategories/getAll')) {
          return mockApiResponse({ ResourceCategories: [MOCK_RESOURCE_CATEGORY] });
        }
        return mockApiResponse({ error: 'Not found' }, 404);
      });

      const results = await adapter.getModifiedReservations(new Date('2026-02-14T00:00:00Z'));

      expect(results).toHaveLength(150);
      // Should have made 2 chunked calls for 150 customers (100 + 50)
      expect(customerGetAllCalls).toBe(2);
    });
  });

  describe('enrichReservations (missing customer)', () => {
    it('should skip reservations with missing customers', async () => {
      const reservation2 = {
        ...MOCK_RESERVATION,
        Id: 'res-002',
        CustomerId: 'cust-missing',
        Number: 'CONF-456',
      };

      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [MOCK_RESERVATION, reservation2], Cursor: undefined },
        // Only cust-001 is returned, cust-missing is not
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const results = await adapter.getModifiedReservations(new Date('2026-02-14T00:00:00Z'));

      // Should have 1 result (res-002 skipped due to missing customer)
      expect(results).toHaveLength(1);
      expect(results[0]!.externalId).toBe('res-001');
    });
  });
});

describe('Status Mapping', () => {
  let adapter: InstanceType<typeof MewsPMSAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MewsPMSAdapter(createFlatConfig(), mockContext);
  });

  it('should map all Mews reservation states correctly', async () => {
    const states: Record<string, string> = {
      Confirmed: 'confirmed',
      Started: 'checked_in',
      Processed: 'checked_out',
      Canceled: 'cancelled',
      Optional: 'confirmed',
      Requested: 'confirmed',
      NoShow: 'no_show',
    };

    for (const [mewsState, expectedStatus] of Object.entries(states)) {
      const reservation = { ...MOCK_RESERVATION, State: mewsState };

      setupFetchMock({
        'services/getAll': { Services: [MOCK_SERVICE] },
        'reservations/getAll': { Reservations: [reservation] },
        'customers/getAll': { Customers: [MOCK_CUSTOMER] },
        'resources/getAll': { Resources: [MOCK_RESOURCE] },
        'resourceCategories/getAll': { ResourceCategories: [MOCK_RESOURCE_CATEGORY] },
      });

      const result = await adapter.getReservation('res-001');
      expect(result!.status).toBe(expectedStatus);
    }
  });
});

describe('Mews Manifest', () => {
  it('should have correct id and category', () => {
    expect(manifest.id).toBe('pms-mews');
    expect(manifest.category).toBe('pms');
    expect(manifest.name).toBe('Mews');
  });

  it('should declare all features', () => {
    expect(manifest.features.reservations).toBe(true);
    expect(manifest.features.guests).toBe(true);
    expect(manifest.features.rooms).toBe(true);
    expect(manifest.features.webhooks).toBe(true);
  });

  it('should have required config fields', () => {
    const requiredKeys = manifest.configSchema
      .filter((f: { required: boolean }) => f.required)
      .map((f: { key: string }) => f.key);
    expect(requiredKeys).toContain('accessToken');
    expect(requiredKeys).toContain('clientToken');
  });

  it('should include stalenessThreshold and syncInterval', () => {
    const keys = manifest.configSchema.map((f: { key: string }) => f.key);
    expect(keys).toContain('stalenessThreshold');
    expect(keys).toContain('syncInterval');
  });

  it('should create adapter instance via factory', () => {
    const config = createFlatConfig();
    const instance = createMewsPMSAdapter(config, mockContext);
    expect(instance).toBeInstanceOf(MewsPMSAdapter);
    expect(instance.provider).toBe('mews');
  });
});
