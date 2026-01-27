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

#### Decay Logic Details

| Question | Answer |
|----------|--------|
| When is decay applied? | On read (lazy evaluation), not on write |
| Does "stated" source decay? | No, stated and PMS preferences never decay |
| Does "staff" source decay? | Yes, at 50% of the learned rate (more trusted) |
| What triggers recalculation? | Any preference read operation |
| Is decayed value persisted? | No, stored value unchanged; decay is calculated dynamically |
| How is preference reinforced? | Guest mentions same preference again → `updatedAt` resets |

```typescript
// Decay is calculated at read time, not stored
async function getActivePreferences(guestId: string): Promise<Preference[]> {
  const prefs = await db.query.preferences.findMany({
    where: eq(preferences.guestId, guestId)
  });

  return prefs.map(pref => ({
    ...pref,
    confidence: calculateConfidence(pref)
  })).filter(p => p.confidence >= config.minimumConfidence);
}

// When preference is reinforced
async function reinforcePreference(prefId: string): Promise<void> {
  await db.update(preferences)
    .set({ updatedAt: new Date() })
    .where(eq(preferences.id, prefId));
}
```

### Preference Learning Defaults

When AI infers a preference not covered by explicit learning rules:

```typescript
const DEFAULT_LEARNING_CONFIG = {
  // Default confidence for AI-inferred preferences
  defaultInferredConfidence: 0.7,

  // Default category when unclear
  defaultCategory: 'service' as PreferenceCategory,

  // Minimum confidence to store
  minimumConfidenceToStore: 0.6,

  // Maximum inferred preferences per conversation
  maxInferredPerConversation: 3
};

async function learnFromConversation(
  guestId: string,
  conversationId: string,
  aiAnalysis: PreferenceAnalysis
): Promise<void> {
  // Filter by minimum confidence
  const validInferences = aiAnalysis.inferred
    .filter(p => p.confidence >= DEFAULT_LEARNING_CONFIG.minimumConfidenceToStore)
    .slice(0, DEFAULT_LEARNING_CONFIG.maxInferredPerConversation);

  for (const inference of validInferences) {
    await createPreference({
      guestId,
      category: inference.category || DEFAULT_LEARNING_CONFIG.defaultCategory,
      key: inference.key,
      value: inference.value,
      source: 'learned',
      confidence: Math.min(inference.confidence, DEFAULT_LEARNING_CONFIG.defaultInferredConfidence),
      learnedFrom: conversationId
    });
  }
}
```

### Preference Source Priority

When multiple sources provide conflicting values:

```typescript
// Priority order (higher = more trusted)
const SOURCE_PRIORITY: Record<PreferenceSource, number> = {
  'stated': 100,    // Guest explicitly said it - highest trust
  'pms': 80,        // From property management system
  'staff': 60,      // Staff observation
  'learned': 40     // AI inference - lowest trust
};

function resolvePreferenceConflict(
  existing: Preference,
  incoming: Preference
): Preference {
  // Same source, different values: keep most recent
  if (existing.source === incoming.source) {
    return incoming.updatedAt > existing.updatedAt ? incoming : existing;
  }

  // Different sources: use priority
  const existingPriority = SOURCE_PRIORITY[existing.source];
  const incomingPriority = SOURCE_PRIORITY[incoming.source];

  if (incomingPriority > existingPriority) {
    return incoming;
  }

  if (incomingPriority === existingPriority) {
    // Same priority: prefer higher confidence
    return incoming.confidence > existing.confidence ? incoming : existing;
  }

  return existing;
}

// Example: Guest stated "vegetarian" but PMS says "vegan"
// → "stated" wins (priority 100 > 80)

// Example: Staff noted "quiet room" but learned "near elevator"
// → "staff" wins (priority 60 > 40)
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
  channel: ChannelType,
  channelId: string
): Promise<GuestProfile | null> {
  // Step 1: Direct match by channel identifier
  let guest = await findGuestByChannelId(channel, channelId);
  if (guest) return guest;

  // Step 2: Match by phone (if channel provides phone)
  if (channel === 'whatsapp' || channel === 'sms') {
    const phone = normalizePhone(channelId);
    guest = await findGuestByPhone(phone);
    if (guest) {
      await linkChannelToGuest(guest.id, channel, channelId);
      return guest;
    }
  }

  // Step 3: Check active reservations with matching contact
  const reservation = await findReservationByContact(channelId);
  if (reservation) {
    guest = await getOrCreateGuestFromReservation(reservation);
    await linkChannelToGuest(guest.id, channel, channelId);
    return guest;
  }

  // Step 4: No match - will ask guest for identification
  return null;
}
```

### Edge Cases

#### Multiple Guests with Same Phone Number

When multiple guests share a phone number (e.g., family, travel agent):

```typescript
async function handleMultipleMatches(phone: string): Promise<GuestProfile | null> {
  const matches = await findAllGuestsByPhone(phone);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches - check for active reservations
  const activeReservations = await getActiveReservations(phone);

  if (activeReservations.length === 1) {
    // Single active reservation - return that guest
    return matches.find(g => g.id === activeReservations[0].guestId);
  }

  if (activeReservations.length > 1) {
    // Multiple active reservations - ask for room number
    return null; // Triggers disambiguation flow
  }

  // No active reservations - use most recent stay
  const sorted = matches.sort((a, b) =>
    (b.lastStayDate?.getTime() || 0) - (a.lastStayDate?.getTime() || 0)
  );
  return sorted[0];
}

// Disambiguation response when needed
function createDisambiguationRequest(): Response {
  return {
    type: 'disambiguation',
    message: "I see we have multiple guests with this contact. Could you please provide your room number or last name so I can assist you better?"
  };
}
```

#### International Phone Number Normalization

```typescript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

function normalizePhone(input: string, defaultCountry: string = 'US'): string {
  try {
    const parsed = parsePhoneNumber(input, defaultCountry);
    if (parsed && isValidPhoneNumber(input, defaultCountry)) {
      return parsed.format('E.164'); // +14155551234
    }
  } catch (e) {
    // Fall back to basic normalization
  }

  // Basic normalization: remove non-digits, add + if missing
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`; // Assume US
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

// All phone numbers stored in E.164 format
// Matching is done with normalized values
```

#### Guest Contacts Before Reservation Exists

When a guest messages before their reservation is in the PMS:

```typescript
async function handleNoReservation(guest: GuestProfile | null, channel: ChannelType, channelId: string): Promise<void> {
  if (guest) {
    // Known guest without active reservation
    // Still provide helpful service, just note context
    return;
  }

  // Unknown guest with no reservation
  // Create provisional profile
  const provisional = await createProvisionalGuest({
    channel,
    channelId,
    status: 'provisional',
    expiresAt: addDays(new Date(), 7) // Auto-delete if no reservation links
  });

  // Response acknowledges we don't see a reservation
  // "I don't see an active reservation for this number. Are you reaching out about a future stay? I can still help with general questions!"
}
```

#### PMS Offline During Guest Arrival

```typescript
async function identifyWithPMSFallback(
  channel: ChannelType,
  channelId: string
): Promise<GuestProfile | null> {
  // Try PMS lookup
  try {
    const pmsGuest = await pms.lookupGuest(channelId, { timeout: 5000 });
    if (pmsGuest) {
      return await syncGuestFromPMS(pmsGuest);
    }
  } catch (error) {
    if (error.code === 'PMS_UNAVAILABLE' || error.code === 'TIMEOUT') {
      // PMS is offline - use cached data
      const cached = await getCachedGuest(channelId);
      if (cached) {
        return { ...cached, _pmsOffline: true };
      }

      // No cache - create minimal profile, will sync later
      return createMinimalProfile(channel, channelId);
    }
    throw error;
  }

  return null;
}

// Background job syncs when PMS comes back online
jobQueue.add('pms_sync_retry', { channelId }, { delay: 300000 }); // Retry in 5 min
```

#### Guest Uses Different Phone Than Reservation

```typescript
// When guest contacts from unknown number
async function handleUnknownNumber(message: InboundMessage): Promise<void> {
  const response = await askForIdentification();

  // "Welcome! I don't recognize this number. Could you please provide:
  //  - Your confirmation number, OR
  //  - Your last name and room number, OR
  //  - The email address on your reservation"
}

// Once identified, offer to link this number
async function linkNewChannel(guest: GuestProfile, channel: ChannelType, channelId: string): Promise<void> {
  await linkChannelToGuest(guest.id, channel, channelId);

  // Inform guest
  // "Great! I've found your reservation. Would you like me to remember this number for future stays?"
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
    const prefResult = mergePreferences(primary.preferences, dup.preferences);
    primary.preferences = prefResult.merged;
    conflicts.push(...prefResult.conflicts);

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

  // Create merge audit record
  await createAuditLog({
    action: 'guest.merged',
    actorId: 'system',
    resourceType: 'guest',
    resourceId: primaryId,
    metadata: {
      mergedIds: duplicateIds,
      conflictsResolved: conflicts.length,
      conflicts: conflicts
    }
  });

  await saveGuest(primary);

  return {
    primaryId,
    mergedIds: duplicateIds,
    conflictsResolved: conflicts
  };
}

### Merge Conflict Resolution

```typescript
function mergePreferences(
  primary: Preference[],
  secondary: Preference[]
): { merged: Preference[], conflicts: MergeConflict[] } {
  const merged: Preference[] = [...primary];
  const conflicts: MergeConflict[] = [];

  for (const secPref of secondary) {
    const existing = merged.find(p =>
      p.category === secPref.category && p.key === secPref.key
    );

    if (!existing) {
      // No conflict - just add
      merged.push(secPref);
      continue;
    }

    // Same preference exists - conflict resolution
    if (existing.value === secPref.value) {
      // Same value - keep higher confidence
      if (secPref.confidence > existing.confidence) {
        existing.confidence = secPref.confidence;
      }
      continue;
    }

    // Different values - need resolution
    const conflict: MergeConflict = {
      field: `preferences.${secPref.category}.${secPref.key}`,
      primaryValue: existing.value,
      mergedValue: secPref.value,
      resolution: 'kept_primary' // Default
    };

    // Resolution rules:
    // 1. If same confidence, different source → use source priority
    if (existing.confidence === secPref.confidence) {
      const primaryPriority = SOURCE_PRIORITY[existing.source];
      const secondaryPriority = SOURCE_PRIORITY[secPref.source];

      if (secondaryPriority > primaryPriority) {
        existing.value = secPref.value;
        existing.source = secPref.source;
        conflict.resolution = 'kept_merged';
      }
    }
    // 2. If same source, same confidence → flag for manual review
    else if (existing.source === secPref.source && existing.confidence === secPref.confidence) {
      conflict.resolution = 'manual';
      // Add to manual review queue
      await queueForManualReview({
        guestId: primary.id,
        conflict,
        context: { primaryProfile: primary, mergedProfile: secondary }
      });
    }
    // 3. Otherwise → keep higher confidence
    else if (secPref.confidence > existing.confidence) {
      existing.value = secPref.value;
      existing.source = secPref.source;
      existing.confidence = secPref.confidence;
      conflict.resolution = 'kept_merged';
    }

    conflicts.push(conflict);
  }

  return { merged, conflicts };
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
async function deleteGuestData(guestId: string): Promise<DeletionResult> {
  const result: DeletionResult = {
    guestId,
    deletedAt: new Date(),
    itemsProcessed: {
      conversations: 0,
      preferences: 0,
      tasks: 0,
      auditLogs: 0
    }
  };

  // 1. Anonymize conversations (keep for analytics, remove PII)
  result.itemsProcessed.conversations = await anonymizeConversations(guestId);

  // 2. Delete preferences
  result.itemsProcessed.preferences = await deletePreferences(guestId);

  // 3. Anonymize tasks (keep operational record, remove guest details)
  result.itemsProcessed.tasks = await anonymizeTasks(guestId);

  // 4. Handle audit logs (keep for compliance, anonymize guest reference)
  result.itemsProcessed.auditLogs = await anonymizeAuditLogs(guestId);

  // 5. Anonymize guest record (don't fully delete for referential integrity)
  await anonymizeGuest(guestId);

  // 6. Log deletion for compliance audit (this log is retained)
  await logDataDeletion(guestId, result);

  return result;
}
```

#### GDPR Deletion Edge Cases

| Data Type | Action | Rationale |
|-----------|--------|-----------|
| Audit logs referencing guest | Anonymize guest_id → `[DELETED]` | Required for compliance history |
| Tasks created for guest | Anonymize, keep task record | Operational continuity |
| Conversation messages | Delete content, keep metadata | Analytics aggregates preserved |
| Conversation analytics | Keep aggregates only | No PII in aggregates |
| PMS-synced data | Delete from Jack only | Cannot delete from PMS (not our system) |
| Embeddings with guest context | Delete vectors referencing guest | Complete removal from RAG |

```typescript
// Specific handlers for each data type

async function anonymizeConversations(guestId: string): Promise<number> {
  return await db.update(messages)
    .set({
      content: '[CONTENT DELETED]',
      metadata: sql`jsonb_set(metadata, '{deleted}', 'true')`
    })
    .where(eq(messages.guestId, guestId))
    .returning({ count: sql<number>`count(*)` });
}

async function anonymizeTasks(guestId: string): Promise<number> {
  return await db.update(tasks)
    .set({
      guestId: null,
      description: sql`regexp_replace(description, guest_name, '[GUEST]', 'g')`,
      metadata: sql`metadata - 'guest_phone' - 'guest_email'`
    })
    .where(eq(tasks.guestId, guestId))
    .returning({ count: sql<number>`count(*)` });
}

async function anonymizeAuditLogs(guestId: string): Promise<number> {
  // Don't delete audit logs - just anonymize the guest reference
  return await db.update(auditLogs)
    .set({
      metadata: sql`jsonb_set(metadata, '{guest_id}', '"[DELETED]"')`
    })
    .where(sql`metadata->>'guest_id' = ${guestId}`)
    .returning({ count: sql<number>`count(*)` });
}

// Note: Cannot delete from external PMS
// Inform guest they must contact hotel directly for PMS deletion
```

#### PMS Data Limitation

```typescript
interface DeletionResponse {
  success: boolean;
  message: string;
  externalDataNote?: string;
}

function formatDeletionResponse(result: DeletionResult): DeletionResponse {
  return {
    success: true,
    message: `Your data has been deleted from Jack The Butler. ${result.itemsProcessed.conversations} conversations, ${result.itemsProcessed.preferences} preferences removed.`,
    externalDataNote: "Please note: Data stored in the hotel's Property Management System (PMS) is managed separately. To request deletion of your reservation history, please contact the hotel directly."
  };
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
