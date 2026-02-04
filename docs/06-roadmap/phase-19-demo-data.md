# Phase 19: Demo Data & Database Reset

**Focus:** Allow users to load sample data for testing and reset the database for production use
**Risk:** Low
**Depends on:** Phase 18 (i18n complete)
**Status:** PLANNED

---

## Problem Statement

1. **New users have empty system** - Hard to explore features without data
2. **No way to reset** - Once testing is done, users can't clean up for real use
3. **Manual data entry is tedious** - Users need realistic data to evaluate the system

---

## Solution Overview

1. **Demo data seed** - Realistic hotel data (guests, reservations, knowledge base)
2. **Load demo data API** - One-click to populate the system
3. **Reset database API** - Full wipe with confirmation
4. **Dashboard integration** - UI for both actions

---

## Scope

### Demo Data Content

| Table | Count | Description |
|-------|-------|-------------|
| `guests` | 10 | Mix of VIP/regular, varied nationalities, some with email/phone |
| `reservations` | 20 | Past, current, future stays linked to guests |
| `knowledgeBase` | 100 | FAQs, policies, amenities, services, local info |

### Knowledge Base Categories (100 entries)

- Check-in/check-out times and policies (~5)
- Room types and amenities (~10)
- Restaurant info, hours, menus (~8)
- Spa and wellness services (~6)
- Pool and gym facilities (~4)
- WiFi and business center (~4)
- Parking and transportation (~6)
- Room service menu and hours (~8)
- Housekeeping policies (~4)
- Pet and smoking policies (~4)
- Cancellation and payment policies (~6)
- Concierge services (~5)
- Laundry and dry cleaning (~3)
- Safety and security info (~4)
- Accessibility features (~4)
- Local attractions and activities (~10)
- Nearby restaurants and dining (~5)
- Weather and best times to visit (~2)
- Hotel history and awards (~2)

---

## Implementation Plan

### Step 1: Demo Data Seed File

**Create:** `src/db/seeds/demo-data.ts`

```typescript
// Structure
export const demoGuests: NewGuest[] = [...]; // 10 guests
export const demoReservations: NewReservation[] = [...]; // 20 reservations
export const demoKnowledgeBase: NewKnowledgeItem[] = [...]; // 100 entries

export async function seedDemoData(db: Database): Promise<{
  guests: number;
  reservations: number;
  knowledgeBase: number;
}>;
```

**Requirements:**
- Realistic names, emails, phone numbers
- Mix of guest profiles (VIP, loyalty tiers, languages)
- Reservations with various statuses and date ranges
- Knowledge base covering common hotel questions

---

### Step 2: Load Demo Data API

**Endpoint:** `POST /api/seed/demo`

**Response:**
```json
{
  "success": true,
  "created": {
    "guests": 10,
    "reservations": 20,
    "knowledgeBase": 100
  }
}
```

**Logic:**
1. Check if data already exists (optional: warn or skip)
2. Insert demo guests
3. Insert demo reservations (linked to guests)
4. Insert demo knowledge base entries
5. Return counts

---

### Step 3: Reset Database API

**Endpoint:** `POST /api/settings/reset-database`

**Request:**
```json
{
  "confirm": "RESET"
}
```

**Response:**
```json
{
  "success": true,
  "tablesCleared": ["guests", "reservations", ...]
}
```

**Logic:**
1. Validate `confirm === "RESET"` (reject otherwise)
2. Query all table names dynamically:
   ```sql
   SELECT name FROM sqlite_master
   WHERE type='table'
   AND name NOT LIKE 'sqlite_%'
   AND name NOT LIKE '__drizzle%'
   ```
3. Disable foreign key checks temporarily
4. Delete all records from each table
5. Re-enable foreign key checks
6. Return list of cleared tables

---

### Step 4: Dashboard - Wire Demo Data Button

**File:** `src/components/shared/DemoDataCard.tsx`

**Changes:**
- Import `useMutation` from `@tanstack/react-query`
- Call `POST /api/seed/demo` on button click
- Show loading state on button
- Show success/error toast
- Optionally hide card after success

---

### Step 5: Dashboard - Danger Zone in Settings

**File:** `src/pages/settings/Settings.tsx` (or new section)

**UI:**
- Red-bordered "Danger Zone" section at bottom
- "Reset Database" button (destructive variant)
- Warning text explaining the action

**Confirmation Dialog:**
- Title: "Reset Database"
- Description: "This will permanently delete all data including guests, reservations, conversations, settings, and configurations. This action cannot be undone."
- Input field requiring user to type "RESET"
- Confirm button disabled until input matches

**Translations needed:**
- `settings.dangerZone.title`
- `settings.dangerZone.resetDatabase`
- `settings.dangerZone.resetDescription`
- `settings.dangerZone.resetConfirmTitle`
- `settings.dangerZone.resetConfirmDescription`
- `settings.dangerZone.typeToConfirm`
- `settings.dangerZone.resetButton`

---

## File Changes Summary

### New Files
```
src/db/seeds/demo-data.ts          # Demo data definitions
src/gateway/routes/seed.ts         # Seed API routes
```

### Modified Files
```
src/gateway/routes/settings.ts     # Add reset-database endpoint
src/gateway/index.ts               # Register seed routes
apps/dashboard/src/components/shared/DemoDataCard.tsx  # Wire to API
apps/dashboard/src/pages/settings/Settings.tsx         # Add Danger Zone
apps/dashboard/src/locales/*/common.json               # Translations
```

---

## Acceptance Criteria

- [ ] `POST /api/seed/demo` creates 10 guests, 20 reservations, 100 KB entries
- [ ] Demo data is realistic and covers common hotel scenarios
- [ ] `POST /api/settings/reset-database` requires `confirm: "RESET"`
- [ ] Reset clears all tables dynamically (works with future schema changes)
- [ ] "Load Sample Data" button works and shows feedback
- [ ] Danger Zone section appears in Settings
- [ ] Reset requires typing "RESET" to confirm
- [ ] All UI text is translated (6 languages)

---

## Estimated Effort

| Step | Hours | Notes |
|------|-------|-------|
| Step 1: Demo data seed file | 4-6h | Writing 100 realistic KB entries |
| Step 2: Load demo data API | 1h | Simple insert logic |
| Step 3: Reset database API | 1-2h | Dynamic table clearing |
| Step 4: Wire demo data button | 1h | API call + feedback |
| Step 5: Danger Zone UI | 2-3h | Section + confirmation dialog + translations |
| **Total** | **9-13h** | ~1.5-2 days |

---

## Security Considerations

- Reset endpoint requires explicit confirmation
- Could add rate limiting to prevent abuse
- Consider requiring admin role for reset (future)
- Audit log entry before reset (if audit log not cleared first)

---

## Related

- [Phase 18: i18n](phase-18-i18n.md)
- [Database Schema](../../src/db/schema.ts)
