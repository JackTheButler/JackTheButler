# Phase 21: i18n Namespace Splitting

**Focus:** Break monolithic locale files into feature-based namespaces for maintainability and reduced token usage
**Risk:** Low
**Depends on:** Phase 20 (Smart Automation)
**Status:** ✅ COMPLETE

---

## Problem Statement

1. **Large locale files** - Single `common.json` per language contains all translations (~500+ keys)
2. **High token usage** - AI assistants must read/write entire file for small changes
3. **No lazy loading** - All translations loaded upfront, even for unused features
4. **Merge conflicts** - Multiple features editing same file causes conflicts
5. **Hard to find keys** - Flat or deeply nested structure makes navigation difficult

---

## Solution Overview

Split `common.json` into feature-based namespaces that align with the app's page structure:

```
src/locales/en/
├── common.json        # Shared UI elements (buttons, labels, errors)
├── auth.json          # Authentication & permissions
├── dashboard.json     # Home page, stats, overview
├── conversations.json # Inbox, messages, chat
├── tasks.json         # Task management
├── guests.json        # Guest profiles, directory
├── reservations.json  # Bookings, arrivals/departures
├── settings.json      # All settings pages
├── automations.json   # Automation rules, triggers, actions
└── knowledge.json     # Knowledge base, articles
```

---

## Current State

### File Sizes (approximate)
| Language | File | Keys | Size |
|----------|------|------|------|
| en | common.json | ~400 | ~15KB |
| es | common.json | ~400 | ~16KB |
| ar | common.json | ~400 | ~17KB |
| hi | common.json | ~400 | ~18KB |
| ru | common.json | ~400 | ~18KB |
| zh | common.json | ~400 | ~14KB |

### Current Structure
```json
{
  "appName": "...",
  "navigation": { ... },
  "dashboard": { ... },
  "conversations": { ... },
  "tasks": { ... },
  "guests": { ... },
  "settings": { ... },
  "hotelProfile": { ... },
  "automations": { ... },
  "common": { ... }
}
```

---

## Implementation Plan

### Step 1: Update i18next Configuration

**File:** `apps/dashboard/src/i18n.ts`

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Define namespaces
export const namespaces = [
  'common',
  'auth',
  'dashboard',
  'conversations',
  'tasks',
  'guests',
  'reservations',
  'settings',
  'automations',
  'knowledge',
] as const;

export type Namespace = typeof namespaces[number];

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'ar', 'hi', 'ru', 'zh'],

    // Default namespace
    defaultNS: 'common',

    // Namespaces to load initially
    ns: ['common'],

    // Load other namespaces on demand
    partialBundledLanguages: true,

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

---

### Step 2: Create Namespace Files

**Migration mapping from current structure:**

| Current Key Prefix | Target Namespace |
|-------------------|------------------|
| `appName`, `navigation.*`, `common.*`, `errors.*`, `validation.*` | `common.json` |
| `login.*`, `logout.*`, `permissions.*` | `auth.json` |
| `dashboard.*`, `stats.*`, `overview.*` | `dashboard.json` |
| `conversations.*`, `inbox.*`, `messages.*`, `chat.*` | `conversations.json` |
| `tasks.*` | `tasks.json` |
| `guests.*`, `guestDirectory.*` | `guests.json` |
| `reservations.*`, `bookings.*`, `arrivals.*` | `reservations.json` |
| `settings.*`, `hotelProfile.*`, `integrations.*`, `users.*` | `settings.json` |
| `automations.*`, `triggers.*`, `actions.*` | `automations.json` |
| `knowledge.*`, `articles.*`, `knowledgeBase.*` | `knowledge.json` |

**Example: `common.json` (shared elements)**

```json
{
  "appName": "Jack The Butler",
  "navigation": {
    "dashboard": "Dashboard",
    "inbox": "Inbox",
    "tasks": "Tasks",
    "guests": "Guests",
    "settings": "Settings"
  },
  "buttons": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "close": "Close",
    "confirm": "Confirm",
    "back": "Back",
    "next": "Next"
  },
  "labels": {
    "loading": "Loading...",
    "noResults": "No results found",
    "search": "Search",
    "filter": "Filter",
    "sort": "Sort"
  },
  "errors": {
    "generic": "Something went wrong",
    "notFound": "Not found",
    "unauthorized": "Unauthorized",
    "networkError": "Network error"
  },
  "validation": {
    "required": "This field is required",
    "invalidEmail": "Invalid email address",
    "minLength": "Must be at least {{min}} characters"
  },
  "time": {
    "today": "Today",
    "yesterday": "Yesterday",
    "daysAgo": "{{count}} days ago"
  }
}
```

**Example: `settings.json`**

```json
{
  "title": "Settings",
  "tabs": {
    "profile": "Hotel Profile",
    "integrations": "Integrations",
    "users": "Users",
    "automations": "Automations"
  },
  "hotelProfile": {
    "title": "Hotel Profile",
    "description": "Configure your hotel's basic information",
    "fields": {
      "name": "Hotel Name",
      "timezone": "Timezone",
      "currency": "Currency",
      "country": "Country",
      "checkInTime": "Check-in Time",
      "checkOutTime": "Check-out Time"
    },
    "placeholders": {
      "selectTimezone": "Select timezone",
      "selectCurrency": "Select currency",
      "selectCountry": "Select country"
    }
  },
  "integrations": {
    "title": "Integrations",
    "channels": "Communication Channels",
    "pms": "Property Management System"
  },
  "users": {
    "title": "Users",
    "addUser": "Add User",
    "roles": {
      "admin": "Administrator",
      "manager": "Manager",
      "staff": "Staff"
    }
  }
}
```

---

### Step 3: Create useTranslation Hook Wrapper

**File:** `apps/dashboard/src/hooks/useNamespacedTranslation.ts`

```typescript
import { useTranslation } from 'react-i18next';
import type { Namespace } from '../i18n';

/**
 * Wrapper hook that loads namespace on demand
 * Usage: const { t } = useNsTranslation('settings');
 *        t('hotelProfile.title') -> "Hotel Profile"
 */
export function useNsTranslation(ns: Namespace | Namespace[]) {
  return useTranslation(ns, { useSuspense: false });
}

/**
 * For components that need multiple namespaces
 * Usage: const { t } = useMultiNsTranslation(['common', 'settings']);
 *        t('common:buttons.save') or t('settings:hotelProfile.title')
 */
export function useMultiNsTranslation(namespaces: Namespace[]) {
  return useTranslation(namespaces, { useSuspense: false });
}
```

---

### Step 4: Add Suspense Boundary for Lazy Loading

**File:** `apps/dashboard/src/components/I18nSuspense.tsx`

```typescript
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

interface I18nSuspenseProps {
  children: React.ReactNode;
}

export function I18nSuspense({ children }: I18nSuspenseProps) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    }>
      {children}
    </Suspense>
  );
}
```

---

### Step 5: Update Components to Use Namespaces

**Before:**
```typescript
import { useTranslation } from 'react-i18next';

function Settings() {
  const { t } = useTranslation();
  return <h1>{t('settings.title')}</h1>;
}
```

**After:**
```typescript
import { useNsTranslation } from '@/hooks/useNamespacedTranslation';

function Settings() {
  const { t } = useNsTranslation('settings');
  return <h1>{t('title')}</h1>;
}
```

**For cross-namespace access:**
```typescript
import { useMultiNsTranslation } from '@/hooks/useNamespacedTranslation';

function SettingsPage() {
  const { t } = useMultiNsTranslation(['common', 'settings']);

  return (
    <div>
      <h1>{t('settings:title')}</h1>
      <button>{t('common:buttons.save')}</button>
    </div>
  );
}
```

---

### Step 6: Migration Script

**File:** `scripts/split-locales.ts`

```typescript
import fs from 'fs';
import path from 'path';

const LANGUAGES = ['en', 'es', 'ar', 'hi', 'ru', 'zh'];
const LOCALES_DIR = 'apps/dashboard/src/locales';

// Mapping of keys to namespaces
const keyMapping: Record<string, string> = {
  'appName': 'common',
  'navigation': 'common',
  'common': 'common',
  'errors': 'common',
  'validation': 'common',
  'buttons': 'common',
  'labels': 'common',
  'time': 'common',

  'login': 'auth',
  'logout': 'auth',
  'permissions': 'auth',

  'dashboard': 'dashboard',
  'stats': 'dashboard',
  'overview': 'dashboard',

  'conversations': 'conversations',
  'inbox': 'conversations',
  'messages': 'conversations',
  'chat': 'conversations',

  'tasks': 'tasks',

  'guests': 'guests',
  'guestDirectory': 'guests',

  'reservations': 'reservations',
  'bookings': 'reservations',
  'arrivals': 'reservations',

  'settings': 'settings',
  'hotelProfile': 'settings',
  'integrations': 'settings',
  'users': 'settings',

  'automations': 'automations',
  'triggers': 'automations',
  'actions': 'automations',

  'knowledge': 'knowledge',
  'articles': 'knowledge',
  'knowledgeBase': 'knowledge',
};

function splitLocale(lang: string) {
  const inputPath = path.join(LOCALES_DIR, lang, 'common.json');
  const content = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  const namespaces: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(content)) {
    const namespace = keyMapping[key] || 'common';

    if (!namespaces[namespace]) {
      namespaces[namespace] = {};
    }

    namespaces[namespace][key] = value;
  }

  // Write each namespace file
  for (const [namespace, data] of Object.entries(namespaces)) {
    const outputPath = path.join(LOCALES_DIR, lang, `${namespace}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Created: ${outputPath}`);
  }

  // Backup original
  fs.renameSync(inputPath, inputPath.replace('.json', '.backup.json'));
}

// Run for all languages
LANGUAGES.forEach(splitLocale);
console.log('Done! Original files backed up with .backup.json extension');
```

---

### Step 7: Update Vite Config for Locale Loading

**File:** `apps/dashboard/vite.config.ts`

```typescript
export default defineConfig({
  // ... existing config

  // Ensure locale files are served from public
  publicDir: 'public',

  build: {
    rollupOptions: {
      output: {
        // Keep locale files separate for caching
        manualChunks: {
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
```

**Move locales to public folder:**
```
apps/dashboard/public/locales/
├── en/
│   ├── common.json
│   ├── settings.json
│   └── ...
├── es/
├── ar/
└── ...
```

---

## File Changes Summary

### New Files
```
apps/dashboard/src/hooks/useNamespacedTranslation.ts
apps/dashboard/src/components/I18nSuspense.tsx
scripts/split-locales.ts
```

### Modified Files
```
apps/dashboard/src/i18n.ts                    # Namespace configuration
apps/dashboard/vite.config.ts                 # Public folder config
apps/dashboard/src/pages/**/*.tsx             # Update useTranslation calls
apps/dashboard/src/components/**/*.tsx        # Update useTranslation calls
```

### Restructured Files
```
apps/dashboard/src/locales/          # Move to public/locales/
  → apps/dashboard/public/locales/

Each language folder:
  common.json (split into)
    → common.json
    → auth.json
    → dashboard.json
    → conversations.json
    → tasks.json
    → guests.json
    → reservations.json
    → settings.json
    → automations.json
    → knowledge.json
```

---

## Acceptance Criteria

- [x] i18next configured with namespace support
- [x] `common.json` split into 10 namespace files per language
- [x] All 6 languages migrated (en, es, ar, hi, ru, zh)
- [x] All namespaces bundled (small enough to include all)
- [x] Existing `t()` calls work without changes (keys still resolve via namespace search)
- [x] No missing translation warnings in console
- [x] Build succeeds with new structure
- [x] TypeScript compiles without errors

---

## Test Cases

### Namespace Loading Test
1. Navigate to Dashboard
2. Verify only `common.json` and `dashboard.json` loaded
3. Navigate to Settings
4. Verify `settings.json` loaded on demand

### Translation Access Test
1. Use `t('title')` in settings page
2. Verify returns "Settings" (not undefined)
3. Use `t('common:buttons.save')`
4. Verify returns "Save"

### Language Switch Test
1. Switch language to Spanish
2. Verify all visible namespaces reload in Spanish
3. Navigate to new page
4. Verify Spanish namespace loads

---

## Estimated Effort

| Step | Hours | Notes |
|------|-------|-------|
| Step 1: i18next config | 1h | Namespace setup |
| Step 2: Create namespace files | 2h | Manual splitting + review |
| Step 3: Hook wrapper | 0.5h | Simple utility |
| Step 4: Suspense boundary | 0.5h | Simple component |
| Step 5: Update components | 4h | ~50 components to update |
| Step 6: Migration script | 1h | Automation helper |
| Step 7: Vite config | 0.5h | Public folder setup |
| Testing | 2h | All languages + pages |
| **Total** | **11-12h** | ~1.5 days |

---

## Benefits After Implementation

| Metric | Before | After |
|--------|--------|-------|
| Tokens to edit settings translations | ~2000 | ~400 |
| Initial bundle size | All translations | Only `common.json` |
| File merge conflicts | High | Low (isolated files) |
| Finding translation keys | Difficult | Easy (scoped) |

---

## Future Enhancements (Out of Scope)

- Translation management UI (edit translations in dashboard)
- Automatic key extraction from code
- Translation coverage reports
- Pluralization rules per language
- ICU message format support

---

## Related

- [Phase 18: Internationalization](phase-18-i18n.md)
- [Phase 20: Smart Automation](phase-20-smart-automation.md)
- [i18next Documentation](https://www.i18next.com/overview/configuration-options)
