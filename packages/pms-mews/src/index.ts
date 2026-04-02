/**
 * Mews PMS Adapter Plugin
 *
 * Production PMS adapter for Mews (https://mews.com).
 * Mews uses an RPC-style API where all endpoints are POST with JSON bodies.
 * Auth is via ClientToken + AccessToken sent in every request body.
 *
 * @module @jack-plugins/pms-mews
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
  PMSAppManifest,
  AppLogger,
  PluginContext,
} from '@jack/shared';
import { withLogContext, AppLogError } from '@jack/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MEWS_PRODUCTION_URL = 'https://api.mews.com/api/connector/v1';
const MAX_QUERY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 3 months in ms
const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 3;

// ==================
// Config Interface
// ==================

/** Mirrors configSchema fields 1:1 */
export interface MewsConfig {
  accessToken: string;
  clientToken: string;
  propertyId?: string;
  apiUrl?: string;
  webhookSecret?: string;
  stalenessThreshold?: number;
  syncInterval?: number;
}

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

interface MewsWebhookEvent {
  Type: string;
  Id: string;
}

interface MewsWebhookPayload {
  Events: MewsWebhookEvent[];
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
      console.warn(`[pms-mews] Unknown Mews reservation state: ${state}, defaulting to confirmed`);
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
      console.warn(`[pms-mews] Unknown Mews room state: ${state}, defaulting to clean`);
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
  readonly appLog: AppLogger;

  private readonly baseUrl: string;
  private readonly clientToken: string;
  private readonly accessToken: string;
  private propertyId: string;
  private webhookSecret?: string;
  private resourceCategoryCache?: MewsResourceCategory[];
  private serviceIdsCache?: string[];

  constructor(config: MewsConfig, context: PluginContext) {
    this.appLog = context.appLog;
    this.clientToken = config.clientToken;
    this.accessToken = config.accessToken;
    this.baseUrl = config.apiUrl || MEWS_PRODUCTION_URL;
    this.propertyId = config.propertyId || '';
    if (config.webhookSecret) this.webhookSecret = config.webhookSecret;
  }

  // ==================
  // Connection
  // ==================

  async testConnection(): Promise<boolean> {
    try {
      await this.appLog('connection_test', {}, async () => {
        const config = await this.httpRequest<{ Enterprise: { Id: string; Name: string } }>(
          'configuration/get',
          {}
        );

        if (this.propertyId && config.Enterprise.Id !== this.propertyId) {
          throw new Error(
            `Enterprise ID mismatch — expected ${this.propertyId}, got ${config.Enterprise.Id}`
          );
        }

        if (!this.propertyId) {
          this.propertyId = config.Enterprise.Id;
        }
      });
      return true;
    } catch (err) {
      console.error('[pms-mews] Connection test failed:', err);
      return false;
    }
  }

  // ==================
  // Reservations
  // ==================

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation', { externalId }, async () => {
      const response = await this.httpRequest<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        { ReservationIds: [externalId] }
      );

      const res = response.Reservations[0];
      if (!res) return null;

      return this.enrichReservation(res);
    });
  }

  async getReservationByConfirmation(
    confirmationNumber: string
  ): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation_by_confirmation', { confirmationNumber }, async () => {
      const response = await this.httpRequest<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        { Numbers: [confirmationNumber] }
      );

      const res = response.Reservations[0];
      if (!res) return null;

      return this.enrichReservation(res);
    });
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    return this.appLog('search_reservations', {}, async () => {
      const body: Record<string, unknown> = {};

      if (query.modifiedSince) {
        body.TimeFilter = 'Updated';
        body.StartUtc = toMewsUtc(query.modifiedSince);
        body.EndUtc = toMewsUtc(new Date());
      } else if (query.departureFrom || query.departureTo) {
        body.TimeFilter = 'End';
        if (query.departureFrom) body.StartUtc = toMewsDateTime(query.departureFrom);
        if (query.departureTo) body.EndUtc = toMewsDateTime(query.departureTo);
      } else if (query.arrivalFrom || query.arrivalTo) {
        body.TimeFilter = 'Start';
        if (query.arrivalFrom) body.StartUtc = toMewsDateTime(query.arrivalFrom);
        if (query.arrivalTo) body.EndUtc = toMewsDateTime(query.arrivalTo);
      } else {
        // Default: reservations starting in the past year
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        body.TimeFilter = 'Start';
        body.StartUtc = toMewsUtc(oneYearAgo);
        body.EndUtc = toMewsUtc(new Date());
      }

      if (query.status) {
        body.States = [mapJackStatusToMews(query.status)];
      }

      let emailCustomerIds: Set<string> | undefined;
      if (query.guestEmail) {
        const customers = await this.searchCustomersByEmail(query.guestEmail);
        if (customers.length === 0) return [];
        emailCustomerIds = new Set(customers.map((c) => c.Id));
        body.CustomerIds = [...emailCustomerIds];
      }

      const response = await this.httpRequest<{ Reservations: MewsReservation[] }>(
        'reservations/getAll',
        body
      );

      let reservations = response.Reservations;

      if (emailCustomerIds) {
        reservations = reservations.filter((r) => emailCustomerIds!.has(r.CustomerId));
      }

      const enriched = await this.enrichReservations(reservations);

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
    });
  }

  async getModifiedReservations(since: Date): Promise<NormalizedReservation[]> {
    return this.appLog('get_modified_reservations', { since }, async () => {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getTime() - MAX_QUERY_WINDOW_MS);
      let effectiveSince = since;

      if (since < threeMonthsAgo) {
        console.warn(
          `[pms-mews] Clamping getModifiedReservations to 3-month max window (requested: ${since.toISOString()})`
        );
        effectiveSince = threeMonthsAgo;
      }

      const reservations = await this.httpRequestPaginated<MewsReservation>(
        'reservations/getAll',
        {
          TimeFilter: 'Updated',
          StartUtc: toMewsUtc(effectiveSince),
          EndUtc: toMewsUtc(now),
        },
        'Reservations'
      );

      return this.enrichReservations(reservations);
    });
  }

  // ==================
  // Guests
  // ==================

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    try {
      return await this.appLog('get_guest', { externalId }, async () => {
        const response = await this.httpRequest<{ Customers: MewsCustomer[] }>('customers/getAll', {
          CustomerIds: [externalId],
        });

        const customer = response.Customers[0];
        if (!customer) return null;

        return mapMewsCustomer(customer);
      });
    } catch {
      return null;
    }
  }

  async getGuestByPhone(_phone: string): Promise<NormalizedGuest | null> {
    // Mews API does not support phone-based customer search
    return null;
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest_by_email', { email }, async () => {
      const customers = await this.searchCustomersByEmail(email);
      const customer = customers[0];
      if (!customer) return null;

      return mapMewsCustomer(customer);
    });
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    return this.appLog('search_guests', { query }, async () => {
      const response = await this.httpRequest<{ Results: MewsCustomer[] }>('customers/search', {
        Name: query,
      });

      return response.Results.map(mapMewsCustomer);
    });
  }

  // ==================
  // Rooms
  // ==================

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    try {
      return await this.appLog('get_room_status', { roomNumber }, async () => {
        const rooms = await this.fetchAllRooms();
        return rooms.find((r) => r.number === roomNumber) ?? null;
      });
    } catch {
      return null;
    }
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    try {
      return await this.appLog('get_all_rooms', {}, async () => {
        return this.fetchAllRooms();
      });
    } catch {
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
    return this.appLog('parse_webhook', {}, async () => {
      const data = payload as MewsWebhookPayload;

      if (!data.Events || data.Events.length === 0) {
        return null;
      }

      // Process all events; return the first one that produces a result.
      // Mews can batch multiple events per webhook call.
      for (const event of data.Events) {
        if (event.Type === 'Reservation') {
          const reservation = await this.getReservation(event.Id);
          if (!reservation) {
            console.warn(`[pms-mews] Could not fetch reservation for webhook event ${event.Id}`);
            continue;
          }

          return {
            type: mapReservationToEventType(reservation.status),
            source: 'mews',
            timestamp: new Date().toISOString(),
            data: { reservation },
          };
        }

        if (event.Type === 'Resource') {
          let room: NormalizedRoom | undefined;
          try {
            const resourceResponse = await this.httpRequest<{ Resources: MewsResource[] }>(
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
            console.warn(`[pms-mews] Failed to fetch resource for webhook event ${event.Id}:`, err);
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
      }

      return null;
    });
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      console.warn('[pms-mews] No webhook secret configured, skipping signature verification');
      return true;
    }

    const computed = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    const computedBuf = Buffer.from(computed, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (computedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(computedBuf, signatureBuf);
  }

  // ==================
  // HTTP (pure transport — no appLog here)
  // ==================

  private async httpRequest<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const payload = {
      ClientToken: this.clientToken,
      AccessToken: this.accessToken,
      ...body,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt + 1) * 1000;
        console.warn(`[pms-mews] Rate limited on ${endpoint}, retrying in ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastError = new Error(`Rate limited (429) on ${endpoint}`);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        let responseBody: unknown = text;
        try {
          responseBody = JSON.parse(text);
        } catch { /* keep as string */ }
        throw new AppLogError(`Mews API error ${response.status} on ${endpoint}: ${text}`, {
          httpStatus: response.status,
          responseBody,
        });
      }

      const json = await response.json() as T;
      const firstArray = Object.values(json as object).find(Array.isArray);
      return withLogContext(json as object, {
        httpStatus: response.status,
        itemCount: firstArray?.length ?? undefined,
      }) as T;
    }

    throw lastError ?? new Error(`Mews API request failed after ${MAX_RETRIES} retries`);
  }

  private async httpRequestPaginated<TItem>(
    endpoint: string,
    body: Record<string, unknown>,
    resultKey: string,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    let cursor: string | undefined;

    do {
      const limitBody: Record<string, unknown> = { ...body };
      limitBody.Limitation = cursor
        ? { Count: pageSize, Cursor: cursor }
        : { Count: pageSize };

      const response = await this.httpRequest<Record<string, unknown>>(endpoint, limitBody);

      const items = response[resultKey];
      if (Array.isArray(items)) {
        results.push(...(items as TItem[]));
      }

      cursor = typeof response.Cursor === 'string' ? response.Cursor : undefined;
    } while (cursor);

    return results;
  }

  // ==================
  // Internal Helpers
  // ==================

  private async searchCustomersByEmail(email: string): Promise<MewsCustomer[]> {
    const response = await this.httpRequest<{ Results: MewsCustomer[] }>('customers/search', {
      Email: email,
    });
    return response.Results;
  }

  private async enrichReservation(res: MewsReservation): Promise<NormalizedReservation | null> {
    const customerResponse = await this.httpRequest<{ Customers: MewsCustomer[] }>(
      'customers/getAll',
      { CustomerIds: [res.CustomerId] }
    );
    const customer = customerResponse.Customers[0];
    if (!customer) {
      console.warn(`[pms-mews] Customer ${res.CustomerId} not found for reservation ${res.Id}`);
      return null;
    }

    let resource: MewsResource | undefined;
    let category: MewsResourceCategory | undefined;

    if (res.AssignedResourceId) {
      const resourceResponse = await this.httpRequest<{ Resources: MewsResource[] }>(
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

    const customerIds = [...new Set(reservations.map((r) => r.CustomerId))];
    const allCustomers: MewsCustomer[] = [];
    for (let i = 0; i < customerIds.length; i += DEFAULT_PAGE_SIZE) {
      const chunk = customerIds.slice(i, i + DEFAULT_PAGE_SIZE);
      const response = await this.httpRequest<{ Customers: MewsCustomer[] }>('customers/getAll', {
        CustomerIds: chunk,
      });
      allCustomers.push(...response.Customers);
    }
    const customerMap = new Map(allCustomers.map((c) => [c.Id, c]));

    const resourceIds = [
      ...new Set(reservations.map((r) => r.AssignedResourceId).filter(Boolean) as string[]),
    ];
    let resourceMap = new Map<string, MewsResource>();

    if (resourceIds.length > 0) {
      const allResources: MewsResource[] = [];
      for (let i = 0; i < resourceIds.length; i += DEFAULT_PAGE_SIZE) {
        const chunk = resourceIds.slice(i, i + DEFAULT_PAGE_SIZE);
        const response = await this.httpRequest<{ Resources: MewsResource[] }>('resources/getAll', {
          ResourceIds: chunk,
        });
        allResources.push(...response.Resources);
      }
      resourceMap = new Map(allResources.map((r) => [r.Id, r]));
    }

    const categories = await this.getResourceCategories();
    const categoryMap = new Map(categories.map((c) => [c.Id, c]));

    const results: NormalizedReservation[] = [];

    for (const res of reservations) {
      const customer = customerMap.get(res.CustomerId);
      if (!customer) {
        console.warn(`[pms-mews] Customer ${res.CustomerId} not found for reservation ${res.Id}, skipping`);
        continue;
      }
      const resource = res.AssignedResourceId ? resourceMap.get(res.AssignedResourceId) : undefined;
      const category = resource
        ? categoryMap.get(resource.ResourceCategoryId)
        : res.RequestedResourceCategoryId
          ? categoryMap.get(res.RequestedResourceCategoryId)
          : undefined;

      results.push(mapMewsReservation(res, customer, resource, category));
    }

    return results;
  }

  private async getServiceIds(): Promise<string[]> {
    if (this.serviceIdsCache) return this.serviceIdsCache;

    // Ensure propertyId is populated (testConnection may not have been called yet)
    if (!this.propertyId) {
      const config = await this.httpRequest<{ Enterprise: { Id: string } }>('configuration/get', {});
      this.propertyId = config.Enterprise.Id;
    }

    const response = await this.httpRequest<{ Services: Array<{ Id: string }> }>(
      'services/getAll',
      { EnterpriseIds: [this.propertyId] }
    );

    this.serviceIdsCache = response.Services.map((s) => s.Id);
    return this.serviceIdsCache;
  }

  private async getResourceCategories(): Promise<MewsResourceCategory[]> {
    if (this.resourceCategoryCache) return this.resourceCategoryCache;

    const serviceIds = await this.getServiceIds();
    const response = await this.httpRequest<{ ResourceCategories: MewsResourceCategory[] }>(
      'resourceCategories/getAll',
      { ServiceIds: serviceIds }
    );

    this.resourceCategoryCache = response.ResourceCategories;
    return this.resourceCategoryCache;
  }

  private async fetchAllRooms(): Promise<NormalizedRoom[]> {
    const response = await this.httpRequest<{ Resources: MewsResource[] }>('resources/getAll', {
      EnterpriseIds: [this.propertyId],
    });

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

function toMewsDateTime(dateStr: string): string {
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00Z`;
}

/** Format a Date for Mews API — strips milliseconds which Mews rejects */
function toMewsUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
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

export function createMewsPMSAdapter(config: MewsConfig, context: PluginContext): MewsPMSAdapter {
  return new MewsPMSAdapter(config, context);
}

export const manifest: PMSAppManifest = {
  id: 'pms-mews',
  name: 'Mews',
  category: 'pms',
  version: '1.0.0',
  description: 'Connect to Mews PMS for real-time reservation sync',
  icon: '🏨',
  docsUrl: 'https://mews.com/en/platform/open-api',
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
      key: 'propertyId',
      label: 'Enterprise ID',
      type: 'text',
      required: false,
      description: 'Mews Enterprise ID (auto-detected from your tokens if left blank)',
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
      description: 'How old (in seconds) cached reservation data can be before refreshing from Mews. Default: 180 (3 min).',
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
  createAdapter: (config, context) => createMewsPMSAdapter(config as unknown as MewsConfig, context),
};

export default { manifest };
