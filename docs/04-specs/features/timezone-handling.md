# Timezone Handling Specification

This document defines how Jack The Butler handles timezones for guests, staff, and scheduled operations.

---

## Overview

Hospitality operates across timezones - guests travel, staff work shifts, and notifications must arrive at appropriate times. Jack handles timezones consistently to ensure:

- Proactive notifications arrive at reasonable hours
- Staff schedules display correctly
- Audit logs use consistent timestamps
- Guest-facing times show in their local timezone

---

## Core Principles

1. **Store in UTC** - All timestamps in database are UTC
2. **Display in Local** - Convert to user's timezone for display
3. **Explicit Timezone** - Never assume timezone; always know the source
4. **Property Default** - Use property timezone when guest timezone unknown

---

## Timezone Sources

### Priority Order

When determining which timezone to use for a guest:

```typescript
type TimezoneSource =
  | 'explicit'      // Guest explicitly set timezone
  | 'reservation'   // From PMS reservation data
  | 'phone'         // Derived from phone number
  | 'ip'            // Derived from IP geolocation
  | 'property';     // Fallback to property timezone

function getGuestTimezone(guest: Guest, property: Property): TimezoneResult {
  // 1. Explicit setting (highest priority)
  if (guest.preferences?.timezone) {
    return {
      timezone: guest.preferences.timezone,
      source: 'explicit',
      confidence: 1.0,
    };
  }

  // 2. Reservation data (home address country)
  if (guest.reservation?.homeCountry) {
    const tz = getTimezoneFromCountry(guest.reservation.homeCountry);
    if (tz) {
      return {
        timezone: tz,
        source: 'reservation',
        confidence: 0.8,
      };
    }
  }

  // 3. Phone number area code
  if (guest.phone) {
    const tz = getTimezoneFromPhone(guest.phone);
    if (tz) {
      return {
        timezone: tz,
        source: 'phone',
        confidence: 0.7,
      };
    }
  }

  // 4. IP geolocation (for web chat)
  if (guest.lastKnownIp) {
    const tz = getTimezoneFromIp(guest.lastKnownIp);
    if (tz) {
      return {
        timezone: tz,
        source: 'ip',
        confidence: 0.5,
      };
    }
  }

  // 5. Property timezone (fallback)
  return {
    timezone: property.timezone,
    source: 'property',
    confidence: 0.3,
  };
}

interface TimezoneResult {
  timezone: string;           // IANA timezone (e.g., "America/New_York")
  source: TimezoneSource;
  confidence: number;         // 0.0 to 1.0
}
```

---

## Phone Number Timezone Detection

### Implementation

Using `libphonenumber-js` for phone parsing:

```typescript
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

// Country to primary timezone mapping
const COUNTRY_TIMEZONES: Record<string, string> = {
  US: 'America/New_York',     // Default to Eastern
  CA: 'America/Toronto',
  GB: 'Europe/London',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  JP: 'Asia/Tokyo',
  AU: 'Australia/Sydney',
  // ... more countries
};

// US area code to timezone (for more accuracy)
const US_AREA_CODE_TIMEZONES: Record<string, string> = {
  // Eastern
  '212': 'America/New_York',
  '718': 'America/New_York',
  '617': 'America/New_York',
  '305': 'America/New_York',
  // Central
  '312': 'America/Chicago',
  '214': 'America/Chicago',
  '713': 'America/Chicago',
  // Mountain
  '303': 'America/Denver',
  '602': 'America/Phoenix',
  // Pacific
  '213': 'America/Los_Angeles',
  '415': 'America/Los_Angeles',
  '206': 'America/Los_Angeles',
  // Hawaii
  '808': 'Pacific/Honolulu',
  // Alaska
  '907': 'America/Anchorage',
  // ... more area codes
};

function getTimezoneFromPhone(phone: string): string | null {
  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed || !parsed.country) {
      return null;
    }

    const country = parsed.country as CountryCode;

    // For US numbers, try area code first
    if (country === 'US' && parsed.nationalNumber) {
      const areaCode = parsed.nationalNumber.slice(0, 3);
      if (US_AREA_CODE_TIMEZONES[areaCode]) {
        return US_AREA_CODE_TIMEZONES[areaCode];
      }
    }

    // Fall back to country default
    return COUNTRY_TIMEZONES[country] || null;
  } catch {
    return null;
  }
}
```

### Limitations

- Area codes can be ported across regions
- VoIP numbers may not reflect actual location
- Country-level timezone is a guess for large countries

---

## Property Timezone Configuration

```typescript
interface PropertyTimezone {
  // Primary timezone for property
  timezone: string;              // IANA timezone (e.g., "America/New_York")

  // Operating hours in local time
  operatingHours: {
    start: string;               // "06:00" (24-hour)
    end: string;                 // "23:00"
  };

  // Quiet hours (no proactive notifications)
  quietHours: {
    start: string;               // "22:00"
    end: string;                 // "07:00"
  };
}

// Configuration example
const property: PropertyTimezone = {
  timezone: 'America/New_York',
  operatingHours: {
    start: '06:00',
    end: '23:00',
  },
  quietHours: {
    start: '22:00',
    end: '07:00',
  },
};
```

---

## Daylight Saving Time Handling

### Use IANA Timezone Names

Always use IANA timezone names, never UTC offsets:

```typescript
// Good - handles DST automatically
const tz = 'America/New_York';

// Bad - doesn't handle DST
const offset = '-05:00'; // Wrong half the year!
```

### DST Transition Handling

```typescript
import { DateTime } from 'luxon';

function scheduleNotification(
  targetTime: string,        // "09:00" local time
  targetDate: string,        // "2024-03-10" (DST transition day)
  timezone: string
): Date {
  // Luxon handles DST transitions correctly
  const dt = DateTime.fromISO(`${targetDate}T${targetTime}`, {
    zone: timezone,
  });

  // Check if time is valid (doesn't exist during spring forward)
  if (!dt.isValid) {
    // Skip to next valid time
    return dt.plus({ hours: 1 }).toJSDate();
  }

  // Check if time is ambiguous (fall back has two 2:00 AMs)
  // Luxon uses the first occurrence by default
  return dt.toJSDate();
}
```

### Recurring Events Across DST

```typescript
// For daily notifications, always schedule in local time
function scheduleDaily(
  localTime: string,         // "09:00"
  timezone: string,
  startDate: Date
): ScheduledJob[] {
  const jobs: ScheduledJob[] = [];
  let current = DateTime.fromJSDate(startDate, { zone: timezone });

  for (let i = 0; i < 30; i++) {
    const scheduled = current.set({
      hour: parseInt(localTime.split(':')[0]),
      minute: parseInt(localTime.split(':')[1]),
    });

    jobs.push({
      scheduledAt: scheduled.toUTC().toJSDate(), // Store as UTC
      localTime: scheduled.toISO(),              // For display
    });

    current = current.plus({ days: 1 });
  }

  return jobs;
}
```

---

## Notification Timing

### Quiet Hours Check

```typescript
function isQuietHours(
  guestTimezone: string,
  propertyConfig: PropertyTimezone
): boolean {
  const now = DateTime.now().setZone(guestTimezone);
  const currentTime = now.toFormat('HH:mm');

  const { start, end } = propertyConfig.quietHours;

  // Handle overnight quiet hours (22:00 - 07:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  return currentTime >= start && currentTime < end;
}

async function sendProactiveNotification(
  guest: Guest,
  notification: Notification
): Promise<SendResult> {
  const tzResult = getGuestTimezone(guest, property);

  // Check quiet hours
  if (isQuietHours(tzResult.timezone, property)) {
    // Schedule for next morning instead
    const nextMorning = getNextAvailableTime(
      tzResult.timezone,
      property.quietHours.end
    );

    return scheduleNotification(notification, nextMorning);
  }

  // Send immediately
  return sendNotification(notification);
}
```

### Appropriate Send Times

```typescript
interface NotificationTiming {
  type: string;
  preferredHours: { start: string; end: string };
  urgency: 'immediate' | 'standard' | 'low';
}

const NOTIFICATION_TIMING: Record<string, NotificationTiming> = {
  'check_in_reminder': {
    type: 'check_in_reminder',
    preferredHours: { start: '08:00', end: '18:00' },
    urgency: 'standard',
  },
  'checkout_reminder': {
    type: 'checkout_reminder',
    preferredHours: { start: '07:00', end: '10:00' },
    urgency: 'standard',
  },
  'service_request_update': {
    type: 'service_request_update',
    preferredHours: { start: '08:00', end: '21:00' },
    urgency: 'standard',
  },
  'emergency_alert': {
    type: 'emergency_alert',
    preferredHours: { start: '00:00', end: '23:59' },
    urgency: 'immediate', // Always send immediately
  },
};

function getBestSendTime(
  notificationType: string,
  guestTimezone: string
): Date {
  const timing = NOTIFICATION_TIMING[notificationType];
  const now = DateTime.now().setZone(guestTimezone);
  const currentTime = now.toFormat('HH:mm');

  // Immediate notifications ignore timing
  if (timing.urgency === 'immediate') {
    return now.toJSDate();
  }

  const { start, end } = timing.preferredHours;

  // If within preferred hours, send now
  if (currentTime >= start && currentTime <= end) {
    return now.toJSDate();
  }

  // If before preferred hours, schedule for start
  if (currentTime < start) {
    return now.set({
      hour: parseInt(start.split(':')[0]),
      minute: parseInt(start.split(':')[1]),
    }).toJSDate();
  }

  // If after preferred hours, schedule for tomorrow
  return now.plus({ days: 1 }).set({
    hour: parseInt(start.split(':')[0]),
    minute: parseInt(start.split(':')[1]),
  }).toJSDate();
}
```

---

## Display Formatting

### Format for Display

```typescript
import { DateTime } from 'luxon';

interface FormatOptions {
  timezone: string;
  locale?: string;
  format?: 'short' | 'medium' | 'long' | 'relative';
}

function formatDateTime(
  utcDate: Date,
  options: FormatOptions
): string {
  const dt = DateTime.fromJSDate(utcDate).setZone(options.timezone);
  const locale = options.locale || 'en-US';

  switch (options.format) {
    case 'short':
      // "3:30 PM"
      return dt.toLocaleString(DateTime.TIME_SIMPLE, { locale });

    case 'medium':
      // "Jan 15, 3:30 PM"
      return dt.toLocaleString(DateTime.DATETIME_MED, { locale });

    case 'long':
      // "January 15, 2024, 3:30 PM EST"
      return dt.toLocaleString(DateTime.DATETIME_FULL, { locale });

    case 'relative':
      // "2 hours ago", "in 30 minutes"
      return dt.toRelative({ locale }) || dt.toLocaleString();

    default:
      return dt.toLocaleString(DateTime.DATETIME_MED, { locale });
  }
}

// Usage
const display = formatDateTime(message.createdAt, {
  timezone: guest.timezone || property.timezone,
  locale: guest.language || 'en-US',
  format: 'relative',
});
// Output: "2 hours ago"
```

### Include Timezone in Guest Communication

```typescript
function formatForGuest(
  utcDate: Date,
  guestTimezone: string,
  includeTimezone: boolean = true
): string {
  const dt = DateTime.fromJSDate(utcDate).setZone(guestTimezone);

  if (includeTimezone) {
    // "3:30 PM (Eastern Time)"
    const time = dt.toLocaleString(DateTime.TIME_SIMPLE);
    const tzAbbrev = dt.toFormat('ZZZZ'); // "Eastern Daylight Time"
    return `${time} (${tzAbbrev})`;
  }

  return dt.toLocaleString(DateTime.TIME_SIMPLE);
}
```

---

## API Response Format

### Always Include Timezone Context

```typescript
interface TimestampResponse {
  utc: string;                    // ISO 8601 in UTC
  local?: string;                 // ISO 8601 in request timezone
  timezone?: string;              // IANA timezone used
}

// API response example
{
  "message": {
    "id": "msg_123",
    "content": "Your room is ready",
    "createdAt": {
      "utc": "2024-01-15T20:30:00Z",
      "local": "2024-01-15T15:30:00-05:00",
      "timezone": "America/New_York"
    }
  }
}
```

### Request Timezone Header

Clients can specify desired timezone for response formatting:

```http
GET /api/v1/conversations/123/messages
X-Timezone: America/Los_Angeles
```

---

## Staff Dashboard

### Display Times

```typescript
function getStaffDisplayTimezone(staff: Staff, property: Property): string {
  // Staff can override to their local timezone
  if (staff.preferences?.timezone) {
    return staff.preferences.timezone;
  }

  // Default to property timezone
  return property.timezone;
}

// Dashboard shows times in staff's timezone
const displayTime = formatDateTime(task.createdAt, {
  timezone: getStaffDisplayTimezone(staff, property),
  format: 'medium',
});
```

### Schedule Display

```typescript
// Staff schedule always in property timezone
function formatSchedule(shift: DailyShift, property: Property): string {
  return `${shift.startTime} - ${shift.endTime} (${property.timezone})`;
}
```

---

## Database Storage

### All Timestamps in UTC

```sql
-- SQLite stores as ISO string
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),  -- UTC
  sent_at TEXT,                                -- UTC
  delivered_at TEXT                            -- UTC
);

-- Query with timezone conversion in application layer
SELECT * FROM messages WHERE conversation_id = ?;
-- Convert created_at to local time in TypeScript
```

### Store Timezone Separately

```sql
CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  timezone TEXT,                    -- IANA timezone
  timezone_source TEXT,             -- How we determined it
  timezone_confidence REAL          -- Confidence score
);
```

---

## Configuration

```yaml
timezone:
  # Default timezone when nothing else available
  default: "UTC"

  # Library for timezone operations
  library: "luxon"                  # or "date-fns-tz"

  # Phone number parsing
  phoneParser:
    library: "libphonenumber-js"
    enableAreaCodeLookup: true

  # IP geolocation (optional)
  ipGeolocation:
    enabled: false
    provider: "maxmind"
    databasePath: "./data/GeoLite2-City.mmdb"

  # Display formats
  formats:
    short: "h:mm a"
    medium: "MMM d, h:mm a"
    long: "MMMM d, yyyy, h:mm a z"

  # Quiet hours (property can override)
  defaultQuietHours:
    start: "22:00"
    end: "07:00"
```

---

## Testing

### Mock Timezone

```typescript
import { Settings } from 'luxon';

describe('Timezone handling', () => {
  beforeEach(() => {
    // Set system timezone for tests
    Settings.defaultZone = 'America/New_York';
  });

  afterEach(() => {
    Settings.defaultZone = 'system';
  });

  it('should detect timezone from phone', () => {
    const tz = getTimezoneFromPhone('+1-213-555-0100');
    expect(tz).toBe('America/Los_Angeles');
  });

  it('should respect quiet hours', () => {
    // Mock current time to 11 PM
    jest.useFakeTimers().setSystemTime(
      new Date('2024-01-15T23:00:00-05:00')
    );

    const isQuiet = isQuietHours('America/New_York', property);
    expect(isQuiet).toBe(true);
  });
});
```

---

## Related

- [Staff Workload](staff-workload.md) - Staff schedules
- [Job Scheduler](../../03-architecture/decisions/005-job-scheduler.md) - Scheduled tasks
- [Automation](../../02-use-cases/operations/automation.md) - Proactive notifications
