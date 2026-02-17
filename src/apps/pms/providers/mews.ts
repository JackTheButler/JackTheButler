/**
 * Mews PMS Adapter
 *
 * Production PMS adapter for Mews (https://mews.com).
 * Mews uses an RPC-style API where all endpoints are POST with JSON bodies.
 * Auth is via ClientToken + AccessToken sent in every request body.
 *
 * @module extensions/pms/providers/mews
 */

import type {
  PMSAdapter,
  NormalizedGuest,
  NormalizedReservation,
  NormalizedRoom,
  ReservationQuery,
  ReservationStatus,
  RoomStatus,
  PMSEvent,
  PMSEventType,
  PMSConfig,
} from '@/core/interfaces/pms.js';
import type { PMSAppManifest } from '../../types.js';
import { createLogger } from '@/utils/logger.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const log = createLogger('extensions:pms:mews');

const MEWS_PRODUCTION_URL = 'https://api.mews.com/api/connector/v1';
const MAX_QUERY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 3 months in ms
const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 3;

// ==================
// Mews API Types
// ==================

interface MewsReservation {
  Id: string;
  ServiceId: string;
  State: string;
  Number: string;
  StartUtc: string;
  EndUtc: string;
  CustomerId: string;
  RequestedResourceCategoryId?: string;
  AssignedResourceId?: string;
  AdultCount: number;
  ChildCount: number;
  Notes?: string;
  UpdatedUtc: string;
}

interface MewsCustomer {
  Id: string;
  FirstName?: string;
  LastName: string;
  Email?: string;
  Phone?: string;
  LanguageCode?: string;
  NationalityCode?: string;
  LoyaltyCode?: string;
  Classifications?: string[];
  Notes?: string;
}

interface MewsResource {
  Id: string;
  Name?: string;
  Number?: string;
  State: string;
  FloorNumber?: string;
  ResourceCategoryId: string;
}

interface MewsResourceCategory {
  Id: string;
  Name: string;
  Type: string;
}

interface MewsService {
  Id: string;
  Name: string;
  Type: string;
}

interface MewsWebhookEvent {
  Type: string;
  Id: string;
}

interface MewsWebhookPayload {
  Events: MewsWebhookEvent[];
}


// ==================
// MewsClient — HTTP helper
// ==================

class MewsClient {
  constructor(
    private baseUrl: string,
    private clientToken: string,
    private accessToken: string
  ) {}

  async request<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const payload = {
      ClientToken: this.clientToken,
      AccessToken: this.accessToken,
      ...body,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      log.debug({ endpoint, attempt }, 'Mews API request');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt + 1) * 1000;
        log.warn({ endpoint, retryAfter: waitMs }, 'Mews rate limited, retrying');
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastError = new Error(`Rate limited (429) on ${endpoint}`);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Mews API error ${response.status} on ${endpoint}: ${text}`);
      }

      return (await response.json()) as T;
    }

    throw lastError || new Error(`Mews API request failed after ${MAX_RETRIES} retries`);
  }

  async requestPaginated<TItem>(
    endpoint: string,
    body: Record<string, unknown>,
    resultKey: string,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    let cursor: string | undefined;

    do {
      const limitBody: Record<string, unknown> = { ...body };
      if (cursor) {
        limitBody.Limitation = { Count: pageSize, Cursor: cursor };
      } else {
        limitBody.Limitation = { Count: pageSize };
      }

      const response = await this.request<Record<string, unknown>>(endpoint, limitBody);

      const items = response[resultKey];
      if (Array.isArray(items)) {
        results.push(...(items as TItem[]));
      }

      cursor = typeof response.Cursor === 'string' ? response.Cursor : undefined;
    } while (cursor);

    return results;
  }
}

// ==================
// Status Mapping
// ==================

function mapMewsReservationStatus(state: string): ReservationStatus {
  switch (state) {
    case 'Confirmed':
    case 'Optional':
    case 'Requested':
      return 'confirmed';
    case 'Started':
      return 'checked_in';
    case 'Processed':
      return 'checked_out';
    case 'Canceled':
      return 'cancelled';
    case 'NoShow':
      return 'no_show';
    default:
      log.warn({ state }, 'Unknown Mews reservation state, defaulting to confirmed');
      return 'confirmed';
  }
}

function mapMewsRoomStatus(state: string): RoomStatus {
  switch (state) {
    case 'Clean':
      return 'clean';
    case 'Dirty':
      return 'dirty';
    case 'Inspected':
      return 'inspected';
    case 'OutOfService':
    case 'OutOfOrder':
      return 'out_of_order';
    case 'Occupied':
      return 'occupied';
    default:
      log.warn({ state }, 'Unknown Mews room state, defaulting to clean');
      return 'clean';
  }
}

// ==================
// Normalization Helpers
// ==================

function mapMewsCustomer(customer: MewsCustomer): NormalizedGuest {
  const guest: NormalizedGuest = {
    externalId: customer.Id,
    source: 'mews',
    firstName: customer.FirstName || '',
    lastName: customer.LastName,
  };

  if (customer.Email) guest.email = customer.Email;
  if (customer.Phone) guest.phone = customer.Phone;
  if (customer.LanguageCode) guest.language = customer.LanguageCode;
  if (customer.NationalityCode) guest.nationality = customer.NationalityCode;
  if (customer.LoyaltyCode) guest.loyaltyTier = customer.LoyaltyCode;
  if (customer.Classifications?.includes('Vip')) guest.vipStatus = 'VIP';
  if (customer.Notes) guest.notes = customer.Notes;

  return guest;
}

function mapMewsReservation(
  res: MewsReservation,
  customer: MewsCustomer,
  resource?: MewsResource,
  resourceCategory?: MewsResourceCategory
): NormalizedReservation {
  const reservation: NormalizedReservation = {
    externalId: res.Id,
    source: 'mews',
    confirmationNumber: res.Number,
    guest: mapMewsCustomer(customer),
    roomType: resourceCategory?.Name || 'Unknown',
    arrivalDate: res.StartUtc.split('T')[0]!,
    departureDate: res.EndUtc.split('T')[0]!,
    status: mapMewsReservationStatus(res.State),
    adults: res.AdultCount,
    children: res.ChildCount,
  };

  if (resource?.Number) reservation.roomNumber = resource.Number;
  if (res.Notes) reservation.notes = [res.Notes];

  return reservation;
}

function mapMewsResource(
  resource: MewsResource,
  category?: MewsResourceCategory
): NormalizedRoom {
  const room: NormalizedRoom = {
    number: resource.Number || resource.Id,
    type: category?.Name || 'Unknown',
    status: mapMewsRoomStatus(resource.State),
  };

  if (resource.FloorNumber) room.floor = resource.FloorNumber;

  return room;
}

// ==================
// MewsPMSAdapter
// ==================

export class MewsPMSAdapter implements PMSAdapter {
  readonly provider = 'mews' as const;

  private client: MewsClient;
  private propertyId: string;
  private webhookSecret?: string;
  private serviceId?: string;
  private resourceCategoryCache?: MewsResourceCategory[];

  constructor(config: PMSConfig) {
    // The registry passes a flat Record<string, unknown> with keys matching configSchema,
    // cast as PMSConfig. Read Mews-specific keys from the flat object directly.
    const flat = config as unknown as Record<string, unknown>;
    const clientToken = (flat.clientToken as string) || config.clientId || '';
    const accessToken = (flat.accessToken as string) || config.apiKey || '';
    const baseUrl = (flat.apiUrl as string) || config.apiUrl || MEWS_PRODUCTION_URL;

    this.propertyId = (flat.propertyId as string) || config.propertyId || '';
    const webhookSecret = (flat.webhookSecret as string) || config.webhookSecret;
    if (webhookSecret) this.webhookSecret = webhookSecret;
    this.client = new MewsClient(baseUrl, clientToken, accessToken);

    log.info({ propertyId: this.propertyId }, 'Mews PMS adapter initialized');
  }

  // ==================
  // Connection
  // ==================

  async testConnection(): Promise<boolean> {
    try {
      // configuration/get validates credentials and returns the enterprise info
      const config = await this.client.request<{ Enterprise: { Id: string; Name: string } }>(
        'configuration/get',
        {}
      );

      // Verify the enterprise ID matches what was configured (if non-empty)
      if (this.propertyId && config.Enterprise.Id !== this.propertyId) {
        log.error(
          { expected: this.propertyId, actual: config.Enterprise.Id },
          'Enterprise ID mismatch — AccessToken belongs to a different property'
        );
        return false;
      }

      // If no propertyId was configured, learn it from the API
      if (!this.propertyId) {
        this.propertyId = config.Enterprise.Id;
        log.info({ propertyId: this.propertyId }, 'Auto-discovered Mews enterprise ID');
      }

      // Discover and cache the bookable service ID
      await this.discoverServiceId();

      log.info({ enterprise: config.Enterprise.Name }, 'Mews connection test successful');
      return true;
    } catch (err) {
      log.error({ err }, 'Mews connection test failed');
      return false;
    }
  }

  private async discoverServiceId(): Promise<string> {
    if (this.serviceId) return this.serviceId;

    const response = await this.client.request<{ Services: MewsService[] }>('services/getAll', {
      EnterpriseIds: [this.propertyId],
    });

    const bookable = response.Services.find((s) => s.Type === 'Reservable');
    if (!bookable) {
      throw new Error('No reservable service found for this Mews enterprise');
    }

    this.serviceId = bookable.Id;
    log.info({ serviceId: this.serviceId }, 'Discovered Mews bookable service');
    return this.serviceId;
  }

  // ==================
  // Reservations
  // ==================

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    try {
      const serviceId = await this.discoverServiceId();

      const response = await this.client.request<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        {
          ServiceIds: [serviceId],
          ReservationIds: [externalId],
        }
      );

      const res = response.Reservations[0];
      if (!res) return null;

      return await this.enrichReservation(res);
    } catch (err) {
      log.error({ err, externalId }, 'Failed to get Mews reservation');
      return null;
    }
  }

  async getReservationByConfirmation(
    confirmationNumber: string
  ): Promise<NormalizedReservation | null> {
    try {
      const serviceId = await this.discoverServiceId();

      const response = await this.client.request<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        {
          ServiceIds: [serviceId],
          Numbers: [confirmationNumber],
        }
      );

      const res = response.Reservations[0];
      if (!res) return null;

      return await this.enrichReservation(res);
    } catch (err) {
      log.error({ err, confirmationNumber }, 'Failed to get Mews reservation by confirmation');
      return null;
    }
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    try {
      const serviceId = await this.discoverServiceId();

      const body: Record<string, unknown> = {
        ServiceIds: [serviceId],
      };

      // Arrival date filter — Mews requires full ISO datetime
      if (query.arrivalFrom || query.arrivalTo) {
        body.StartUtc = {
          ...(query.arrivalFrom && { StartUtc: toMewsDateTime(query.arrivalFrom) }),
          ...(query.arrivalTo && { EndUtc: toMewsDateTime(query.arrivalTo) }),
        };
      } else if (!query.departureFrom && !query.departureTo && !query.modifiedSince) {
        // Default to 1-year window to avoid unbounded queries (only if no other time filter)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        body.StartUtc = { StartUtc: oneYearAgo.toISOString() };
      }

      // Departure date filter
      if (query.departureFrom || query.departureTo) {
        body.EndUtc = {
          ...(query.departureFrom && { StartUtc: toMewsDateTime(query.departureFrom) }),
          ...(query.departureTo && { EndUtc: toMewsDateTime(query.departureTo) }),
        };
      }

      // Modified since filter
      if (query.modifiedSince) {
        body.UpdatedUtc = {
          StartUtc: query.modifiedSince.toISOString(),
          EndUtc: new Date().toISOString(),
        };
      }

      // Status filter
      if (query.status) {
        body.States = [mapJackStatusToMews(query.status)];
      }

      // If searching by email, find customer IDs first and pass to reservation query
      let emailCustomerIds: Set<string> | undefined;
      if (query.guestEmail) {
        const customers = await this.searchCustomersByEmail(query.guestEmail);
        if (customers.length === 0) return [];
        emailCustomerIds = new Set(customers.map((c) => c.Id));
        // Pass CustomerIds server-side to reduce result set
        body.CustomerIds = [...emailCustomerIds];
      }

      const response = await this.client.request<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        body
      );

      let reservations = response.Reservations;

      // Client-side safety net for email filter (in case Mews ignores CustomerIds)
      if (emailCustomerIds) {
        reservations = reservations.filter((r) => emailCustomerIds!.has(r.CustomerId));
      }

      // Enrich all reservations
      const enriched = await this.enrichReservations(reservations);

      // Client-side filters for fields Mews can't filter on
      let results = enriched;

      if (query.guestPhone) {
        results = results.filter((r) => r.guest.phone === query.guestPhone);
      }
      if (query.roomNumber) {
        results = results.filter((r) => r.roomNumber === query.roomNumber);
      }
      if (query.limit) {
        results = results.slice(0, query.limit);
      }

      return results;
    } catch (err) {
      log.error({ err }, 'Failed to search Mews reservations');
      return [];
    }
  }

  async getModifiedReservations(since: Date): Promise<NormalizedReservation[]> {
    try {
      const serviceId = await this.discoverServiceId();

      // Clamp to 3-month max window
      const now = new Date();
      const threeMonthsAgo = new Date(now.getTime() - MAX_QUERY_WINDOW_MS);
      let effectiveSince = since;

      if (since < threeMonthsAgo) {
        log.warn(
          { requested: since.toISOString(), clamped: threeMonthsAgo.toISOString() },
          'Clamping getModifiedReservations to 3-month max window'
        );
        effectiveSince = threeMonthsAgo;
      }

      const reservations = await this.client.requestPaginated<MewsReservation>(
        'reservations/getAll',
        {
          ServiceIds: [serviceId],
          UpdatedUtc: {
            StartUtc: effectiveSince.toISOString(),
            EndUtc: now.toISOString(),
          },
        },
        'Reservations'
      );

      return this.enrichReservations(reservations);
    } catch (err) {
      log.error({ err }, 'Failed to get modified Mews reservations');
      return [];
    }
  }

  // ==================
  // Guests
  // ==================

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    try {
      const response = await this.client.request<{ Customers: MewsCustomer[] }>(
        'customers/getAll',
        {
          CustomerIds: [externalId],
        }
      );

      const customer = response.Customers[0];
      if (!customer) return null;

      return mapMewsCustomer(customer);
    } catch (err) {
      log.error({ err, externalId }, 'Failed to get Mews guest');
      return null;
    }
  }

  async getGuestByPhone(_phone: string): Promise<NormalizedGuest | null> {
    // Mews API does not support phone-based customer search
    log.debug('getGuestByPhone not supported by Mews API');
    return null;
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    try {
      const customers = await this.searchCustomersByEmail(email);
      const customer = customers[0];
      if (!customer) return null;

      return mapMewsCustomer(customer);
    } catch (err) {
      log.error({ err, email }, 'Failed to get Mews guest by email');
      return null;
    }
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    try {
      const response = await this.client.request<{ Results: MewsCustomer[] }>(
        'customers/search',
        {
          Name: query,
        }
      );

      return response.Results.map(mapMewsCustomer);
    } catch (err) {
      log.error({ err, query }, 'Failed to search Mews guests');
      return [];
    }
  }

  // ==================
  // Rooms
  // ==================

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    try {
      const rooms = await this.fetchAllRooms();
      const room = rooms.find((r) => r.number === roomNumber);
      return room || null;
    } catch (err) {
      log.error({ err, roomNumber }, 'Failed to get Mews room status');
      return null;
    }
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    try {
      return await this.fetchAllRooms();
    } catch (err) {
      log.error({ err }, 'Failed to get all Mews rooms');
      return [];
    }
  }

  // ==================
  // Webhooks
  // ==================

  async parseWebhook(
    payload: unknown,
    _headers?: Record<string, string>
  ): Promise<PMSEvent | null> {
    const data = payload as MewsWebhookPayload;

    if (!data.Events || data.Events.length === 0) {
      log.debug('Empty Mews webhook payload');
      return null;
    }

    // Process the first event (Mews can batch multiple events)
    const event = data.Events[0]!;

    if (event.Type === 'Reservation') {
      const reservation = await this.getReservation(event.Id);
      if (!reservation) {
        log.warn({ eventId: event.Id }, 'Could not fetch reservation for Mews webhook event');
        return null;
      }

      const eventType = mapReservationToEventType(reservation.status);

      return {
        type: eventType,
        source: 'mews',
        timestamp: new Date().toISOString(),
        data: { reservation },
      };
    }

    if (event.Type === 'Resource') {
      log.info({ resourceId: event.Id }, 'Mews resource webhook event');

      // Fetch the resource to get current state
      let room: NormalizedRoom | undefined;
      try {
        const resourceResponse = await this.client.request<{ Resources: MewsResource[] }>(
          'resources/getAll',
          { ResourceIds: [event.Id] }
        );
        const resource = resourceResponse.Resources[0];
        if (resource) {
          const categories = await this.getResourceCategories();
          const category = categories.find((c) => c.Id === resource.ResourceCategoryId);
          room = mapMewsResource(resource, category);
        }
      } catch (err) {
        log.warn({ err, resourceId: event.Id }, 'Failed to fetch resource for webhook event');
      }

      const eventData: PMSEvent['data'] = {};
      if (room) {
        eventData.room = room;
        eventData.newStatus = room.status;
      }

      return {
        type: 'room.status_changed',
        source: 'mews',
        timestamp: new Date().toISOString(),
        data: eventData,
      };
    }

    log.debug({ type: event.Type }, 'Unhandled Mews webhook event type');
    return null;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      log.warn('No webhook secret configured, skipping signature verification');
      return true;
    }

    const computed = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    const computedBuf = Buffer.from(computed, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (computedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(computedBuf, signatureBuf);
  }

  // ==================
  // Internal Helpers
  // ==================

  private async searchCustomersByEmail(email: string): Promise<MewsCustomer[]> {
    const response = await this.client.request<{ Results: MewsCustomer[] }>(
      'customers/search',
      {
        Email: email,
      }
    );
    return response.Results;
  }

  private async enrichReservation(res: MewsReservation): Promise<NormalizedReservation | null> {
    // Fetch customer
    const customerResponse = await this.client.request<{ Customers: MewsCustomer[] }>(
      'customers/getAll',
      { CustomerIds: [res.CustomerId] }
    );
    const customer = customerResponse.Customers[0];
    if (!customer) {
      log.warn({ customerId: res.CustomerId, reservationId: res.Id }, 'Customer not found for reservation');
      return null;
    }

    // Fetch resource (room) if assigned
    let resource: MewsResource | undefined;
    let category: MewsResourceCategory | undefined;

    if (res.AssignedResourceId) {
      const resourceResponse = await this.client.request<{ Resources: MewsResource[] }>(
        'resources/getAll',
        { ResourceIds: [res.AssignedResourceId] }
      );
      resource = resourceResponse.Resources[0];

      if (resource) {
        const categories = await this.getResourceCategories();
        category = categories.find((c) => c.Id === resource!.ResourceCategoryId);
      }
    } else if (res.RequestedResourceCategoryId) {
      const categories = await this.getResourceCategories();
      category = categories.find((c) => c.Id === res.RequestedResourceCategoryId);
    }

    return mapMewsReservation(res, customer, resource, category);
  }

  private async enrichReservations(
    reservations: MewsReservation[]
  ): Promise<NormalizedReservation[]> {
    if (reservations.length === 0) return [];

    // Batch-fetch all referenced customers (chunked to avoid exceeding API limits)
    const customerIds = [...new Set(reservations.map((r) => r.CustomerId))];
    const allCustomers: MewsCustomer[] = [];
    for (let i = 0; i < customerIds.length; i += DEFAULT_PAGE_SIZE) {
      const chunk = customerIds.slice(i, i + DEFAULT_PAGE_SIZE);
      const response = await this.client.request<{ Customers: MewsCustomer[] }>(
        'customers/getAll',
        { CustomerIds: chunk }
      );
      allCustomers.push(...response.Customers);
    }
    const customerMap = new Map(allCustomers.map((c) => [c.Id, c]));

    // Batch-fetch all referenced resources (chunked)
    const resourceIds = [
      ...new Set(reservations.map((r) => r.AssignedResourceId).filter(Boolean) as string[]),
    ];
    let resourceMap = new Map<string, MewsResource>();

    if (resourceIds.length > 0) {
      const allResources: MewsResource[] = [];
      for (let i = 0; i < resourceIds.length; i += DEFAULT_PAGE_SIZE) {
        const chunk = resourceIds.slice(i, i + DEFAULT_PAGE_SIZE);
        const response = await this.client.request<{ Resources: MewsResource[] }>(
          'resources/getAll',
          { ResourceIds: chunk }
        );
        allResources.push(...response.Resources);
      }
      resourceMap = new Map(allResources.map((r) => [r.Id, r]));
    }

    // Fetch categories
    const categories = await this.getResourceCategories();
    const categoryMap = new Map(categories.map((c) => [c.Id, c]));

    const results: NormalizedReservation[] = [];

    for (const res of reservations) {
      const customer = customerMap.get(res.CustomerId);
      if (!customer) {
        log.warn({ customerId: res.CustomerId, reservationId: res.Id }, 'Customer not found for reservation, skipping');
        continue;
      }
      const resource = res.AssignedResourceId
        ? resourceMap.get(res.AssignedResourceId)
        : undefined;
      const category = resource
        ? categoryMap.get(resource.ResourceCategoryId)
        : res.RequestedResourceCategoryId
          ? categoryMap.get(res.RequestedResourceCategoryId)
          : undefined;

      results.push(mapMewsReservation(res, customer, resource, category));
    }

    return results;
  }

  private async getResourceCategories(): Promise<MewsResourceCategory[]> {
    if (this.resourceCategoryCache) return this.resourceCategoryCache;

    const response = await this.client.request<{ ResourceCategories: MewsResourceCategory[] }>(
      'resourceCategories/getAll',
      {
        EnterpriseIds: [this.propertyId],
      }
    );

    this.resourceCategoryCache = response.ResourceCategories;
    return this.resourceCategoryCache;
  }

  private async fetchAllRooms(): Promise<NormalizedRoom[]> {
    const response = await this.client.request<{ Resources: MewsResource[] }>(
      'resources/getAll',
      {
        EnterpriseIds: [this.propertyId],
      }
    );

    // Filter to room-type resources only
    const categories = await this.getResourceCategories();
    const roomCategoryIds = new Set(
      categories.filter((c) => c.Type === 'Room' || c.Type === 'Space').map((c) => c.Id)
    );

    return response.Resources.filter((r) => roomCategoryIds.has(r.ResourceCategoryId)).map((r) => {
      const category = categories.find((c) => c.Id === r.ResourceCategoryId);
      return mapMewsResource(r, category);
    });
  }
}

// ==================
// Helpers
// ==================

/** Ensure a date string has a time component for Mews (e.g. "2026-02-15" → "2026-02-15T00:00:00Z") */
function toMewsDateTime(dateStr: string): string {
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00Z`;
}

function mapJackStatusToMews(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'checked_in':
      return 'Started';
    case 'checked_out':
      return 'Processed';
    case 'cancelled':
      return 'Canceled';
    case 'no_show':
      return 'NoShow';
    default:
      return 'Confirmed';
  }
}

/**
 * Map reservation status to a webhook event type.
 * Note: Mews webhook payloads contain only entity IDs, so we can't distinguish
 * newly created vs updated reservations. All non-terminal statuses map to
 * 'reservation.updated'. This is safe because processEventWebhook() treats
 * 'reservation.created' and 'reservation.updated' identically (both upsert).
 */
function mapReservationToEventType(status: ReservationStatus): PMSEventType {
  switch (status) {
    case 'checked_in':
      return 'guest.checked_in';
    case 'checked_out':
      return 'guest.checked_out';
    case 'cancelled':
      return 'reservation.cancelled';
    default:
      return 'reservation.updated';
  }
}

// ==================
// Factory & Manifest
// ==================

export function createMewsPMSAdapter(config: PMSConfig): MewsPMSAdapter {
  return new MewsPMSAdapter(config);
}

export const manifest: PMSAppManifest = {
  id: 'pms-mews',
  name: 'Mews',
  category: 'pms',
  version: '1.0.0',
  description: 'Connect to Mews PMS for real-time reservation sync',
  icon: '🏨',
  configSchema: [
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      description: 'Mews API access token (from Mews Commander)',
    },
    {
      key: 'clientToken',
      label: 'Client Token',
      type: 'password',
      required: true,
      description: 'Mews API client token (from Mews Marketplace)',
    },
    {
      key: 'apiUrl',
      label: 'API URL',
      type: 'text',
      required: false,
      description: 'API base URL (leave blank for production)',
      default: MEWS_PRODUCTION_URL,
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret',
      type: 'password',
      required: false,
      description: 'Secret for webhook signature verification',
    },
    {
      key: 'stalenessThreshold',
      label: 'Staleness Threshold (seconds)',
      type: 'number',
      required: false,
      default: 180,
      description:
        'How old (in seconds) cached reservation data can be before refreshing from Mews. Default: 180 (3 min).',
    },
    {
      key: 'syncInterval',
      label: 'Sync Interval (seconds)',
      type: 'number',
      required: false,
      default: 300,
      description: 'How often to poll Mews for updated reservations. Default: 300 (5 min).',
    },
  ],
  features: {
    reservations: true,
    guests: true,
    rooms: true,
    webhooks: true,
  },
  createAdapter: (config) => createMewsPMSAdapter(config as unknown as PMSConfig),
};
