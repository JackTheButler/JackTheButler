# Phase 18: Internationalization (i18n)

**Focus:** Add multi-language support to the dashboard
**Risk:** Low
**Depends on:** Phase 14 (Dashboard complete)
**Status:** IN PROGRESS

---

## Problem Statement

1. **All UI text is hardcoded in English** - no way to support other languages
2. **Date/time formatting uses hardcoded locale** - `'en-US'` in all formatters
3. **Hotels operate globally** - staff may need UI in their local language
4. **Guest-facing features** (future) will need localization

---

## Solution Overview

1. Add **react-i18next** for translation management
2. Create **namespace-based translation files** (`common`, `pages`, `config`)
3. **Locale-aware formatters** for dates, times, numbers
4. **Incremental migration** - one page at a time
5. **Language persistence** via localStorage

---

## Scope Analysis

### Current State

| Metric | Value |
|--------|-------|
| Total TSX files | 58 |
| Files with text | ~50 (86%) |
| Estimated strings | 350-400 |
| Config strings | 129 |
| Formatter functions | 6 (all hardcoded to 'en-US') |

### Complexity Areas

| Area | Difficulty | Notes |
|------|------------|-------|
| Basic string extraction | Easy | Straightforward patterns |
| `config.ts` labels | Easy | 129 strings, simple structure |
| `formatters.ts` | Medium | Date/time locale handling |
| Pluralization | Medium | "5 messages", "1 task" patterns |
| Dynamic templates | Medium | Complex tooltip strings |

---

## Implementation Plan

### Phase 18.1: Foundation (Current)

**Goal:** Set up i18n infrastructure and migrate 1 page for review

**Files to Create:**
```
apps/dashboard/
├── src/
│   ├── lib/
│   │   └── i18n.ts              # i18next configuration
│   └── locales/
│       ├── en/
│       │   └── common.json      # English translations
│       └── es/
│           └── common.json      # Spanish translations (example)
```

**Files to Modify:**
- `src/main.tsx` - Initialize i18n
- `src/pages/Login.tsx` - First page migration
- `src/lib/formatters.ts` - Add locale parameter

**Deliverables:**
- [x] i18next configured and initialized
- [x] Translation file structure established
- [x] Login page fully translated
- [x] Language can be switched (for testing)
- [ ] Review structure before expanding

---

### Phase 18.2: Core Infrastructure

**Goal:** Migrate formatters and config

**Files to Modify:**
- `src/lib/formatters.ts` - Locale-aware formatting
- `src/lib/config.ts` - Extract filter labels
- `src/components/layout/Layout.tsx` - Navigation labels

**Deliverables:**
- [ ] All date/time formatters support locales
- [ ] Relative time strings translated ("Just now", "5m ago")
- [ ] Navigation fully translated
- [ ] Config labels use i18n

---

### Phase 18.3: Page Migration

**Goal:** Migrate all pages incrementally

**Priority Order:**
1. Home page
2. Tasks page
3. Approvals page
4. Guests pages
5. Reservations pages
6. Settings pages
7. Tools pages
8. Inbox/Conversations

**Deliverables:**
- [ ] All pages using `useTranslation()` hook
- [ ] No hardcoded user-facing strings
- [ ] Pluralization working correctly

---

### Phase 18.4: Polish

**Goal:** Complete i18n implementation

**Deliverables:**
- [ ] Language switcher in settings
- [ ] Language persisted to user preferences
- [ ] RTL support (if needed)
- [ ] At least 2 complete translations (en, es)
- [ ] Documentation for adding new languages

---

## Technical Design

### i18n Configuration

```typescript
// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from '@/locales/en/common.json';
import esCommon from '@/locales/es/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      es: { common: esCommon },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

### Translation File Structure

```json
// locales/en/common.json
{
  "nav": {
    "home": "Home",
    "inbox": "Inbox",
    "tasks": "Tasks"
  },
  "auth": {
    "signIn": "Sign In",
    "email": "Email",
    "password": "Password",
    "rememberMe": "Remember me"
  },
  "time": {
    "justNow": "Just now",
    "minutesAgo": "{{count}}m ago",
    "hoursAgo": "{{count}}h ago",
    "daysAgo": "{{count}}d ago"
  },
  "filters": {
    "all": "All",
    "pending": "Pending",
    "completed": "Completed"
  }
}
```

### Usage Pattern

```typescript
// In components
import { useTranslation } from 'react-i18next';

function LoginPage() {
  const { t } = useTranslation();

  return (
    <Button>{t('auth.signIn')}</Button>
  );
}
```

### Locale-Aware Formatters

```typescript
// src/lib/formatters.ts
export function formatDate(dateStr: string, locale = 'en-US'): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeAgo(dateStr: string, t: TFunction): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) return t('time.justNow');
  if (seconds < 3600) return t('time.minutesAgo', { count: Math.floor(seconds / 60) });
  // ...
}
```

---

## Dependencies

```json
{
  "i18next": "^23.x",
  "react-i18next": "^14.x",
  "i18next-browser-languagedetector": "^7.x"
}
```

---

## Acceptance Criteria

### Phase 18.1 (Foundation)
- [ ] `pnpm dev` works with i18n initialized
- [ ] Login page displays correctly in English
- [ ] Changing language updates Login page text
- [ ] Translation files are well-organized
- [ ] No TypeScript errors

### Phase 18.2 (Core)
- [ ] All formatters accept locale parameter
- [ ] Navigation labels translated
- [ ] Filter labels translated

### Phase 18.3 (Pages)
- [ ] All pages use `useTranslation()`
- [ ] No hardcoded strings visible in UI

### Phase 18.4 (Polish)
- [ ] Language switcher available
- [ ] At least 2 complete translations
- [ ] Documentation complete

---

## Estimated Effort

| Phase | Hours | Notes |
|-------|-------|-------|
| 18.1: Foundation | 3-4h | Setup + Login page |
| 18.2: Core | 6-8h | Formatters + config |
| 18.3: Pages | 16-20h | All pages migration |
| 18.4: Polish | 4-6h | Switcher + docs |
| **Total** | **29-38h** | ~4-5 days |

---

## Related

- [Phase 14: Real-Time Dashboard](phase-14-realtime.md)
- [Dashboard Documentation](../../apps/dashboard/DASHBOARD.md)
