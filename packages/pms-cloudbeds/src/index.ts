/**
 * Cloudbeds PMS Adapter Plugin
 *
 * Production PMS adapter for Cloudbeds (https://cloudbeds.com).
 * Cloudbeds uses a REST API (v1.3) with GET requests and query parameters.
 * Auth is via a single API key sent in the x-api-key header — no token refresh needed.
 *
 * Known limitations:
 * - Room status: only occupied/vacant — no housekeeping states
 * - NormalizedRoom.floor/currentGuestId/currentReservationId always undefined
 * - NormalizedGuest.language/loyaltyTier/vipStatus always undefined
 * - NormalizedReservation.currency/rateCode/notes always undefined
 * - Multi-room reservations: only primary room (assigned[0]) mapped
 * - getReservationByConfirmation() delegates to getReservation()
 * - getModifiedReservations() may miss some changes (API documented limitation)
 * - No webhook HMAC verification; propertyID validation used as mitigation
 *
 * @module @jackthebutler/pms-cloudbeds
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
} from '@jackthebutler/shared';
import { AppLogError } from '@jackthebutler/shared';

const CLOUDBEDS_API_URL = 'https://api.cloudbeds.com/api/v1.3';
const DEFAULT_PAGE_SIZE = 100;
const ROOMS_PAGE_SIZE = 100;
const MAX_RETRIES = 3;

const WEBHOOK_SUBSCRIPTIONS: Array<{ object: string; action: string }> = [
  { object: 'reservation', action: 'created' },
  { object: 'reservation', action: 'status_changed' },
  { object: 'reservation', action: 'dates_changed' },
  { object: 'reservation', action: 'accommodation_changed' },
  { object: 'reservation', action: 'accommodation_type_changed' },
  { object: 'reservation', action: 'deleted' },
  { object: 'guest', action: 'details_changed' },
  { object: 'guest', action: 'created' },
];

// ==================
// Plugin Config
// ==================

export interface CloudbedsConfig {
  apiKey: string;
  propertyId: string;
  webhookUrl?: string;
  /** OAuth/Marketplace client ID — only needed for Cloudbeds Marketplace partner apps */
  clientId?: string;
  stalenessThreshold?: number;
  syncInterval?: number;
}

// ==================
// Cloudbeds API Types
// ==================

interface CloudbedsAssignedRoom {
  reservationRoomID: string;
  roomID: string;
  roomName: string;
  roomTypeID: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  dailyRates: unknown[];
  roomTotal: number;
}

interface CloudbedsGuestInReservation {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cellPhone?: string;
  country?: string;
  specialRequests?: string;
  isAnonymized?: boolean;
}

interface CloudbedsReservation {
  propertyID: string;
  reservationID: string;
  guestName: string;
  guestEmail?: string;
  dateCreated: string;
  dateModified: string;
  status: string;
  startDate: string;
  endDate: string;
  total?: number;
  balance?: number;
  sourceName?: string;
  sourceID?: string;
  thirdPartyIdentifier?: string | null;
  assigned: CloudbedsAssignedRoom[];
  unassigned: unknown[];
  guestList?: Record<string, CloudbedsGuestInReservation>;
}

interface CloudbedsGuestDetail {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  cellPhone?: string;
  country?: string;
  specialRequests?: string;
  isAnonymized?: boolean;
  isMerged?: boolean;
  newGuestID?: string;
}

interface CloudbedsGuestListItem {
  guestID: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cellPhone?: string;
  country?: string;
  specialRequests?: string;
  isAnonymized?: boolean;
}

interface CloudbedsRoom {
  roomID: string;
  roomName: string;
  roomDescription?: string;
  maxGuests?: number;
  isPrivate?: boolean;
  isVirtual?: boolean;
  roomBlocked: boolean;
  roomTypeID: string;
  roomTypeName: string;
  roomTypeNameShort?: string;
}

interface CloudbedsRoomsData {
  propertyID: string;
  rooms: CloudbedsRoom[];
}

interface CloudbedsWebhookPayload {
  version?: string;
  event: string;
  timestamp?: number;
  propertyID?: number;
  propertyID_str?: string;
  reservationID?: string;
  guestID?: string;
}

interface CloudbedsWebhookSubscription {
  id?: string;
  event?: { entity?: string; action?: string };
  subscriptionData?: { endpoint?: string };
}

interface CloudbedsResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface CloudbedsListResponse<T> {
  success: boolean;
  count: number;
  total: number;
  data: T[];
  message?: string;
}

// ==================
// Status Mapping
// ==================

function mapCloudbedsReservationStatus(status: string): ReservationStatus {
  switch (status) {
    case 'confirmed':
    case 'not_confirmed':
      return 'confirmed';
    case 'checked_in':
      return 'checked_in';
    case 'checked_out':
      return 'checked_out';
    case 'canceled':
      return 'cancelled';
    case 'no_show':
      return 'no_show';
    default:
      console.warn(`[pms-cloudbeds] Unknown Cloudbeds reservation status: ${status}, defaulting to confirmed`);
      return 'confirmed';
  }
}

function mapCloudbedsRoomStatus(roomBlocked: boolean): RoomStatus {
  return roomBlocked ? 'occupied' : 'vacant';
}

// ==================
// Normalization Helpers
// ==================

function mapCloudbedsGuest(
  guestId: string,
  guest: CloudbedsGuestInReservation | CloudbedsGuestListItem | CloudbedsGuestDetail
): NormalizedGuest {
  const normalized: NormalizedGuest = {
    externalId: guestId,
    source: 'cloudbeds',
    firstName: guest.firstName ?? '',
    lastName: guest.lastName ?? '',
  };

  const phone = guest.phone || ('cellPhone' in guest ? guest.cellPhone : undefined);
  if (guest.email) normalized.email = guest.email;
  if (phone) normalized.phone = phone;
  if (guest.country) normalized.nationality = guest.country;

  if (guest.specialRequests) {
    normalized.preferences = [{ category: 'request', value: guest.specialRequests }];
  }

  return normalized;
}

function mapCloudbedsReservation(
  res: CloudbedsReservation,
  guestId: string,
  guest: CloudbedsGuestInReservation
): NormalizedReservation {
  const primaryRoom = res.assigned?.[0];

  const normalized: NormalizedReservation = {
    externalId: res.reservationID,
    source: 'cloudbeds',
    confirmationNumber: res.thirdPartyIdentifier || res.reservationID,
    guest: mapCloudbedsGuest(guestId, guest),
    roomType: primaryRoom?.roomTypeName ?? 'Unknown',
    arrivalDate: res.startDate,
    departureDate: res.endDate,
    status: mapCloudbedsReservationStatus(res.status),
    adults: primaryRoom?.adults ?? 0,
    children: primaryRoom?.children ?? 0,
  };

  if (primaryRoom?.roomName) normalized.roomNumber = primaryRoom.roomName;
  if (res.total != null) normalized.totalRate = res.total;

  return normalized;
}

function mapCloudbedsRoom(room: CloudbedsRoom): NormalizedRoom {
  return {
    number: room.roomName,
    type: room.roomTypeName,
    status: mapCloudbedsRoomStatus(room.roomBlocked),
  };
}

// ==================
// Webhook Event Helpers
// ==================

function mapReservationStatusToEventType(status: ReservationStatus): PMSEventType {
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

function mapCloudbedsEventToType(event: string): PMSEventType | null {
  switch (event) {
    case 'reservation/created':
      return 'reservation.created';
    case 'reservation/status_changed':
    case 'reservation/dates_changed':
    case 'reservation/accommodation_changed':
    case 'reservation/accommodation_type_changed':
      return 'reservation.updated';
    case 'reservation/deleted':
      return 'reservation.cancelled';
    case 'guest/details_changed':
    case 'guest/created':
      return 'guest.updated';
    default:
      return null;
  }
}

// ==================
// CloudbedsPMSAdapter
// ==================

export class CloudbedsPMSAdapter implements PMSAdapter {
  readonly provider = 'cloudbeds' as const;
  readonly appLog: AppLogger;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly propertyId: string;
  private readonly webhookUrl?: string;

  constructor(config: CloudbedsConfig, context: PluginContext) {
    this.appLog = context.appLog;
    this.apiKey = config.apiKey;
    this.baseUrl = CLOUDBEDS_API_URL;
    this.propertyId = config.propertyId;
    if (config.webhookUrl) this.webhookUrl = config.webhookUrl;
    // config.clientId accepted but not used — reserved for future Marketplace OAuth flow
  }

  // ==================
  // Connection
  // ==================

  async testConnection(): Promise<boolean> {
    try {
      return await this.appLog('test_connection', {}, async () => {
        const response = await this.httpGet<CloudbedsListResponse<CloudbedsReservation>>(
          'getReservations',
          { propertyID: this.propertyId, pageSize: 1 }
        );

        if (!response.success) {
          console.error(`[pms-cloudbeds] Connection test failed: ${response.message}`);
          return false;
        }

        if (this.webhookUrl) {
          await this.subscribeWebhooks(this.webhookUrl);
        }

        return true;
      });
    } catch {
      return false;
    }
  }

  // ==================
  // Reservations
  // ==================

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation', { externalId }, async () => {
      const response = await this.httpGet<CloudbedsResponse<CloudbedsReservation>>(
        'getReservation',
        {
          propertyID: this.propertyId,
          reservationID: externalId,
          includeGuestsDetails: true,
        }
      );

      if (!response.success || !response.data) return null;

      return this.normalizeReservation(response.data);
    });
  }

  async getReservationByConfirmation(
    confirmationNumber: string
  ): Promise<NormalizedReservation | null> {
    return this.appLog('get_reservation_by_confirmation', { confirmationNumber }, async () => {
      return this.getReservation(confirmationNumber);
    });
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    return this.appLog('search_reservations', { query }, async () => {
      const params: Record<string, string | number | boolean | undefined> = {
        propertyID: this.propertyId,
        includeGuestsDetails: true,
      };

      if (query.arrivalFrom) params.checkInFrom = query.arrivalFrom;
      if (query.arrivalTo) params.checkInTo = query.arrivalTo;
      if (query.departureFrom) params.checkOutFrom = query.departureFrom;
      if (query.departureTo) params.checkOutTo = query.departureTo;
      if (query.status) params.status = mapJackStatusToCloudbeds(query.status);
      if (query.roomNumber) params.roomName = query.roomNumber;
      if (query.limit) params.pageSize = Math.min(query.limit, DEFAULT_PAGE_SIZE);

      if (query.guestPhone) {
        const guestId = await this.resolveGuestIdByPhone(query.guestPhone);
        if (!guestId) return [];
        params.guestID = guestId;
      } else if (query.guestEmail) {
        const guestId = await this.resolveGuestIdByEmail(query.guestEmail);
        if (!guestId) return [];
        params.guestID = guestId;
      }

      const reservations = await this.fetchPaginated<CloudbedsReservation>(
        'getReservations',
        params
      );

      return reservations
        .map((r) => this.normalizeReservation(r))
        .filter((r): r is NormalizedReservation => r !== null);
    });
  }

  async getModifiedReservations(since: Date): Promise<NormalizedReservation[]> {
    return this.appLog('get_modified_reservations', { since: since.toISOString() }, async () => {
      const params: Record<string, string | number | boolean | undefined> = {
        propertyID: this.propertyId,
        modifiedFrom: since.toISOString(),
        modifiedTo: new Date().toISOString(),
        includeGuestsDetails: true,
      };

      const reservations = await this.fetchPaginated<CloudbedsReservation>(
        'getReservations',
        params
      );

      return reservations
        .map((r) => this.normalizeReservation(r))
        .filter((r): r is NormalizedReservation => r !== null);
    });
  }

  // ==================
  // Guests
  // ==================

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest', { externalId }, async () => {
      const response = await this.httpGet<CloudbedsResponse<CloudbedsGuestDetail>>(
        'getGuest',
        { propertyID: this.propertyId, guestID: externalId }
      );

      if (!response.success || !response.data) return null;

      return mapCloudbedsGuest(externalId, response.data);
    });
  }

  async getGuestByPhone(phone: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest_by_phone', { phone }, async () => {
      const items = await this.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestPhone: phone, includeGuestInfo: true },
        1
      );

      const item = items[0];
      if (!item) return null;

      return mapCloudbedsGuest(item.guestID, item);
    });
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    return this.appLog('get_guest_by_email', { email }, async () => {
      const items = await this.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestEmail: email, includeGuestInfo: true },
        1
      );

      const item = items[0];
      if (!item) return null;

      return mapCloudbedsGuest(item.guestID, item);
    });
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    return this.appLog('search_guests', { query }, async () => {
      const parts = query.trim().split(/\s+/);
      const lastName = parts[parts.length - 1]!;

      const items = await this.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestLastName: lastName, includeGuestInfo: true }
      );

      return items.map((item) => mapCloudbedsGuest(item.guestID, item));
    });
  }

  // ==================
  // Rooms
  // ==================

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    return this.appLog('get_room_status', { roomNumber }, async () => {
      const rooms = await this.fetchAllRooms();
      return rooms.find((r) => r.number === roomNumber) ?? null;
    });
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    return this.appLog('get_all_rooms', {}, async () => {
      return this.fetchAllRooms();
    });
  }

  // ==================
  // Webhooks
  // ==================

  async parseWebhook(
    payload: unknown,
    _headers?: Record<string, string>
  ): Promise<PMSEvent | null> {
    return this.appLog('parse_webhook', {}, async () => {
      const data = payload as CloudbedsWebhookPayload;

      if (!data.event) {
        return null;
      }

      const payloadPropertyId = data.propertyID_str ?? String(data.propertyID ?? '');
      if (payloadPropertyId && this.propertyId && payloadPropertyId !== this.propertyId) {
        console.warn(
          `[pms-cloudbeds] Webhook propertyID mismatch — expected ${this.propertyId}, got ${payloadPropertyId}`
        );
        return null;
      }

      const baseEventType = mapCloudbedsEventToType(data.event);
      if (!baseEventType) {
        return null;
      }

      const timestamp = data.timestamp
        ? new Date(data.timestamp * 1000).toISOString()
        : new Date().toISOString();

      if (data.event.startsWith('guest/') && data.guestID) {
        const guest = await this.getGuest(data.guestID);
        if (!guest) {
          console.warn(`[pms-cloudbeds] Could not fetch guest ${data.guestID} for webhook`);
          return null;
        }
        return { type: 'guest.updated', source: 'cloudbeds', timestamp, data: { guest } };
      }

      if (data.reservationID) {
        const reservation = await this.getReservation(data.reservationID);
        if (!reservation) {
          console.warn(`[pms-cloudbeds] Could not fetch reservation ${data.reservationID} for webhook`);
          return null;
        }

        const eventType =
          data.event === 'reservation/created'
            ? 'reservation.created'
            : data.event === 'reservation/deleted'
              ? 'reservation.cancelled'
              : mapReservationStatusToEventType(reservation.status);

        return { type: eventType, source: 'cloudbeds', timestamp, data: { reservation } };
      }

      return null;
    });
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // Cloudbeds v1.3 does not provide a webhook signing mechanism.
    // propertyID validation in parseWebhook() is the available mitigation.
    return true;
  }

  // ==================
  // HTTP Transport (pure — no appLog)
  // ==================

  private async httpGet<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt + 1) * 1000;
        console.warn(`[pms-cloudbeds] Rate limited on ${endpoint}, retrying in ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastError = new Error(`Rate limited (429) on ${endpoint}`);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        let responseBody: unknown = text;
        try {
          responseBody = JSON.parse(text);
        } catch {
          /* keep as string */
        }
        throw new AppLogError(
          `Cloudbeds API error ${response.status} on ${endpoint}: ${text}`,
          { httpStatus: response.status, responseBody }
        );
      }

      return (await response.json()) as T;
    }

    throw lastError ?? new Error(`Cloudbeds API request failed after ${MAX_RETRIES} retries`);
  }

  private async httpPostForm<T>(
    endpoint: string,
    body: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const params = new URLSearchParams(body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppLogError(
        `Cloudbeds API error ${response.status} on ${endpoint}: ${text}`,
        { httpStatus: response.status }
      );
    }

    return (await response.json()) as T;
  }

  private async fetchPaginated<TItem>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    let pageNumber = 1;

    do {
      const response = await this.httpGet<CloudbedsListResponse<TItem>>(endpoint, {
        ...params,
        pageNumber,
        pageSize,
      });

      if (!response.success || !Array.isArray(response.data)) break;

      results.push(...response.data);

      if (results.length >= response.total) break;
      pageNumber++;
    } while (true);

    return results;
  }

  // ==================
  // Internal Helpers
  // ==================

  private normalizeReservation(res: CloudbedsReservation): NormalizedReservation | null {
    const guestEntries = res.guestList ? Object.entries(res.guestList) : [];
    const [guestId, guestData] = guestEntries[0] ?? [undefined, undefined];

    if (!guestId || !guestData) {
      const fallbackGuest: NormalizedGuest = {
        externalId: `${res.reservationID}_guest`,
        source: 'cloudbeds',
        firstName: res.guestName?.split(' ')[0] ?? '',
        lastName: res.guestName?.split(' ').slice(1).join(' ') ?? res.guestName ?? '',
        ...(res.guestEmail && { email: res.guestEmail }),
      };

      return {
        externalId: res.reservationID,
        source: 'cloudbeds',
        confirmationNumber: res.thirdPartyIdentifier || res.reservationID,
        guest: fallbackGuest,
        roomType: res.assigned?.[0]?.roomTypeName ?? 'Unknown',
        arrivalDate: res.startDate,
        departureDate: res.endDate,
        status: mapCloudbedsReservationStatus(res.status),
        adults: res.assigned?.[0]?.adults ?? 0,
        children: res.assigned?.[0]?.children ?? 0,
        ...(res.assigned?.[0]?.roomName && { roomNumber: res.assigned[0].roomName }),
        ...(res.total != null && { totalRate: res.total }),
      };
    }

    return mapCloudbedsReservation(res, guestId, guestData);
  }

  private async fetchAllRooms(): Promise<NormalizedRoom[]> {
    const data = await this.fetchPaginated<CloudbedsRoomsData>(
      'getRooms',
      { propertyIDs: this.propertyId },
      ROOMS_PAGE_SIZE
    );

    return data.flatMap((propertyData) =>
      (propertyData.rooms ?? []).map(mapCloudbedsRoom)
    );
  }

  private async resolveGuestIdByPhone(phone: string): Promise<string | null> {
    try {
      const items = await this.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestPhone: phone },
        1
      );
      return items[0]?.guestID ?? null;
    } catch {
      return null;
    }
  }

  private async resolveGuestIdByEmail(email: string): Promise<string | null> {
    try {
      const items = await this.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestEmail: email },
        1
      );
      return items[0]?.guestID ?? null;
    } catch {
      return null;
    }
  }

  private async subscribeWebhooks(webhookUrl: string): Promise<void> {
    try {
      const existing = await this.httpGet<CloudbedsListResponse<CloudbedsWebhookSubscription>>(
        'getWebhooks',
        { propertyID: this.propertyId }
      );

      const subscribedEvents = new Set(
        (existing.data ?? [])
          .filter((s) => s.subscriptionData?.endpoint === webhookUrl)
          .map((s) => `${s.event?.entity}/${s.event?.action}`)
      );

      for (const { object, action } of WEBHOOK_SUBSCRIPTIONS) {
        const key = `${object}/${action}`;
        if (subscribedEvents.has(key)) continue;

        await this.httpPostForm<{ success: boolean; data: { subscriptionID: string } }>(
          'postWebhook',
          { propertyID: this.propertyId, object, action, endpointUrl: webhookUrl }
        );
      }
    } catch (err) {
      // Non-fatal: webhooks enhance sync but polling covers the gap
      console.warn('[pms-cloudbeds] Failed to subscribe webhooks — polling will continue:', err);
    }
  }
}

// ==================
// Helpers
// ==================

function mapJackStatusToCloudbeds(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'checked_in':
      return 'checked_in';
    case 'checked_out':
      return 'checked_out';
    case 'cancelled':
      return 'canceled';
    case 'no_show':
      return 'no_show';
    default:
      return 'confirmed';
  }
}

// ==================
// Factory & Manifest
// ==================

export function createCloudbedsAdapter(
  config: CloudbedsConfig,
  context: PluginContext
): CloudbedsPMSAdapter {
  return new CloudbedsPMSAdapter(config, context);
}

export const manifest: PMSAppManifest = {
  id: 'pms-cloudbeds',
  name: 'Cloudbeds',
  category: 'pms',
  version: '1.0.0',
  description: 'Connect to Cloudbeds PMS for real-time reservation sync',
  icon: '🏨',
  docsUrl: 'https://developers.cloudbeds.com/api',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description:
        'Cloudbeds API key — generate in Cloudbeds → Settings → Apps & Marketplace → Developer Tools',
    },
    {
      key: 'propertyId',
      label: 'Property ID',
      type: 'text',
      required: true,
      description: 'Cloudbeds property ID — found in Cloudbeds → Settings → Property Info',
    },
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      type: 'text',
      required: false,
      description:
        'Jack webhook URL to receive Cloudbeds events. Auto-subscribes on Test Connection when set.',
    },
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: false,
      description:
        'OAuth/Marketplace client ID — only needed if registered as a Cloudbeds Marketplace partner app',
    },
    {
      key: 'stalenessThreshold',
      label: 'Staleness Threshold (seconds)',
      type: 'number',
      required: false,
      default: 300,
      description:
        'How old cached reservation data can be before refreshing from Cloudbeds. Default: 300 (5 min).',
    },
    {
      key: 'syncInterval',
      label: 'Sync Interval (seconds)',
      type: 'number',
      required: false,
      default: 600,
      description:
        'How often to poll Cloudbeds for updated reservations. Default: 600 (10 min).',
    },
  ],
  features: {
    reservations: true,
    guests: true,
    rooms: true,
    webhooks: true,
  },
  createAdapter: (config, context) =>
    createCloudbedsAdapter(config as unknown as CloudbedsConfig, context),
};

export default { manifest };
