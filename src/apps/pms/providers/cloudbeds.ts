/**
 * Cloudbeds PMS Adapter
 *
 * Production PMS adapter for Cloudbeds (https://cloudbeds.com).
 * Cloudbeds uses a REST API (v1.3) with GET requests and query parameters.
 * Auth is via a single API key sent in the x-api-key header — no token refresh needed.
 *
 * Known limitations (see docs/06-roadmap/012-pms-cloudbeds.md):
 * - Room status: only occupied/vacant — no housekeeping states (dirty/clean/inspected)
 * - NormalizedRoom.floor/currentGuestId/currentReservationId always undefined
 * - NormalizedGuest.language/loyaltyTier/vipStatus always undefined
 * - NormalizedReservation.currency/rateCode/notes always undefined
 * - Multi-room reservations: only primary room (assigned[0]) mapped
 * - getReservationByConfirmation() delegates to getReservation() — no confirmation search API;
 *   confirmationNumber in normalized data stores thirdPartyIdentifier ?? reservationID so local
 *   cache lookups work for OTA bookings
 * - getModifiedReservations() may miss some changes (Cloudbeds API documented limitation)
 * - room.status_changed PMSEvent type is never emitted
 * - No webhook HMAC verification; propertyID validation used as mitigation
 * - searchReservations() with guestPhone/guestEmail requires two API calls
 *
 * @module apps/pms/providers/cloudbeds
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
import { createAppLogger, AppLogError } from '@/apps/instrumentation.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('apps:pms:cloudbeds');

const CLOUDBEDS_API_URL = 'https://api.cloudbeds.com/api/v1.3';
const DEFAULT_PAGE_SIZE = 100;
const ROOMS_PAGE_SIZE = 100; // getRooms defaults to 20; always override
const MAX_RETRIES = 3;

// Webhook events to subscribe to during testConnection()
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
  // Present when includeGuestsDetails=true; keys are guestIDs
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
  event: string; // e.g. "reservation/created"
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
// CloudbedsClient — HTTP helper
// ==================

class CloudbedsClient {
  readonly appLog = createAppLogger('pms', 'pms-cloudbeds');

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  async get<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    return this.appLog('api_request', { endpoint }, async () => {
      const url = new URL(`${this.baseUrl}/${endpoint}`);

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }

      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        log.debug({ endpoint, attempt }, 'Cloudbeds API request');

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'x-api-key': this.apiKey },
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, attempt + 1) * 1000;
          log.warn({ endpoint, retryAfter: waitMs }, 'Cloudbeds rate limited, retrying');
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
    });
  }

  async postForm<T>(
    endpoint: string,
    body: Record<string, string>
  ): Promise<T> {
    return this.appLog('api_request', { endpoint }, async () => {
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
    });
  }

  async fetchPaginated<TItem>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    let pageNumber = 1;

    do {
      const response = await this.get<CloudbedsListResponse<TItem>>(endpoint, {
        ...params,
        pageNumber,
        pageSize,
      });

      if (!response.success || !Array.isArray(response.data)) break;

      results.push(...response.data);

      // Stop when this page has fewer items than the page size
      if (response.data.length < pageSize) break;

      pageNumber++;
    } while (true);

    return results;
  }
}

// ==================
// Status Mapping
// ==================

function mapCloudbedsReservationStatus(status: string): ReservationStatus {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'not_confirmed':
      // Tentative/OTA pending — mapped to confirmed; no separate pending state in Jack
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
      log.warn({ status }, 'Unknown Cloudbeds reservation status, defaulting to confirmed');
      return 'confirmed';
  }
}

function mapCloudbedsRoomStatus(roomBlocked: boolean): RoomStatus {
  // Cloudbeds only exposes availability (blocked = occupied), not housekeeping state.
  // dirty/clean/inspected/out_of_order are never returned.
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
  // language, loyaltyTier, vipStatus — not available in Cloudbeds v1.3

  // Map specialRequests (plain text) as a single structured preference entry
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
    // Store thirdPartyIdentifier (OTA booking reference) when present so it is
    // indexed in local DB for confirmation number lookups; fall back to reservationID
    // for direct bookings where they are the same value.
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
  // currency, rateCode, notes — not available in Cloudbeds v1.3

  return normalized;
}

function mapCloudbedsRoom(room: CloudbedsRoom): NormalizedRoom {
  return {
    number: room.roomName,
    type: room.roomTypeName,
    status: mapCloudbedsRoomStatus(room.roomBlocked),
    // floor, currentGuestId, currentReservationId — not available in Cloudbeds v1.3
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
      // Resolved to specific type after fetching full reservation
      return 'reservation.updated';
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
  readonly appLog = createAppLogger('pms', 'pms-cloudbeds');

  private readonly client: CloudbedsClient;
  private readonly propertyId: string;
  private readonly webhookUrl?: string;

  constructor(config: PMSConfig) {
    const flat = config as unknown as Record<string, unknown>;
    const apiKey = (flat.apiKey as string) || config.apiKey || '';
    const baseUrl = (flat.apiUrl as string) || config.apiUrl || CLOUDBEDS_API_URL;

    this.propertyId = (flat.propertyId as string) || config.propertyId || '';
    if (flat.webhookUrl) this.webhookUrl = flat.webhookUrl as string;

    this.client = new CloudbedsClient(baseUrl, apiKey);

    log.info({ propertyId: this.propertyId }, 'Cloudbeds PMS adapter initialized');
  }

  // ==================
  // Connection
  // ==================

  async testConnection(): Promise<boolean> {
    try {
      // Verify credentials by fetching one reservation; empty result is fine
      const response = await this.client.get<CloudbedsListResponse<CloudbedsReservation>>(
        'getReservations',
        { propertyID: this.propertyId, pageSize: 1 }
      );

      if (!response.success) {
        log.error({ message: response.message }, 'Cloudbeds connection test failed');
        return false;
      }

      log.info({ propertyId: this.propertyId }, 'Cloudbeds connection test successful');

      // Auto-subscribe webhooks if a webhook URL is configured
      if (this.webhookUrl) {
        await this.subscribeWebhooks(this.webhookUrl);
      } else {
        log.info('No webhookUrl configured — skipping webhook subscription');
      }

      return true;
    } catch (err) {
      log.error({ err }, 'Cloudbeds connection test failed');
      return false;
    }
  }

  // ==================
  // Reservations
  // ==================

  async getReservation(externalId: string): Promise<NormalizedReservation | null> {
    try {
      const response = await this.client.get<CloudbedsResponse<CloudbedsReservation>>(
        'getReservation',
        {
          propertyID: this.propertyId,
          reservationID: externalId,
          includeGuestsDetails: true,
        }
      );

      if (!response.success || !response.data) return null;

      return this.normalizeReservation(response.data);
    } catch (err) {
      log.error({ err, externalId }, 'Failed to get Cloudbeds reservation');
      return null;
    }
  }

  async getReservationByConfirmation(
    confirmationNumber: string
  ): Promise<NormalizedReservation | null> {
    // Cloudbeds v1.3 has no API to look up by guest-facing confirmation/booking number.
    // thirdPartyIdentifier (OTA reference) is stored as confirmationNumber in the local DB,
    // so the service layer resolves most lookups from cache. This fallback uses reservationID
    // directly, which works for direct bookings and cache-miss cases where the caller already
    // has the internal ID.
    return this.getReservation(confirmationNumber);
  }

  async searchReservations(query: ReservationQuery): Promise<NormalizedReservation[]> {
    try {
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

      // guestPhone/guestEmail: getReservations has no phone/email filter.
      // Resolve guestID first (2 API calls total).
      if (query.guestPhone) {
        const guestId = await this.resolveGuestIdByPhone(query.guestPhone);
        if (!guestId) return [];
        params.guestID = guestId;
      } else if (query.guestEmail) {
        const guestId = await this.resolveGuestIdByEmail(query.guestEmail);
        if (!guestId) return [];
        params.guestID = guestId;
      }

      const reservations = await this.client.fetchPaginated<CloudbedsReservation>(
        'getReservations',
        params
      );

      return reservations
        .map((r) => this.normalizeReservation(r))
        .filter((r): r is NormalizedReservation => r !== null);
    } catch (err) {
      log.error({ err }, 'Failed to search Cloudbeds reservations');
      return [];
    }
  }

  async getModifiedReservations(since: Date): Promise<NormalizedReservation[]> {
    try {
      // Note: Cloudbeds API documented limitation — "Some reservation modifications may not
      // be reflected in this timestamp." Webhooks are the primary sync mechanism; this
      // polling call is a safety net only.
      const params: Record<string, string | number | boolean | undefined> = {
        propertyID: this.propertyId,
        modifiedFrom: since.toISOString(),
        modifiedTo: now(),
        includeGuestsDetails: true,
      };

      const reservations = await this.client.fetchPaginated<CloudbedsReservation>(
        'getReservations',
        params
      );

      return reservations
        .map((r) => this.normalizeReservation(r))
        .filter((r): r is NormalizedReservation => r !== null);
    } catch (err) {
      log.error({ err }, 'Failed to get modified Cloudbeds reservations');
      return [];
    }
  }

  // ==================
  // Guests
  // ==================

  async getGuest(externalId: string): Promise<NormalizedGuest | null> {
    try {
      const response = await this.client.get<CloudbedsResponse<CloudbedsGuestDetail>>(
        'getGuest',
        { propertyID: this.propertyId, guestID: externalId }
      );

      if (!response.success || !response.data) return null;

      // getGuest response does not include guestID; use the input externalId
      return mapCloudbedsGuest(externalId, response.data);
    } catch (err) {
      log.error({ err, externalId }, 'Failed to get Cloudbeds guest');
      return null;
    }
  }

  async getGuestByPhone(phone: string): Promise<NormalizedGuest | null> {
    try {
      const items = await this.client.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestPhone: phone, includeGuestInfo: true },
        1
      );

      const item = items[0];
      if (!item) return null;

      return mapCloudbedsGuest(item.guestID, item);
    } catch (err) {
      log.error({ err }, 'Failed to get Cloudbeds guest by phone');
      return null;
    }
  }

  async getGuestByEmail(email: string): Promise<NormalizedGuest | null> {
    try {
      const items = await this.client.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestEmail: email, includeGuestInfo: true },
        1
      );

      const item = items[0];
      if (!item) return null;

      return mapCloudbedsGuest(item.guestID, item);
    } catch (err) {
      log.error({ err }, 'Failed to get Cloudbeds guest by email');
      return null;
    }
  }

  async searchGuests(query: string): Promise<NormalizedGuest[]> {
    try {
      // getGuestList has no free-text field; split on last space and search by last name.
      // Single-word queries are treated as last name. This may miss edge cases.
      const parts = query.trim().split(/\s+/);
      const lastName = parts[parts.length - 1]!;

      const items = await this.client.fetchPaginated<CloudbedsGuestListItem>(
        'getGuestList',
        { propertyIDs: this.propertyId, guestLastName: lastName, includeGuestInfo: true }
      );

      return items.map((item) => mapCloudbedsGuest(item.guestID, item));
    } catch (err) {
      log.error({ err, query }, 'Failed to search Cloudbeds guests');
      return [];
    }
  }

  // ==================
  // Rooms
  // ==================

  async getRoomStatus(roomNumber: string): Promise<NormalizedRoom | null> {
    try {
      // No single-room lookup endpoint; fetch all and filter client-side
      const rooms = await this.fetchAllRooms();
      return rooms.find((r) => r.number === roomNumber) ?? null;
    } catch (err) {
      log.error({ err, roomNumber }, 'Failed to get Cloudbeds room status');
      return null;
    }
  }

  async getAllRooms(): Promise<NormalizedRoom[]> {
    try {
      return await this.fetchAllRooms();
    } catch (err) {
      log.error({ err }, 'Failed to get all Cloudbeds rooms');
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
    const data = payload as CloudbedsWebhookPayload;

    if (!data.event) {
      log.debug('Cloudbeds webhook payload missing event field');
      return null;
    }

    // Validate propertyID matches config (no HMAC available; this is the mitigation)
    const payloadPropertyId = data.propertyID_str ?? String(data.propertyID ?? '');
    if (payloadPropertyId && this.propertyId && payloadPropertyId !== this.propertyId) {
      log.warn(
        { expected: this.propertyId, received: payloadPropertyId },
        'Cloudbeds webhook propertyID mismatch — rejected'
      );
      return null;
    }

    const baseEventType = mapCloudbedsEventToType(data.event);
    if (!baseEventType) {
      log.debug({ event: data.event }, 'Unhandled Cloudbeds webhook event type');
      return null;
    }

    const timestamp = data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : now();

    // Guest events: emit without fetching full reservation
    if (data.event.startsWith('guest/') && data.guestID) {
      const guest = await this.getGuest(data.guestID);
      if (!guest) {
        log.warn({ guestID: data.guestID }, 'Could not fetch guest for Cloudbeds webhook');
        return null;
      }
      return { type: 'guest.updated', source: 'cloudbeds', timestamp, data: { guest } };
    }

    // Reservation events: fetch full record to determine precise event type
    if (data.reservationID) {
      const reservation = await this.getReservation(data.reservationID);
      if (!reservation) {
        log.warn(
          { reservationID: data.reservationID },
          'Could not fetch reservation for Cloudbeds webhook'
        );
        return null;
      }

      // Resolve precise event type from actual reservation status
      const eventType =
        data.event === 'reservation/created'
          ? 'reservation.created'
          : data.event === 'reservation/deleted'
            ? 'reservation.cancelled'
            : mapReservationStatusToEventType(reservation.status);

      return { type: eventType, source: 'cloudbeds', timestamp, data: { reservation } };
    }

    log.debug({ event: data.event }, 'Cloudbeds webhook has no reservationID or guestID');
    return null;
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // Cloudbeds v1.3 does not provide a webhook signing mechanism.
    // propertyID validation in parseWebhook() is the available mitigation.
    log.warn(
      'Cloudbeds does not support webhook signature verification (v1.3 API limitation)'
    );
    return true;
  }

  // ==================
  // Internal Helpers
  // ==================

  private normalizeReservation(res: CloudbedsReservation): NormalizedReservation | null {
    // Extract main guest from guestList (first entry when includeGuestsDetails=true)
    const guestEntries = res.guestList ? Object.entries(res.guestList) : [];
    const [guestId, guestData] = guestEntries[0] ?? [undefined, undefined];

    if (!guestId || !guestData) {
      // Fallback: construct minimal guest from top-level fields
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
    // getRooms response nests rooms under per-property objects
    const data = await this.client.fetchPaginated<CloudbedsRoomsData>(
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
      const items = await this.client.fetchPaginated<CloudbedsGuestListItem>(
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
      const items = await this.client.fetchPaginated<CloudbedsGuestListItem>(
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
      // Fetch existing subscriptions for this endpoint to avoid duplicates
      const existing = await this.client.get<CloudbedsListResponse<CloudbedsWebhookSubscription>>(
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
        if (subscribedEvents.has(key)) {
          log.debug({ event: key }, 'Cloudbeds webhook already subscribed');
          continue;
        }

        await this.client.postForm<{ success: boolean; data: { subscriptionID: string } }>(
          'postWebhook',
          { propertyID: this.propertyId, object, action, endpointUrl: webhookUrl }
        );

        log.info({ event: key }, 'Cloudbeds webhook subscribed');
      }
    } catch (err) {
      // Non-fatal: webhooks enhance sync but polling covers the gap
      log.warn({ err }, 'Failed to subscribe Cloudbeds webhooks — polling will continue');
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

export function createCloudbedsAdapter(config: PMSConfig): CloudbedsPMSAdapter {
  return new CloudbedsPMSAdapter(config);
}

export const manifest: PMSAppManifest = {
  id: 'pms-cloudbeds',
  name: 'Cloudbeds',
  category: 'pms',
  version: '1.0.0',
  description: 'Connect to Cloudbeds PMS for real-time reservation sync',
  icon: '🏨',
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
        'Jack webhook URL to receive Cloudbeds events (e.g. https://your-hotel.com/api/v1/webhooks/pms). Auto-subscribes on Test Connection when set.',
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
        'How often to poll Cloudbeds for updated reservations. Default: 600 (10 min) — conservative for 200 req/min rate limit.',
    },
  ],
  features: {
    reservations: true,
    guests: true,
    rooms: true,
    webhooks: true,
  },
  createAdapter: (config) => createCloudbedsAdapter(config as unknown as PMSConfig),
};
