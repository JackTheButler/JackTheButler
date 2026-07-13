/**
 * Hospitality entity resolution for the pipeline.
 *
 * Bundles a guest plus their active reservation into a single
 * `HospitalityEntity` — the rich shape the responder reads when building
 * the system prompt. The package only sees the minimal `Entity` (`id`);
 * everything else is hospitality-specific.
 *
 * Only phone-based channels (whatsapp, sms) carry reliable identity at
 * first message; email and other channels return `null` here and identity
 * is established later (verification flow, conversation matching).
 *
 * Inlined here (rather than imported from `src/core/domain/hospitality/`)
 * so the domain folder can be deleted cleanly once `pipeline-legacy/` is
 * retired.
 *
 * @module pipeline/entity-resolver
 */

import { guestService, normalizePhone } from '@/services/guest.js';
import { guestContextService, type GuestContext } from '@/services/guest-context.js';
import { createLogger } from '@/utils/logger.js';
import type { Entity, EntityProvider } from '@thebutler/pipeline';

const log = createLogger('pipeline:entity-resolver');

/**
 * Hospitality's domain-extended `Entity`. The pipeline only reads `id`;
 * `prompts.ts` reads the rest by casting `ctx.entity` to this shape.
 */
export interface HospitalityEntity extends Entity {
  readonly displayName: string;
  readonly language: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly loyaltyTier: string | null;
  readonly vipStatus: string | null;
  readonly preferences: ReadonlyArray<{ readonly category: string; readonly value: string }>;
  readonly reservation: HospitalityReservation | null;
}

export interface HospitalityReservation {
  readonly id: string;
  readonly confirmationNumber: string;
  readonly roomNumber: string | null;
  readonly roomType: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly status: string;
  readonly specialRequests: readonly string[];
  readonly isCheckedIn: boolean;
  readonly stayDuration: number;
  readonly daysRemaining: number;
}

export const entityProvider: EntityProvider = {
  async resolve(inbound) {
    // Only phone-based channels carry reliable identity at first message.
    if (inbound.channel !== 'whatsapp' && inbound.channel !== 'sms') {
      return null;
    }

    const normalized = normalizePhone(inbound.channelId);
    if (!normalized) return null;

    try {
      // findOrCreate ensures the guest exists before we load the context.
      await guestService.findOrCreateByPhone(normalized);
      const context = await guestContextService.getContextByPhone(normalized);
      return contextToEntity(context);
    } catch (err) {
      log.warn({ err, phone: inbound.channelId }, 'Failed to resolve hospitality entity');
      return null;
    }
  },

  async findById(id) {
    const guest = await guestService.findById(id);
    if (!guest) return null;

    // Re-route through the phone/email-based context loader so we get the
    // active reservation. If the guest has neither identifier, return a
    // minimal entity without reservation data.
    if (guest.phone) {
      const context = await guestContextService.getContextByPhone(guest.phone);
      const entity = contextToEntity(context);
      if (entity) return entity;
    }
    if (guest.email) {
      const context = await guestContextService.getContextByEmail(guest.email);
      const entity = contextToEntity(context);
      if (entity) return entity;
    }

    return {
      id: guest.id,
      displayName: `${guest.firstName} ${guest.lastName}`,
      language: guest.language || 'en',
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      loyaltyTier: guest.loyaltyTier,
      vipStatus: guest.vipStatus,
      preferences: parsePreferences(guest.preferences),
      reservation: null,
    };
  },
};

function contextToEntity(context: GuestContext): HospitalityEntity | null {
  if (!context.guest) return null;
  return {
    id: context.guest.id,
    displayName: context.guest.fullName,
    language: context.guest.language,
    firstName: context.guest.firstName,
    lastName: context.guest.lastName,
    email: context.guest.email,
    phone: context.guest.phone,
    loyaltyTier: context.guest.loyaltyTier,
    vipStatus: context.guest.vipStatus,
    preferences: context.guest.preferences,
    reservation: context.reservation,
  };
}

function parsePreferences(raw: string | null): HospitalityEntity['preferences'] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ category: string; value: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
