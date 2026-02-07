# Setup Assistant API Reference & Cleanup Guide

> **Purpose:** This document catalogs all APIs, endpoints, and data structures created during Phase 1-4 of the setup assistant implementation. It will be used as a reference for future refactoring once the reusable assistant system (Phase 8) is complete.

## Status: Cleanup Analysis Complete

| Component | Documented | Cleanup Status |
|-----------|-----------|----------------|
| Setup API Endpoints | Yes | ✅ All in use |
| Site Scraper Endpoints | Yes | 🔴 3 unused endpoints identified |
| Knowledge Base Endpoints | Yes | ✅ All in use |
| Database Tables | Yes | ✅ All in use |
| Data Structures | Yes | ✅ All in use |
| Cleanup Notes | Yes | ✅ Complete |

### Cleanup Summary (Phase 8 Complete)

**Unused Site Scraper Endpoints (can be removed):**
- `POST /fetch` - Not used by any frontend
- `POST /process` - Not used by any frontend
- `GET /preview` - Not used by any frontend

**Endpoints in use:**
- `POST /parse` - Used by Setup wizard + SiteScraper page
- `POST /import` - Used by Setup wizard + SiteScraper page
- `POST /generate-qa` - Used by SiteScraper page
- `GET /sources` - Used by SiteScraper page

---

## 1. Setup API Endpoints

**Base Path:** `/api/v1/setup`
**Auth Required:** No (public routes for fresh install)
**Source:** `src/gateway/routes/setup.ts`

### 1.1 GET /api/v1/setup/state

Get current setup wizard state.

**Response:**
```typescript
{
  status: 'pending' | 'in_progress' | 'completed';
  currentStep: SetupStep | null;
  completedSteps: SetupStep[];
  context: SetupContext;
  isFreshInstall: boolean;
}
```

### 1.2 POST /api/v1/setup/start

Start the setup wizard. Enables Local AI provider.

**Request:** (empty body)

**Response:**
```typescript
{
  status: 'in_progress';
  currentStep: 'bootstrap';
  message: 'Setup started, Local AI enabled';
}
```

**Side Effects:**
- Creates/updates `setup_state` record
- Enables Local AI via `app_configs` table
- Activates Local AI in app registry

### 1.3 POST /api/v1/setup/bootstrap

Complete bootstrap step. Moves to welcome step.

**Request:** (empty body)

**Response:**
```typescript
{
  status: 'in_progress';
  currentStep: 'welcome';
  completedSteps: ['bootstrap'];
}
```

### 1.4 POST /api/v1/setup/welcome

Save property info (name and type).

**Request:**
```typescript
{
  name: string;                              // Required, trimmed
  type: 'hotel' | 'bnb' | 'vacation_rental' | 'other';
}
```

**Response:**
```typescript
{
  status: 'in_progress';
  currentStep: 'ai_provider';
  completedSteps: ['bootstrap', 'property_name', 'property_type'];
  context: { propertyName: string; propertyType: PropertyType };
  message: 'Property info saved';
}
```

**Side Effects:**
- Updates `hotel_profile` in settings table (name, propertyType)
- Updates setup context

### 1.5 POST /api/v1/setup/ai-provider

Configure AI provider (Local, Anthropic, or OpenAI).

**Request:**
```typescript
{
  provider: 'local' | 'anthropic' | 'openai';
  apiKey?: string;  // Required for anthropic/openai
}
```

**Response (Success):**
```typescript
{
  status: 'in_progress';
  currentStep: 'knowledge';
  completedSteps: ['bootstrap', 'property_name', 'property_type', 'ai_provider'];
  context: { aiProvider: string; aiConfigured: true };
  message: 'AI provider configured, setup completed';
}
```

**Response (Validation Failed):**
```typescript
{
  error: {
    code: 'AI_VALIDATION_FAILED';
    message: string;
  };
  state: { status: string; currentStep: string };
}
```

**Side Effects:**
- Saves provider config to `app_configs` table
- Tests API key connection before saving
- Enables provider in app registry

### 1.6 POST /api/v1/setup/knowledge/complete

Complete knowledge gathering step. Moves to admin creation.

**Request:** (empty body)

**Response:**
```typescript
{
  status: 'in_progress';
  currentStep: 'create_admin';
  completedSteps: [..., 'knowledge'];
  message: 'Knowledge gathering completed, moving to admin creation';
}
```

### 1.7 POST /api/v1/setup/create-admin

Create admin account and complete setup.

**Request:**
```typescript
{
  email: string;     // Valid email format
  password: string;  // Min 8 characters
  name: string;      // Min 2 characters
}
```

**Response (Success):**
```typescript
{
  status: 'completed';
  currentStep: null;
  completedSteps: [..., 'create_admin'];
  message: 'Admin account created, setup completed';
}
```

**Response (Error):**
```typescript
{
  error: {
    code: 'ADMIN_CREATION_FAILED' | 'VALIDATION_ERROR';
    message: string;
  };
  state: { status: string; currentStep: string };
}
```

**Side Effects:**
- Creates new staff record with admin role
- Sets default admin (`staff-admin-butler`) status to 'inactive'
- Updates setup context with `adminCreated: true`
- Completes setup (status → 'completed')

### 1.8 POST /api/v1/setup/skip

Skip setup entirely.

**Request:** (empty body)

**Response:**
```typescript
{
  status: 'completed';
  message: 'Setup skipped';
}
```

### 1.9 POST /api/v1/setup/reset

Reset setup state (development only).

**Request:** (empty body)

**Response:**
```typescript
{
  status: 'pending';
  message: 'Setup state reset';
}
```

**Access:** Blocked in production (`403 Forbidden`)

### 1.10 POST /api/v1/setup/sync-profile

Sync hotel profile from knowledge base entries.

**Request:** (empty body)

**Response:**
```typescript
{
  message: 'Profile synced from knowledge base';
  profile: HotelProfile;
}
```

**Side Effects:**
- Extracts check-in/out times from `policy` entries
- Extracts phone/email from `contact` entries
- Extracts address from `local_info` entries
- Updates `hotel_profile` in settings table

### 1.11 POST /api/v1/setup/process-message

Process user message with AI to determine intent.

**Request:**
```typescript
{
  message: string;
  step: string;                    // Current chat step
  propertyName?: string;           // Default: 'your property'
  propertyType?: string;           // Default: 'property'
  question: string;                // The question being asked
}
```

**Response:**
```typescript
{
  action: 'proceed' | 'show_message' | 'skip' | 'retry';
  message: string | null;          // AI response to display
  data: { value: string } | null;  // Extracted value (for proceed)
  stayOnStep?: boolean;            // Stay on current step
  nextStep?: string | null;        // Step to skip to
}
```

**Step Configurations:**
| Step | Can Skip | Validation |
|------|----------|------------|
| `ask_website` | Yes | URL format |
| `ask_manual_checkin` | No | None |
| `ask_manual_room` | No | None |
| `ask_manual_contact` | No | None |
| `ask_manual_location` | No | None |

---

## 2. Site Scraper API Endpoints

**Base Path:** `/api/v1/tools/site-scraper`
**Auth Required:** Yes (authenticated routes)
**Source:** `src/apps/tools/site-scraper/routes.ts`

### 2.1 POST /api/v1/tools/site-scraper/fetch ❌ UNUSED

> **Status:** Not used by any frontend. Candidate for removal.

Fetch content from URLs (metadata only, no HTML in response).

**Request:**
```typescript
{
  urls: string[];  // 1-10 valid URLs
  options?: {
    selector?: string;
    excludeSelectors?: string[];
    timeout?: number;              // 1000-30000ms
    hotelName?: string;
  };
}
```

**Response:**
```typescript
{
  results: Array<{
    url: string;
    title: string;
    status: 'success' | 'error';
    error?: string;
    statusCode?: number;
    fetchedAt: string;
    contentLength: number;
  }>;
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}
```

### 2.2 POST /api/v1/tools/site-scraper/parse

Fetch and parse URLs with AI-powered extraction.

**Request:** (same as fetch)

**Response:**
```typescript
{
  results: Array<{
    url: string;
    status: 'success' | 'error';
    title?: string;
    entries: AIExtractedEntry[];
    entryCount?: number;
    method?: 'ai' | 'fallback';
    error?: string;
  }>;
  entries: AIExtractedEntry[];     // Deduplicated entries
  duplicates: DuplicatePair[];     // Identified duplicates
  summary: {
    total: number;
    success: number;
    failed: number;
    totalEntries: number;
  };
}
```

**Side Effects:**
- Requires embedding provider (returns 400 if unavailable)
- Performs semantic deduplication on extracted entries

### 2.3 POST /api/v1/tools/site-scraper/import

Import entries to knowledge base with embeddings.

**Request:**
```typescript
{
  entries: Array<{
    category: string;
    title: string;
    content: string;
    keywords: string[];
    priority: number;              // 1-10
    sourceUrl: string;
  }>;
  qaPairs?: Array<{
    question: string;
    answer: string;
    entryIndex: number;
  }>;
  options?: {
    skipDuplicates?: boolean;      // Default: true
    updateExisting?: boolean;      // Default: false
  };
}
```

**Response:**
```typescript
{
  imported: number;
  skipped: number;
  updated: number;
  errors: string[];
}
```

**Side Effects:**
- Inserts entries to `knowledge_base` table
- Generates embeddings via embedding provider
- Stores embeddings in `knowledge_embeddings` table
- Imports Q&A pairs as `faq` category entries

### 2.4 GET /api/v1/tools/site-scraper/sources

List previously imported source URLs.

**Response:**
```typescript
{
  sources: Array<{
    url: string;
    entryCount: number;
    lastImportedAt: string;
  }>;
}
```

### 2.5 GET /api/v1/tools/site-scraper/preview ❌ UNUSED

> **Status:** Not used by any frontend. Candidate for removal.

Quick preview of what can be scraped from a URL.

**Query:** `?url=https://example.com`

**Response:**
```typescript
{
  url: string;
  status: 'success' | 'error';
  title?: string;
  metadata?: PageMetadata;
  preview?: {
    sectionCount: number;
    sectionTypes: Record<string, number>;
    estimatedEntries: number;
    sampleSections: Array<{
      type: string;
      heading?: string;
      contentPreview: string;
    }>;
  };
  error?: string;
}
```

### 2.6 Undocumented Endpoints

The following endpoints exist in `routes.ts` but were not in original documentation:

#### POST /api/v1/tools/site-scraper/process ❌ UNUSED

> **Status:** Not used by any frontend. Candidate for removal.

Process raw HTML content with AI categorization. This is a legacy endpoint - the `/parse` endpoint now handles both fetching and processing in one call.

#### POST /api/v1/tools/site-scraper/generate-qa ✅ IN USE

> **Status:** Used by SiteScraper tool page (`apps/dashboard/src/pages/tools/SiteScraper.tsx:196`)

Generate Q&A pairs from extracted entries for enhanced knowledge base.

---

## 3. Knowledge Base API Endpoints

**Base Path:** `/api/v1/knowledge`
**Auth Required:** Yes
**Source:** `src/gateway/routes/knowledge.ts`

### Used by Setup Wizard

The setup wizard uses these endpoints indirectly through site-scraper imports:

| Endpoint | Usage |
|----------|-------|
| POST /import | Bulk import scraped entries |
| GET / | Check existing entries (dedup) |

### 3.1 GET /api/v1/knowledge

List knowledge entries with filtering.

**Query Parameters:**
- `category` - Filter by category
- `search` - Text search in title/content
- `source` - 'scraped' or 'manual'
- `status` - 'active' (default) or 'archived'
- `limit` - Max 500, default 100
- `offset` - Pagination offset

### 3.2 POST /api/v1/knowledge

Create new entry with embedding.

### 3.3 POST /api/v1/knowledge/reindex

Regenerate all embeddings.

---

## 4. Database Schema

### 4.1 setup_state Table

**Source:** `src/db/schema.ts`

```typescript
export const setupState = sqliteTable('setup_state', {
  id: text('id').primaryKey(),           // Always 'setup'
  status: text('status').notNull(),       // 'pending' | 'in_progress' | 'completed'
  currentStep: text('current_step'),      // Current step name
  completedSteps: text('completed_steps').notNull().default('[]'),  // JSON array
  context: text('context').notNull().default('{}'),  // JSON object
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

### 4.2 knowledge_base Table

```typescript
export const knowledgeBase = sqliteTable('knowledge_base', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),   // faq, policy, amenity, etc.
  title: text('title').notNull(),
  content: text('content').notNull(),
  keywords: text('keywords'),              // JSON array
  priority: integer('priority').default(5),
  status: text('status').default('active'),
  sourceUrl: text('source_url'),           // NULL for manual entries
  sourceEntryId: text('source_entry_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

### 4.3 knowledge_embeddings Table

```typescript
export const knowledgeEmbeddings = sqliteTable('knowledge_embeddings', {
  id: text('id').primaryKey(),            // Same as knowledge_base.id
  embedding: text('embedding').notNull(), // JSON array of floats
  model: text('model').notNull(),         // Provider name
  dimensions: integer('dimensions').notNull(),
});
```

### 4.4 settings Table (hotel_profile)

```typescript
// Key: 'hotel_profile'
// Value: JSON string of HotelProfile
```

### 4.5 app_configs Table

Stores AI provider configurations:
- Key: provider name ('local', 'anthropic', 'openai')
- Value: JSON config with apiKey, enabled status

### 4.6 staff Table

Admin account storage:
- New admin created with unique ID
- Default admin (`staff-admin-butler`) disabled after setup

---

## 5. TypeScript Types

### 5.1 SetupContext

**Source:** `src/services/setup.ts`

```typescript
export interface SetupContext {
  propertyName?: string;
  propertyType?: PropertyType;
  localAiEnabled?: boolean;
  aiProvider?: AIProviderType;
  aiConfigured?: boolean;
  adminCreated?: boolean;
}
```

### 5.2 SetupStep

```typescript
export type SetupStep =
  | 'bootstrap'
  | 'welcome'
  | 'property_name'
  | 'property_type'
  | 'ai_provider'
  | 'knowledge'
  | 'create_admin';
```

### 5.3 HotelProfile

```typescript
interface HotelProfile {
  name: string;
  propertyType?: PropertyType;
  address?: string;
  city?: string;
  country?: string;
  timezone: string;           // Default: 'UTC'
  currency: string;           // Default: 'USD'
  checkInTime: string;        // Default: '15:00'
  checkOutTime: string;       // Default: '11:00'
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
}
```

### 5.4 AIExtractedEntry

**Source:** `src/apps/tools/site-scraper/ai-parser.ts`

```typescript
export interface AIExtractedEntry {
  title: string;
  content: string;
  category: KnowledgeCategory;
  keywords: string[];
  confidence: number;          // 0-1
}
```

### 5.5 KnowledgeCategory

```typescript
type KnowledgeCategory =
  | 'faq'
  | 'policy'
  | 'amenity'
  | 'service'
  | 'dining'
  | 'room_type'
  | 'local_info'
  | 'contact'
  | 'other';
```

---

## 6. Frontend Chat Steps

**Source:** `apps/dashboard/src/pages/Setup.tsx`

```typescript
type ChatStep =
  | 'greeting'
  | 'ask_name'
  | 'ask_type'
  | 'ask_ai_provider'
  | 'ask_api_key'
  | 'ask_website'
  | 'scraping'
  | 'show_checklist'
  | 'ask_manual_checkin'
  | 'ask_manual_room'
  | 'ask_manual_contact'
  | 'ask_manual_location'
  | 'ask_admin'
  | 'complete'
  | 'done';
```

---

## 7. Data Flow Diagrams

### 7.1 Website Scrape Flow

```
User enters URL
        ↓
POST /tools/site-scraper/parse
        ↓
scrapeUrls() → fetchResults
        ↓
For each result:
    htmlToCleanText() → cleanText
    extractContentWithAI() → aiEntries
        ↓
semanticDedup(allEntries)
        ↓
Return deduplicated entries to frontend
        ↓
User confirms
        ↓
POST /tools/site-scraper/import
        ↓
For each entry:
    Insert to knowledge_base
    generateAndStoreEmbedding()
        ↓
POST /setup/sync-profile
        ↓
Extract structured data from entries
Update hotel_profile
```

### 7.2 Setup State Machine

```
pending → in_progress (start)
                ↓
        bootstrap (Local AI enabled)
                ↓
        welcome (property_name + property_type)
                ↓
        ai_provider (AI configured)
                ↓
        knowledge (website scraped or skipped)
                ↓
        create_admin (admin account created)
                ↓
          completed
```

---

## 8. Cleanup Notes for Phase 8

### 8.1 API Consolidation

| Current | Target |
|---------|--------|
| `/api/v1/setup/*` (11 endpoints) | Keep for backward compatibility |
| Multiple step endpoints | Consider unified state machine endpoint |
| Separate sync-profile | Could be automatic on knowledge complete |

### 8.2 Frontend Refactoring

| Issue | Resolution |
|-------|------------|
| 15+ hardcoded ChatStep values | Extract to step configs |
| Inline form handling | Use FormSchema system |
| Monolithic Setup.tsx (1072 lines) | Extract step components |

### 8.3 Type Cleanup

- Unify `SetupStep` (backend) and `ChatStep` (frontend)
- Move `AIExtractedEntry` to shared types
- Create central `KnowledgeCategory` type

### 8.4 Service Refactoring

| Current | Issue | Target |
|---------|-------|--------|
| `SetupService` | Mixes state + operations | Separate state machine from operations |
| Inline validation | Scattered in routes | Centralize in service |
| Step configs in routes.ts | Frontend/backend mismatch | Share step definitions |

### 8.5 Backward Compatibility

When refactoring to reusable assistant system:
1. Keep existing endpoints functional
2. Add deprecation warnings if needed
3. New assistants should use shared foundation
4. Setup wizard can be migrated gradually

### 8.6 Site Scraper Endpoint Cleanup (Recommended)

**Safe to Remove:**
| Endpoint | Reason | Impact |
|----------|--------|--------|
| `POST /fetch` | Unused, `/parse` does both fetch+parse | None |
| `POST /process` | Legacy, `/parse` now handles this | None |
| `GET /preview` | Never integrated into UI | None |

**Keep:**
| Endpoint | Used By |
|----------|---------|
| `POST /parse` | Setup wizard, SiteScraper page |
| `POST /import` | Setup wizard, SiteScraper page |
| `POST /generate-qa` | SiteScraper page |
| `GET /sources` | SiteScraper page |

**Cleanup Steps:**
1. Remove `/fetch`, `/process`, `/preview` route handlers from `src/apps/tools/site-scraper/routes.ts`
2. Remove associated Zod schemas (`fetchSchema`, `processSchema`) if no longer needed
3. Test SiteScraper page and Setup wizard still work
4. Remove any orphaned utility functions used only by removed endpoints

---

## 9. File Index

| File | Purpose |
|------|---------|
| `src/gateway/routes/setup.ts` | Setup API endpoints |
| `src/services/setup.ts` | Setup state management |
| `src/apps/tools/site-scraper/routes.ts` | Scraper API endpoints |
| `src/apps/tools/site-scraper/*.ts` | Scraping pipeline |
| `src/gateway/routes/knowledge.ts` | Knowledge API endpoints |
| `src/db/schema.ts` | Database tables |
| `apps/dashboard/src/pages/Setup.tsx` | Frontend wizard (monolith) |
| `apps/dashboard/src/components/setup/*.tsx` | Reusable UI components |
| `apps/dashboard/src/locales/*/setup.json` | i18n translations (6 languages) |

---

## 10. Testing Coverage

### Unit Tests Needed
- [ ] `SetupService` methods
- [ ] Step validation logic
- [ ] Profile sync extraction
- [ ] Time normalization

### Integration Tests Needed
- [ ] Full setup flow (bootstrap → complete)
- [ ] AI provider configuration
- [ ] Website scrape + import
- [ ] Admin creation + default admin disable

### E2E Tests Needed
- [ ] Fresh install detection
- [ ] Resume after browser close
- [ ] Skip setup flow
- [ ] Multi-language support

---

*Last Updated: Phase 8 Complete - Cleanup Analysis Done*
*Status: 3 unused site scraper endpoints identified for removal (fetch, process, preview)*
