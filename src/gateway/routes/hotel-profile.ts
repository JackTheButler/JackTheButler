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
import { eq } from 'drizzle-orm';
import { db, settings } from '@/db/index.js';
import { validateBody } from '../middleware/validator.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('routes:hotel-profile');

const SETTINGS_KEY = 'hotel_profile';

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
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().max(200).optional(),
  website: z.string().url().max(500).optional(),
});

export type HotelProfile = z.infer<typeof hotelProfileSchema>;

/**
 * Default hotel profile
 */
const DEFAULT_PROFILE: HotelProfile = {
  name: '',
  timezone: 'UTC',
  currency: 'USD',
  checkInTime: '15:00',
  checkOutTime: '11:00',
};

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
hotelProfileRoutes.get('/', async (c) => {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .get();

  if (!row) {
    return c.json({ profile: DEFAULT_PROFILE, isConfigured: false });
  }

  try {
    const profile = JSON.parse(row.value) as HotelProfile;
    return c.json({ profile, isConfigured: true });
  } catch {
    log.warn('Failed to parse hotel profile, returning defaults');
    return c.json({ profile: DEFAULT_PROFILE, isConfigured: false });
  }
});

/**
 * PUT /api/v1/settings/hotel
 * Update hotel profile
 */
hotelProfileRoutes.put('/', validateBody(hotelProfileSchema), async (c) => {
  const profile = c.get('validatedBody') as HotelProfile;
  const now = new Date().toISOString();

  // Check if profile exists
  const existing = await db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .get();

  if (existing) {
    await db
      .update(settings)
      .set({
        value: JSON.stringify(profile),
        updatedAt: now,
      })
      .where(eq(settings.key, SETTINGS_KEY))
      .run();
  } else {
    await db
      .insert(settings)
      .values({
        key: SETTINGS_KEY,
        value: JSON.stringify(profile),
        updatedAt: now,
      })
      .run();
  }

  log.info({ hotelName: profile.name }, 'Hotel profile updated');

  return c.json({
    message: 'Hotel profile updated',
    profile,
  });
});

/**
 * GET /api/v1/settings/hotel/timezones
 * Get list of all IANA timezones for dropdown with UTC offsets
 */
hotelProfileRoutes.get('/timezones', (c) => {
  // Sorted by UTC offset, then alphabetically
  const timezones = [
    // UTC-11 to UTC-9
    { value: 'Pacific/Midway', label: '(UTC-11:00) Pacific/Midway' },
    { value: 'Pacific/Honolulu', label: '(UTC-10:00) Pacific/Honolulu' },
    { value: 'America/Anchorage', label: '(UTC-09:00) America/Anchorage' },
    // UTC-8
    { value: 'America/Los_Angeles', label: '(UTC-08:00) America/Los Angeles' },
    { value: 'America/Tijuana', label: '(UTC-08:00) America/Tijuana' },
    { value: 'America/Vancouver', label: '(UTC-08:00) America/Vancouver' },
    // UTC-7
    { value: 'America/Denver', label: '(UTC-07:00) America/Denver' },
    { value: 'America/Phoenix', label: '(UTC-07:00) America/Phoenix' },
    // UTC-6
    { value: 'America/Chicago', label: '(UTC-06:00) America/Chicago' },
    { value: 'America/Mexico_City', label: '(UTC-06:00) America/Mexico City' },
    // UTC-5
    { value: 'America/Bogota', label: '(UTC-05:00) America/Bogota' },
    { value: 'America/Lima', label: '(UTC-05:00) America/Lima' },
    { value: 'America/New_York', label: '(UTC-05:00) America/New York' },
    { value: 'America/Panama', label: '(UTC-05:00) America/Panama' },
    { value: 'America/Toronto', label: '(UTC-05:00) America/Toronto' },
    // UTC-4
    { value: 'America/Caracas', label: '(UTC-04:00) America/Caracas' },
    { value: 'America/Halifax', label: '(UTC-04:00) America/Halifax' },
    { value: 'America/Santiago', label: '(UTC-04:00) America/Santiago' },
    // UTC-3
    { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) America/Buenos Aires' },
    { value: 'America/Sao_Paulo', label: '(UTC-03:00) America/Sao Paulo' },
    // UTC-1
    { value: 'Atlantic/Azores', label: '(UTC-01:00) Atlantic/Azores' },
    // UTC+0
    { value: 'UTC', label: '(UTC+00:00) UTC' },
    { value: 'Africa/Abidjan', label: '(UTC+00:00) Africa/Abidjan' },
    { value: 'Africa/Accra', label: '(UTC+00:00) Africa/Accra' },
    { value: 'Africa/Casablanca', label: '(UTC+00:00) Africa/Casablanca' },
    { value: 'Atlantic/Reykjavik', label: '(UTC+00:00) Atlantic/Reykjavik' },
    { value: 'Europe/Dublin', label: '(UTC+00:00) Europe/Dublin' },
    { value: 'Europe/Lisbon', label: '(UTC+00:00) Europe/Lisbon' },
    { value: 'Europe/London', label: '(UTC+00:00) Europe/London' },
    // UTC+1
    { value: 'Africa/Algiers', label: '(UTC+01:00) Africa/Algiers' },
    { value: 'Africa/Lagos', label: '(UTC+01:00) Africa/Lagos' },
    { value: 'Africa/Tunis', label: '(UTC+01:00) Africa/Tunis' },
    { value: 'Europe/Amsterdam', label: '(UTC+01:00) Europe/Amsterdam' },
    { value: 'Europe/Berlin', label: '(UTC+01:00) Europe/Berlin' },
    { value: 'Europe/Brussels', label: '(UTC+01:00) Europe/Brussels' },
    { value: 'Europe/Copenhagen', label: '(UTC+01:00) Europe/Copenhagen' },
    { value: 'Europe/Madrid', label: '(UTC+01:00) Europe/Madrid' },
    { value: 'Europe/Oslo', label: '(UTC+01:00) Europe/Oslo' },
    { value: 'Europe/Paris', label: '(UTC+01:00) Europe/Paris' },
    { value: 'Europe/Prague', label: '(UTC+01:00) Europe/Prague' },
    { value: 'Europe/Rome', label: '(UTC+01:00) Europe/Rome' },
    { value: 'Europe/Stockholm', label: '(UTC+01:00) Europe/Stockholm' },
    { value: 'Europe/Vienna', label: '(UTC+01:00) Europe/Vienna' },
    { value: 'Europe/Warsaw', label: '(UTC+01:00) Europe/Warsaw' },
    { value: 'Europe/Zurich', label: '(UTC+01:00) Europe/Zurich' },
    // UTC+2
    { value: 'Africa/Cairo', label: '(UTC+02:00) Africa/Cairo' },
    { value: 'Africa/Johannesburg', label: '(UTC+02:00) Africa/Johannesburg' },
    { value: 'Europe/Athens', label: '(UTC+02:00) Europe/Athens' },
    { value: 'Europe/Bucharest', label: '(UTC+02:00) Europe/Bucharest' },
    { value: 'Europe/Budapest', label: '(UTC+02:00) Europe/Budapest' },
    { value: 'Europe/Helsinki', label: '(UTC+02:00) Europe/Helsinki' },
    { value: 'Europe/Kiev', label: '(UTC+02:00) Europe/Kiev' },
    { value: 'Asia/Beirut', label: '(UTC+02:00) Asia/Beirut' },
    { value: 'Asia/Jerusalem', label: '(UTC+02:00) Asia/Jerusalem' },
    // UTC+3
    { value: 'Africa/Addis_Ababa', label: '(UTC+03:00) Africa/Addis Ababa' },
    { value: 'Africa/Nairobi', label: '(UTC+03:00) Africa/Nairobi' },
    { value: 'Asia/Amman', label: '(UTC+03:00) Asia/Amman' },
    { value: 'Asia/Baghdad', label: '(UTC+03:00) Asia/Baghdad' },
    { value: 'Asia/Kuwait', label: '(UTC+03:00) Asia/Kuwait' },
    { value: 'Asia/Riyadh', label: '(UTC+03:00) Asia/Riyadh' },
    { value: 'Europe/Istanbul', label: '(UTC+03:00) Europe/Istanbul' },
    { value: 'Europe/Moscow', label: '(UTC+03:00) Europe/Moscow' },
    // UTC+3:30
    { value: 'Asia/Tehran', label: '(UTC+03:30) Asia/Tehran' },
    // UTC+4
    { value: 'Asia/Baku', label: '(UTC+04:00) Asia/Baku' },
    { value: 'Asia/Dubai', label: '(UTC+04:00) Asia/Dubai' },
    { value: 'Asia/Muscat', label: '(UTC+04:00) Asia/Muscat' },
    // UTC+5
    { value: 'Asia/Karachi', label: '(UTC+05:00) Asia/Karachi' },
    // UTC+5:30
    { value: 'Asia/Kolkata', label: '(UTC+05:30) Asia/Kolkata' },
    // UTC+5:45
    { value: 'Asia/Kathmandu', label: '(UTC+05:45) Asia/Kathmandu' },
    // UTC+6
    { value: 'Asia/Almaty', label: '(UTC+06:00) Asia/Almaty' },
    { value: 'Asia/Dhaka', label: '(UTC+06:00) Asia/Dhaka' },
    // UTC+7
    { value: 'Asia/Bangkok', label: '(UTC+07:00) Asia/Bangkok' },
    { value: 'Asia/Ho_Chi_Minh', label: '(UTC+07:00) Asia/Ho Chi Minh' },
    { value: 'Asia/Jakarta', label: '(UTC+07:00) Asia/Jakarta' },
    // UTC+8
    { value: 'Asia/Hong_Kong', label: '(UTC+08:00) Asia/Hong Kong' },
    { value: 'Asia/Kuala_Lumpur', label: '(UTC+08:00) Asia/Kuala Lumpur' },
    { value: 'Asia/Manila', label: '(UTC+08:00) Asia/Manila' },
    { value: 'Asia/Shanghai', label: '(UTC+08:00) Asia/Shanghai' },
    { value: 'Asia/Singapore', label: '(UTC+08:00) Asia/Singapore' },
    { value: 'Asia/Taipei', label: '(UTC+08:00) Asia/Taipei' },
    { value: 'Australia/Perth', label: '(UTC+08:00) Australia/Perth' },
    // UTC+9
    { value: 'Asia/Seoul', label: '(UTC+09:00) Asia/Seoul' },
    { value: 'Asia/Tokyo', label: '(UTC+09:00) Asia/Tokyo' },
    // UTC+9:30
    { value: 'Australia/Adelaide', label: '(UTC+09:30) Australia/Adelaide' },
    { value: 'Australia/Darwin', label: '(UTC+09:30) Australia/Darwin' },
    // UTC+10
    { value: 'Australia/Brisbane', label: '(UTC+10:00) Australia/Brisbane' },
    { value: 'Australia/Melbourne', label: '(UTC+10:00) Australia/Melbourne' },
    { value: 'Australia/Sydney', label: '(UTC+10:00) Australia/Sydney' },
    { value: 'Pacific/Guam', label: '(UTC+10:00) Pacific/Guam' },
    // UTC+12
    { value: 'Pacific/Auckland', label: '(UTC+12:00) Pacific/Auckland' },
    { value: 'Pacific/Fiji', label: '(UTC+12:00) Pacific/Fiji' },
  ];

  return c.json({ timezones });
});

/**
 * GET /api/v1/settings/hotel/currencies
 * Get list of currencies for dropdown
 */
hotelProfileRoutes.get('/currencies', (c) => {
  const currencies = [
    // Major currencies
    { value: 'USD', label: 'USD - US Dollar', symbol: '$' },
    { value: 'EUR', label: 'EUR - Euro', symbol: '€' },
    { value: 'GBP', label: 'GBP - British Pound', symbol: '£' },
    { value: 'JPY', label: 'JPY - Japanese Yen', symbol: '¥' },
    { value: 'CHF', label: 'CHF - Swiss Franc', symbol: 'CHF' },
    { value: 'CNY', label: 'CNY - Chinese Yuan', symbol: '¥' },
    // Americas
    { value: 'ARS', label: 'ARS - Argentine Peso', symbol: '$' },
    { value: 'BRL', label: 'BRL - Brazilian Real', symbol: 'R$' },
    { value: 'CAD', label: 'CAD - Canadian Dollar', symbol: 'C$' },
    { value: 'CLP', label: 'CLP - Chilean Peso', symbol: '$' },
    { value: 'COP', label: 'COP - Colombian Peso', symbol: '$' },
    { value: 'MXN', label: 'MXN - Mexican Peso', symbol: '$' },
    { value: 'PEN', label: 'PEN - Peruvian Sol', symbol: 'S/' },
    // Europe
    { value: 'CZK', label: 'CZK - Czech Koruna', symbol: 'Kč' },
    { value: 'DKK', label: 'DKK - Danish Krone', symbol: 'kr' },
    { value: 'HUF', label: 'HUF - Hungarian Forint', symbol: 'Ft' },
    { value: 'NOK', label: 'NOK - Norwegian Krone', symbol: 'kr' },
    { value: 'PLN', label: 'PLN - Polish Zloty', symbol: 'zł' },
    { value: 'RON', label: 'RON - Romanian Leu', symbol: 'lei' },
    { value: 'RUB', label: 'RUB - Russian Ruble', symbol: '₽' },
    { value: 'SEK', label: 'SEK - Swedish Krona', symbol: 'kr' },
    { value: 'TRY', label: 'TRY - Turkish Lira', symbol: '₺' },
    { value: 'UAH', label: 'UAH - Ukrainian Hryvnia', symbol: '₴' },
    // Asia Pacific
    { value: 'AUD', label: 'AUD - Australian Dollar', symbol: 'A$' },
    { value: 'BDT', label: 'BDT - Bangladeshi Taka', symbol: '৳' },
    { value: 'HKD', label: 'HKD - Hong Kong Dollar', symbol: 'HK$' },
    { value: 'IDR', label: 'IDR - Indonesian Rupiah', symbol: 'Rp' },
    { value: 'INR', label: 'INR - Indian Rupee', symbol: '₹' },
    { value: 'KRW', label: 'KRW - South Korean Won', symbol: '₩' },
    { value: 'LKR', label: 'LKR - Sri Lankan Rupee', symbol: 'Rs' },
    { value: 'MYR', label: 'MYR - Malaysian Ringgit', symbol: 'RM' },
    { value: 'NPR', label: 'NPR - Nepalese Rupee', symbol: 'Rs' },
    { value: 'NZD', label: 'NZD - New Zealand Dollar', symbol: 'NZ$' },
    { value: 'PHP', label: 'PHP - Philippine Peso', symbol: '₱' },
    { value: 'PKR', label: 'PKR - Pakistani Rupee', symbol: 'Rs' },
    { value: 'SGD', label: 'SGD - Singapore Dollar', symbol: 'S$' },
    { value: 'THB', label: 'THB - Thai Baht', symbol: '฿' },
    { value: 'TWD', label: 'TWD - Taiwan Dollar', symbol: 'NT$' },
    { value: 'VND', label: 'VND - Vietnamese Dong', symbol: '₫' },
    // Middle East & Africa
    { value: 'AED', label: 'AED - UAE Dirham', symbol: 'د.إ' },
    { value: 'BHD', label: 'BHD - Bahraini Dinar', symbol: '.د.ب' },
    { value: 'EGP', label: 'EGP - Egyptian Pound', symbol: 'E£' },
    { value: 'ILS', label: 'ILS - Israeli Shekel', symbol: '₪' },
    { value: 'JOD', label: 'JOD - Jordanian Dinar', symbol: 'JD' },
    { value: 'KES', label: 'KES - Kenyan Shilling', symbol: 'KSh' },
    { value: 'KWD', label: 'KWD - Kuwaiti Dinar', symbol: 'KD' },
    { value: 'MAD', label: 'MAD - Moroccan Dirham', symbol: 'MAD' },
    { value: 'NGN', label: 'NGN - Nigerian Naira', symbol: '₦' },
    { value: 'OMR', label: 'OMR - Omani Rial', symbol: 'ر.ع.' },
    { value: 'QAR', label: 'QAR - Qatari Riyal', symbol: 'QR' },
    { value: 'SAR', label: 'SAR - Saudi Riyal', symbol: 'SR' },
    { value: 'ZAR', label: 'ZAR - South African Rand', symbol: 'R' },
  ];

  return c.json({ currencies });
});

/**
 * GET /api/v1/settings/hotel/countries
 * Get list of countries for dropdown
 */
hotelProfileRoutes.get('/countries', (c) => {
  const countries = [
    { value: 'AF', label: 'Afghanistan' },
    { value: 'AL', label: 'Albania' },
    { value: 'DZ', label: 'Algeria' },
    { value: 'AD', label: 'Andorra' },
    { value: 'AO', label: 'Angola' },
    { value: 'AG', label: 'Antigua and Barbuda' },
    { value: 'AR', label: 'Argentina' },
    { value: 'AM', label: 'Armenia' },
    { value: 'AU', label: 'Australia' },
    { value: 'AT', label: 'Austria' },
    { value: 'AZ', label: 'Azerbaijan' },
    { value: 'BS', label: 'Bahamas' },
    { value: 'BH', label: 'Bahrain' },
    { value: 'BD', label: 'Bangladesh' },
    { value: 'BB', label: 'Barbados' },
    { value: 'BY', label: 'Belarus' },
    { value: 'BE', label: 'Belgium' },
    { value: 'BZ', label: 'Belize' },
    { value: 'BJ', label: 'Benin' },
    { value: 'BT', label: 'Bhutan' },
    { value: 'BO', label: 'Bolivia' },
    { value: 'BA', label: 'Bosnia and Herzegovina' },
    { value: 'BW', label: 'Botswana' },
    { value: 'BR', label: 'Brazil' },
    { value: 'BN', label: 'Brunei' },
    { value: 'BG', label: 'Bulgaria' },
    { value: 'BF', label: 'Burkina Faso' },
    { value: 'BI', label: 'Burundi' },
    { value: 'KH', label: 'Cambodia' },
    { value: 'CM', label: 'Cameroon' },
    { value: 'CA', label: 'Canada' },
    { value: 'CV', label: 'Cape Verde' },
    { value: 'CF', label: 'Central African Republic' },
    { value: 'TD', label: 'Chad' },
    { value: 'CL', label: 'Chile' },
    { value: 'CN', label: 'China' },
    { value: 'CO', label: 'Colombia' },
    { value: 'KM', label: 'Comoros' },
    { value: 'CG', label: 'Congo' },
    { value: 'CD', label: 'Congo (DRC)' },
    { value: 'CR', label: 'Costa Rica' },
    { value: 'HR', label: 'Croatia' },
    { value: 'CU', label: 'Cuba' },
    { value: 'CY', label: 'Cyprus' },
    { value: 'CZ', label: 'Czech Republic' },
    { value: 'DK', label: 'Denmark' },
    { value: 'DJ', label: 'Djibouti' },
    { value: 'DM', label: 'Dominica' },
    { value: 'DO', label: 'Dominican Republic' },
    { value: 'EC', label: 'Ecuador' },
    { value: 'EG', label: 'Egypt' },
    { value: 'SV', label: 'El Salvador' },
    { value: 'GQ', label: 'Equatorial Guinea' },
    { value: 'ER', label: 'Eritrea' },
    { value: 'EE', label: 'Estonia' },
    { value: 'SZ', label: 'Eswatini' },
    { value: 'ET', label: 'Ethiopia' },
    { value: 'FJ', label: 'Fiji' },
    { value: 'FI', label: 'Finland' },
    { value: 'FR', label: 'France' },
    { value: 'GA', label: 'Gabon' },
    { value: 'GM', label: 'Gambia' },
    { value: 'GE', label: 'Georgia' },
    { value: 'DE', label: 'Germany' },
    { value: 'GH', label: 'Ghana' },
    { value: 'GR', label: 'Greece' },
    { value: 'GD', label: 'Grenada' },
    { value: 'GT', label: 'Guatemala' },
    { value: 'GN', label: 'Guinea' },
    { value: 'GW', label: 'Guinea-Bissau' },
    { value: 'GY', label: 'Guyana' },
    { value: 'HT', label: 'Haiti' },
    { value: 'HN', label: 'Honduras' },
    { value: 'HK', label: 'Hong Kong' },
    { value: 'HU', label: 'Hungary' },
    { value: 'IS', label: 'Iceland' },
    { value: 'IN', label: 'India' },
    { value: 'ID', label: 'Indonesia' },
    { value: 'IR', label: 'Iran' },
    { value: 'IQ', label: 'Iraq' },
    { value: 'IE', label: 'Ireland' },
    { value: 'IL', label: 'Israel' },
    { value: 'IT', label: 'Italy' },
    { value: 'CI', label: 'Ivory Coast' },
    { value: 'JM', label: 'Jamaica' },
    { value: 'JP', label: 'Japan' },
    { value: 'JO', label: 'Jordan' },
    { value: 'KZ', label: 'Kazakhstan' },
    { value: 'KE', label: 'Kenya' },
    { value: 'KI', label: 'Kiribati' },
    { value: 'KP', label: 'Korea (North)' },
    { value: 'KR', label: 'Korea (South)' },
    { value: 'KW', label: 'Kuwait' },
    { value: 'KG', label: 'Kyrgyzstan' },
    { value: 'LA', label: 'Laos' },
    { value: 'LV', label: 'Latvia' },
    { value: 'LB', label: 'Lebanon' },
    { value: 'LS', label: 'Lesotho' },
    { value: 'LR', label: 'Liberia' },
    { value: 'LY', label: 'Libya' },
    { value: 'LI', label: 'Liechtenstein' },
    { value: 'LT', label: 'Lithuania' },
    { value: 'LU', label: 'Luxembourg' },
    { value: 'MO', label: 'Macau' },
    { value: 'MG', label: 'Madagascar' },
    { value: 'MW', label: 'Malawi' },
    { value: 'MY', label: 'Malaysia' },
    { value: 'MV', label: 'Maldives' },
    { value: 'ML', label: 'Mali' },
    { value: 'MT', label: 'Malta' },
    { value: 'MH', label: 'Marshall Islands' },
    { value: 'MR', label: 'Mauritania' },
    { value: 'MU', label: 'Mauritius' },
    { value: 'MX', label: 'Mexico' },
    { value: 'FM', label: 'Micronesia' },
    { value: 'MD', label: 'Moldova' },
    { value: 'MC', label: 'Monaco' },
    { value: 'MN', label: 'Mongolia' },
    { value: 'ME', label: 'Montenegro' },
    { value: 'MA', label: 'Morocco' },
    { value: 'MZ', label: 'Mozambique' },
    { value: 'MM', label: 'Myanmar' },
    { value: 'NA', label: 'Namibia' },
    { value: 'NR', label: 'Nauru' },
    { value: 'NP', label: 'Nepal' },
    { value: 'NL', label: 'Netherlands' },
    { value: 'NZ', label: 'New Zealand' },
    { value: 'NI', label: 'Nicaragua' },
    { value: 'NE', label: 'Niger' },
    { value: 'NG', label: 'Nigeria' },
    { value: 'MK', label: 'North Macedonia' },
    { value: 'NO', label: 'Norway' },
    { value: 'OM', label: 'Oman' },
    { value: 'PK', label: 'Pakistan' },
    { value: 'PW', label: 'Palau' },
    { value: 'PS', label: 'Palestine' },
    { value: 'PA', label: 'Panama' },
    { value: 'PG', label: 'Papua New Guinea' },
    { value: 'PY', label: 'Paraguay' },
    { value: 'PE', label: 'Peru' },
    { value: 'PH', label: 'Philippines' },
    { value: 'PL', label: 'Poland' },
    { value: 'PT', label: 'Portugal' },
    { value: 'PR', label: 'Puerto Rico' },
    { value: 'QA', label: 'Qatar' },
    { value: 'RO', label: 'Romania' },
    { value: 'RU', label: 'Russia' },
    { value: 'RW', label: 'Rwanda' },
    { value: 'KN', label: 'Saint Kitts and Nevis' },
    { value: 'LC', label: 'Saint Lucia' },
    { value: 'VC', label: 'Saint Vincent and the Grenadines' },
    { value: 'WS', label: 'Samoa' },
    { value: 'SM', label: 'San Marino' },
    { value: 'ST', label: 'Sao Tome and Principe' },
    { value: 'SA', label: 'Saudi Arabia' },
    { value: 'SN', label: 'Senegal' },
    { value: 'RS', label: 'Serbia' },
    { value: 'SC', label: 'Seychelles' },
    { value: 'SL', label: 'Sierra Leone' },
    { value: 'SG', label: 'Singapore' },
    { value: 'SK', label: 'Slovakia' },
    { value: 'SI', label: 'Slovenia' },
    { value: 'SB', label: 'Solomon Islands' },
    { value: 'SO', label: 'Somalia' },
    { value: 'ZA', label: 'South Africa' },
    { value: 'SS', label: 'South Sudan' },
    { value: 'ES', label: 'Spain' },
    { value: 'LK', label: 'Sri Lanka' },
    { value: 'SD', label: 'Sudan' },
    { value: 'SR', label: 'Suriname' },
    { value: 'SE', label: 'Sweden' },
    { value: 'CH', label: 'Switzerland' },
    { value: 'SY', label: 'Syria' },
    { value: 'TW', label: 'Taiwan' },
    { value: 'TJ', label: 'Tajikistan' },
    { value: 'TZ', label: 'Tanzania' },
    { value: 'TH', label: 'Thailand' },
    { value: 'TL', label: 'Timor-Leste' },
    { value: 'TG', label: 'Togo' },
    { value: 'TO', label: 'Tonga' },
    { value: 'TT', label: 'Trinidad and Tobago' },
    { value: 'TN', label: 'Tunisia' },
    { value: 'TR', label: 'Turkey' },
    { value: 'TM', label: 'Turkmenistan' },
    { value: 'TV', label: 'Tuvalu' },
    { value: 'UG', label: 'Uganda' },
    { value: 'UA', label: 'Ukraine' },
    { value: 'AE', label: 'United Arab Emirates' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'US', label: 'United States' },
    { value: 'UY', label: 'Uruguay' },
    { value: 'UZ', label: 'Uzbekistan' },
    { value: 'VU', label: 'Vanuatu' },
    { value: 'VA', label: 'Vatican City' },
    { value: 'VE', label: 'Venezuela' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'YE', label: 'Yemen' },
    { value: 'ZM', label: 'Zambia' },
    { value: 'ZW', label: 'Zimbabwe' },
  ];

  return c.json({ countries });
});

export { hotelProfileRoutes };
