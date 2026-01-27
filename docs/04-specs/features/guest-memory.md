# Specification: Guest Memory

Guest profile and preference management system.

---

## Overview

Guest Memory is the system that maintains persistent knowledge about guests across interactions and stays. It enables personalized service by remembering preferences, history, and context.

---

## Data Model

### Guest Profile

```typescript
interface GuestProfile {
  // Identity
  id: string;
  propertyId: string;
  externalIds: {
    pms?: string;
    loyalty?: string;
    [key: string]: string | undefined;
  };

  // Contact
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;

  // Demographics
  language: string;
  locale?: string;
  timezone?: string;

  // Status
  loyaltyTier?: string;
  vipStatus?: string;
  tags: string[];

  // Preferences
  preferences: Preference[];

  // History
  stayCount: number;
  totalRevenue: number;
  lastStayDate?: Date;
  firstStayDate?: Date;

  // Notes
  notes?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastInteractionAt?: Date;
}
```

### Preference

```typescript
interface Preference {
  id: string;
  category: PreferenceCategory;
  key: string;
  value: string;
  source: PreferenceSource;
  confidence: number;     // 0.0 - 1.0
  learnedFrom?: string;   // Conversation ID if learned
  expiresAt?: Date;       // For temporary preferences
  createdAt: Date;
  updatedAt: Date;
}

type PreferenceCategory =
  | 'room'           // Room preferences
  | 'dining'         // Food and beverage
  | 'communication'  // How they prefer to be contacted
  | 'amenity'        // Amenity preferences
  | 'service'        // Service preferences
  | 'accessibility'; // Accessibility needs

type PreferenceSource =
  | 'pms'            // Synced from PMS
  | 'stated'         // Guest explicitly stated
  | 'learned'        // Inferred from conversation
  | 'staff';         // Staff observation
```

### Common Preferences

| Category | Key | Example Values |
|----------|-----|----------------|
| `room` | `floor` | `high`, `low`, `middle` |
| `room` | `bed_type` | `king`, `queen`, `twin` |
| `room` | `pillow` | `firm`, `soft`, `feather` |
| `room` | `temperature` | `cool`, `warm`, `68F` |
| `room` | `view` | `ocean`, `city`, `garden` |
| `room` | `location` | `quiet`, `near_elevator` |
| `dining` | `dietary` | `vegetarian`, `vegan`, `kosher` |
| `dining` | `allergies` | `nuts`, `shellfish`, `gluten` |
| `dining` | `breakfast` | `early`, `in_room`, `buffet` |
| `communication` | `channel` | `whatsapp`, `sms`, `email` |
| `communication` | `style` | `formal`, `casual` |
| `communication` | `dnd_hours` | `22:00-08:00` |
| `amenity` | `newspaper` | `wsj`, `nyt`, `local` |
| `amenity` | `minibar` | `stocked`, `empty`, `no_alcohol` |
| `service` | `housekeeping` | `daily`, `every_other_day`, `on_request` |
| `accessibility` | `mobility` | `wheelchair`, `walker` |
| `accessibility` | `hearing` | `visual_alerts`, `tty` |

---

## Preference Learning

### Explicit Learning

When a guest explicitly states a preference:

```
Guest: "I prefer a high floor room"

→ Preference created:
{
  category: "room",
  key: "floor",
  value: "high",
  source: "stated",
  confidence: 1.0
}
```

### Implicit Learning

When preferences are inferred from behavior or requests:

```
Guest: "Can I get extra firm pillows again?"
       (Implies they've had firm pillows before and want them again)

→ Preference created:
{
  category: "room",
  key: "pillow",
  value: "firm",
  source: "learned",
  confidence: 0.9,
  learnedFrom: "conv_123"
}
```

### Learning Rules

```typescript
interface LearningRule {
  pattern: string;           // Regex or intent pattern
  category: PreferenceCategory;
  key: string;
  extractValue: (match: RegExpMatchArray) => string;
  confidence: number;
}

const learningRules: LearningRule[] = [
  {
    pattern: /prefer\s+(high|low|quiet)\s+floor/i,
    category: 'room',
    key: 'floor',
    extractValue: (m) => m[1].toLowerCase(),
    confidence: 0.95
  },
  {
    pattern: /i('m| am)\s+(vegetarian|vegan)/i,
    category: 'dining',
    key: 'dietary',
    extractValue: (m) => m[2].toLowerCase(),
    confidence: 1.0
  },
  {
    pattern: /allergic to\s+(\w+)/i,
    category: 'dining',
    key: 'allergies',
    extractValue: (m) => m[1].toLowerCase(),
    confidence: 1.0
  }
];
```

### Confidence Decay

Learned preferences decay over time if not reinforced:

```typescript
function calculateConfidence(pref: Preference): number {
  const daysSinceUpdate = daysBetween(pref.updatedAt, new Date());

  if (pref.source === 'stated' || pref.source === 'pms') {
    // Explicit preferences don't decay
    return pref.confidence;
  }

  // Learned preferences decay
  const decayRate = 0.1; // 10% per year
  const decayFactor = Math.exp(-decayRate * (daysSinceUpdate / 365));

  return pref.confidence * decayFactor;
}
```

---

## Guest Identification

### Identification Flow

```
Message received from channel
         │
         ▼
┌─────────────────────┐
│ Extract identifier  │
│ (phone/email)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Search guest by     │
│ identifier          │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
  Found      Not Found
     │           │
     ▼           ▼
┌─────────┐  ┌──────────────────┐
│ Return  │  │ Search by        │
│ profile │  │ active           │
└─────────┘  │ reservation      │
             └────────┬─────────┘
                      │
                ┌─────┴─────┐
                │           │
             Found      Not Found
                │           │
                ▼           ▼
          ┌─────────┐  ┌─────────┐
          │ Link &  │  │ Create  │
          │ return  │  │ new     │
          └─────────┘  └─────────┘
```

### Matching Logic

```typescript
async function identifyGuest(
  propertyId: string,
  channel: ChannelType,
  channelId: string
): Promise<GuestProfile | null> {
  // Step 1: Direct match by channel identifier
  let guest = await findGuestByChannelId(propertyId, channel, channelId);
  if (guest) return guest;

  // Step 2: Match by phone (if channel provides phone)
  if (channel === 'whatsapp' || channel === 'sms') {
    const phone = normalizePhone(channelId);
    guest = await findGuestByPhone(propertyId, phone);
    if (guest) {
      await linkChannelToGuest(guest.id, channel, channelId);
      return guest;
    }
  }

  // Step 3: Check active reservations with matching contact
  const reservation = await findReservationByContact(propertyId, channelId);
  if (reservation) {
    guest = await getOrCreateGuestFromReservation(reservation);
    await linkChannelToGuest(guest.id, channel, channelId);
    return guest;
  }

  // Step 4: No match - will ask guest for identification
  return null;
}
```

---

## Profile Merging

When duplicate profiles are discovered, they must be merged:

```typescript
interface MergeResult {
  primaryId: string;
  mergedIds: string[];
  conflictsResolved: MergeConflict[];
}

interface MergeConflict {
  field: string;
  primaryValue: any;
  mergedValue: any;
  resolution: 'kept_primary' | 'kept_merged' | 'manual';
}

async function mergeProfiles(
  primaryId: string,
  duplicateIds: string[]
): Promise<MergeResult> {
  const primary = await getGuest(primaryId);
  const duplicates = await Promise.all(duplicateIds.map(getGuest));

  const conflicts: MergeConflict[] = [];

  for (const dup of duplicates) {
    // Merge preferences (union, keep highest confidence)
    primary.preferences = mergePreferences(
      primary.preferences,
      dup.preferences
    );

    // Merge history (sum)
    primary.stayCount += dup.stayCount;
    primary.totalRevenue += dup.totalRevenue;

    // Merge external IDs
    primary.externalIds = { ...dup.externalIds, ...primary.externalIds };

    // Update conversations to point to primary
    await updateConversationGuest(dup.id, primaryId);

    // Soft delete duplicate
    await softDeleteGuest(dup.id, `Merged into ${primaryId}`);
  }

  await saveGuest(primary);

  return {
    primaryId,
    mergedIds: duplicateIds,
    conflictsResolved: conflicts
  };
}
```

---

## Privacy & Consent

### Data Collection

Guest data is collected from:
1. PMS sync (covered by hotel's PMS privacy policy)
2. Direct conversation (consent implied by engagement)
3. Stated preferences (explicit consent)
4. Learned preferences (disclosed in privacy policy)

### Data Access

| Data Type | Staff Access | AI Access | Export |
|-----------|--------------|-----------|--------|
| Contact info | Yes | Yes | GDPR request |
| Preferences | Yes | Yes | GDPR request |
| Conversation history | Yes | Yes (context) | GDPR request |
| Stay history | Yes | Summary only | GDPR request |

### Data Deletion

Guest can request data deletion (GDPR Article 17):

```typescript
async function deleteGuestData(guestId: string): Promise<void> {
  // Anonymize conversations (keep for analytics, remove PII)
  await anonymizeConversations(guestId);

  // Delete preferences
  await deletePreferences(guestId);

  // Anonymize guest record
  await anonymizeGuest(guestId);

  // Log deletion for audit
  await logDataDeletion(guestId);
}
```

---

## Configuration

```yaml
guestMemory:
  learning:
    enabled: true
    minimumConfidence: 0.7
    decayEnabled: true
    decayRate: 0.1  # Per year

  identification:
    autoCreate: true
    mergeThreshold: 0.9
    requireConfirmation: false

  privacy:
    retentionDays: 730  # 2 years
    anonymizeOnDelete: true
    exportFormat: json

  sync:
    pmsPreferences: true
    writeBackPreferences: true
```

---

## API

### Get Guest Preferences

```http
GET /guests/:id/preferences
```

Response:
```json
{
  "preferences": [
    {
      "id": "pref_123",
      "category": "room",
      "key": "floor",
      "value": "high",
      "source": "stated",
      "confidence": 1.0,
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Add Preference

```http
POST /guests/:id/preferences
Content-Type: application/json

{
  "category": "dining",
  "key": "dietary",
  "value": "vegetarian",
  "source": "stated"
}
```

### Delete Preference

```http
DELETE /guests/:id/preferences/:prefId
```

---

## Related

- [Data Model](../../03-architecture/data-model.md)
- [Guest Intelligence Use Case](../../02-use-cases/staff/guest-intelligence.md)
- [AI Engine Memory](../../03-architecture/c4-components/ai-engine.md#memory-manager)
