/**
 * Hotel Profile Routes
 *
 * API endpoints for managing hotel profile settings.
 * Stored in the settings table as a JSON value.
 *
 * @module gateway/routes/hotel-profile
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { hotelProfileService, type HotelProfile } from '@/services/hotel-profile.js';

// ===================
// Schema
// ===================

/**
 * Property type enum
 */
const propertyTypeEnum = z.enum(['hotel', 'bnb', 'vacation_rental', 'other']);

/**
 * Hotel profile schema
 */
const hotelProfileSchema = z.object({
  name: z.string().min(1).max(200),
  propertyType: propertyTypeEnum.optional(), // hotel, bnb, vacation_rental, other
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  timezone: z.string().min(1), // e.g., "America/New_York", "Europe/London"
  currency: z.string().length(3).default('USD'), // ISO 4217 currency code
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').default('15:00'),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').default('11:00'),
  totalRooms: z.number().int().positive().optional(),
  propertyLanguage: z.string().min(2).max(10).default('en'),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().max(200).optional(),
  website: z.string().url().max(500).optional(),
});

type Variables = {
  validatedBody: unknown;
  userId: string;
};

// ===================
// Routes
// ===================

const hotelProfileRoutes = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
hotelProfileRoutes.use('/*', requireAuth);

/**
 * GET /api/v1/settings/hotel
 * Get current hotel profile
 */
hotelProfileRoutes.get('/', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const result = await hotelProfileService.getProfile();
  return c.json(result);
});

/**
 * PUT /api/v1/settings/hotel
 * Update hotel profile
 */
hotelProfileRoutes.put('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE), validateBody(hotelProfileSchema), async (c) => {
  const profile = c.get('validatedBody') as HotelProfile;

  const updated = await hotelProfileService.updateProfile(profile);

  return c.json({
    message: 'Hotel profile updated',
    profile: updated,
  });
});

/**
 * GET /api/v1/settings/hotel/timezones
 * Get list of all IANA timezones for dropdown with UTC offsets
 */
hotelProfileRoutes.get('/timezones', requirePermission(PERMISSIONS.SETTINGS_VIEW), (c) => {
  return c.json({ timezones: hotelProfileService.getTimezones() });
});

/**
 * GET /api/v1/settings/hotel/currencies
 * Get list of currencies for dropdown
 */
hotelProfileRoutes.get('/currencies', requirePermission(PERMISSIONS.SETTINGS_VIEW), (c) => {
  return c.json({ currencies: hotelProfileService.getCurrencies() });
});

/**
 * GET /api/v1/settings/hotel/countries
 * Get list of countries for dropdown
 */
hotelProfileRoutes.get('/countries', requirePermission(PERMISSIONS.SETTINGS_VIEW), (c) => {
  return c.json({ countries: hotelProfileService.getCountries() });
});

/**
 * GET /api/v1/settings/hotel/languages
 * Get list of languages for dropdown
 */
hotelProfileRoutes.get('/languages', requirePermission(PERMISSIONS.SETTINGS_VIEW), (c) => {
  return c.json({ languages: hotelProfileService.getLanguages() });
});

export { hotelProfileRoutes };
