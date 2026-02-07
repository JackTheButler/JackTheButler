# Reusable Assistant System Architecture

> Phase: Complete
> Status: All Phases Complete (8A, 8B, 8C, 8D)
> Priority: Medium
> Depends On: [AI Assistant Framework](./001-ai-assistant-framework.md) Phase 1-4

## Overview

Build a **reusable assistant system** that can power multiple guided workflows across the application. The setup wizard becomes the first consumer of this system, with the same infrastructure supporting future assistants like channel setup, knowledge import, and contextual help.

## Goals

1. **Reusable Foundation** - One assistant system, many use cases
2. **Multiple Render Modes** - Fullscreen, popup, embedded, floating
3. **Trigger System** - Activate assistants by page, error, or user action
4. **Maintainability** - Each assistant's steps in focused files
5. **Extensibility** - Add new assistants without modifying core
6. **Type Safety** - Strong interfaces for configuration

## Problem Statement

### Current State

The setup wizard is implemented as a monolithic component:

| Issue | Details |
|-------|---------|
| **Monolithic component** | `Setup.tsx` is 1072 lines with all logic inline |
| **Not reusable** | Can't use same patterns for other assistants |
| **Hardcoded steps** | `ChatStep` is a union of 15+ string literals |
| **No render modes** | Only supports fullscreen |
| **Tight coupling** | Steps can't be tested in isolation |

### Current File Structure

```
apps/dashboard/src/
├── pages/
│   └── Setup.tsx                    # 1072 lines - ALL setup logic
├── components/setup/
│   ├── BootstrapScreen.tsx          # UI only
│   ├── ChatInterface.tsx            # UI only
│   ├── FormCard.tsx                 # Basic form, no validation patterns
│   └── ...                          # More UI components
└── hooks/
    └── useChatFlow.ts               # Message management only
```

---

## Target Architecture

### End-Game File Structure

```
apps/dashboard/src/
│
├── shared/
│   ├── assistant/                   # REUSABLE ASSISTANT SYSTEM
│   │   ├── index.ts                 # Public exports
│   │   ├── types.ts                 # AssistantConfig, StepConfig, RenderMode
│   │   ├── registry.ts              # AssistantRegistry (global)
│   │   ├── context.tsx              # AssistantProvider, useAssistant()
│   │   │
│   │   ├── components/
│   │   │   ├── AssistantContainer.tsx    # Orchestrates any assistant
│   │   │   ├── AssistantFullscreen.tsx   # Full page layout
│   │   │   ├── AssistantPopup.tsx        # Modal dialog
│   │   │   ├── AssistantEmbedded.tsx     # Inline in page
│   │   │   ├── AssistantFloating.tsx     # Floating panel
│   │   │   └── AssistantTrigger.tsx      # Activation button
│   │   │
│   │   └── hooks/
│   │       ├── useAssistantFlow.ts       # Step orchestration
│   │       └── useAssistantApi.ts        # Common API patterns
│   │
│   └── forms/                       # REUSABLE FORM SYSTEM
│       ├── types.ts                 # FormSchema, FormField, Validation
│       ├── FormRenderer.tsx         # Renders any FormSchema
│       ├── validators.ts            # Validation functions
│       └── index.ts
│
├── features/
│   ├── setup/                       # SETUP WIZARD (first consumer)
│   │   ├── index.ts
│   │   ├── config.ts                # AssistantConfig for setup
│   │   ├── types.ts                 # SetupContext, SetupStep
│   │   ├── api.ts                   # Setup-specific API calls
│   │   └── steps/
│   │       ├── index.ts             # Registers all steps
│   │       ├── bootstrap.tsx        # ~50 lines
│   │       ├── property-info.tsx    # ~100 lines
│   │       ├── ai-provider.tsx      # ~150 lines
│   │       ├── knowledge.tsx        # ~200 lines
│   │       └── admin-account.tsx    # ~80 lines
│   │
│   ├── channel-setup/               # FUTURE: Channel setup assistant
│   │   ├── config.ts
│   │   └── steps/
│   │       ├── whatsapp.tsx
│   │       ├── twilio-sms.tsx
│   │       └── email.tsx
│   │
│   ├── knowledge-import/            # FUTURE: Knowledge import assistant
│   │   ├── config.ts
│   │   └── steps/...
│   │
│   └── help/                        # FUTURE: Contextual help assistant
│       ├── config.ts
│       └── steps/...
│
└── pages/
    └── Setup.tsx                    # ~30 lines - just renders assistant
```

---

## Core Interfaces

### Assistant Configuration

```typescript
// shared/assistant/types.ts

/**
 * How the assistant is rendered
 */
export type RenderMode =
  | 'fullscreen'   // Full page (setup wizard)
  | 'popup'        // Modal dialog (channel setup)
  | 'embedded'     // Inline in page (knowledge import)
  | 'floating';    // Floating panel (contextual help)

/**
 * When to suggest or auto-activate an assistant
 */
export interface TriggerConfig {
  /** Activate on these page paths */
  pages?: string[];

  /** Activate when these errors occur */
  errorCodes?: string[];

  /** Keyword phrases that activate via search/command */
  keywords?: string[];

  /** Custom activation condition */
  condition?: () => boolean;

  /** Auto-activate vs show suggestion */
  autoActivate?: boolean;
}

/**
 * Configuration for an assistant
 */
export interface AssistantConfig<TContext = Record<string, unknown>> {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** How to render this assistant */
  renderMode: RenderMode;

  /** Steps in this assistant */
  steps: StepConfig<TContext>[];

  /** When to show/activate this assistant */
  triggers?: TriggerConfig;

  /** Create initial context */
  getInitialContext?: () => TContext;

  /** Called when assistant completes */
  onComplete?: (context: TContext) => Promise<void>;

  /** API base path for this assistant */
  apiBasePath?: string;
}
```

### Step Configuration

```typescript
// shared/assistant/types.ts (continued)

/**
 * Configuration for a single step
 */
export interface StepConfig<TContext = Record<string, unknown>> {
  /** Unique step identifier */
  id: string;

  /** Position in progress indicator (1-based) */
  progressIndex: number;

  /** Progress bar label */
  progressLabel?: string;

  /** Determine if this step should be active */
  isActive: (currentStep: string, context: TContext) => boolean;

  /** The step component */
  Component: React.ComponentType<StepProps<TContext>>;

  /** Optional form schema for structured input */
  formSchema?: FormSchema;

  /** Called when entering this step */
  onEnter?: (context: TContext) => Promise<void>;

  /** Called when exiting this step */
  onExit?: (context: TContext) => Promise<void>;

  /** Message shown when resuming at this step */
  resumeMessage?: string | ((context: TContext) => string);
}

/**
 * Props passed to every step component
 */
export interface StepProps<TContext = Record<string, unknown>> {
  /** Current assistant context */
  context: TContext;

  /** Update context */
  updateContext: (updates: Partial<TContext>) => void;

  /** Proceed to next step */
  onNext: (data?: Record<string, unknown>) => Promise<void>;

  /** Go back to previous step */
  onBack?: () => void;

  /** Skip this step */
  onSkip?: () => void;

  /** UI state */
  disabled?: boolean;
  loading?: boolean;

  /** Chat helpers */
  addMessage: (content: string, type?: 'assistant' | 'user') => void;
  showTyping: (status?: string) => void;
  hideTyping: () => void;
}
```

### Assistant Registry

```typescript
// shared/assistant/registry.ts

class AssistantRegistry {
  private assistants = new Map<string, AssistantConfig>();

  /** Register an assistant */
  register<T>(config: AssistantConfig<T>): void {
    this.assistants.set(config.id, config as AssistantConfig);
  }

  /** Get assistant by ID */
  get(id: string): AssistantConfig | undefined {
    return this.assistants.get(id);
  }

  /** Get all registered assistants */
  getAll(): AssistantConfig[] {
    return Array.from(this.assistants.values());
  }

  /** Get assistants that should appear on a page */
  getForPage(pagePath: string): AssistantConfig[] {
    return this.getAll().filter(a =>
      a.triggers?.pages?.some(p =>
        p === '*' || pagePath.startsWith(p)
      )
    );
  }

  /** Get assistant for an error code */
  getForError(errorCode: string): AssistantConfig | undefined {
    return this.getAll().find(a =>
      a.triggers?.errorCodes?.includes(errorCode)
    );
  }

  /** Search assistants by keyword */
  searchByKeyword(query: string): AssistantConfig[] {
    const q = query.toLowerCase();
    return this.getAll().filter(a =>
      a.triggers?.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }
}

export const assistantRegistry = new AssistantRegistry();
```

### useAssistant Hook

```typescript
// shared/assistant/hooks/useAssistant.ts

export function useAssistant() {
  const context = useContext(AssistantContext);

  return {
    /** Currently active assistant */
    active: context.activeAssistant,

    /** Open an assistant */
    open: (assistantId: string, initialContext?: Record<string, unknown>) => {
      const config = assistantRegistry.get(assistantId);
      if (config) {
        context.setActive(config, initialContext);
      }
    },

    /** Close active assistant */
    close: () => context.setActive(null),

    /** Check if an assistant is available for current page */
    getAvailable: () => assistantRegistry.getForPage(location.pathname),

    /** Get suggested assistant based on context */
    getSuggested: () => {
      const available = assistantRegistry.getForPage(location.pathname);
      return available.find(a => a.triggers?.condition?.() ?? true);
    },
  };
}
```

### Form Schema

```typescript
// shared/forms/types.ts

export interface FieldValidation {
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  custom?: (value: string, allValues: Record<string, string>) => string | null;
  message?: string;
}

export interface FormField {
  key: string;
  type: 'text' | 'email' | 'password' | 'url' | 'select' | 'textarea';
  label: string;
  placeholder?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string;
  validation?: FieldValidation;
  showWhen?: (values: Record<string, string>) => boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  skipLabel?: string;
  validate?: (values: Record<string, string>) => Record<string, string>;
}
```

---

## Example: Setup Wizard Configuration

```typescript
// features/setup/config.ts

import { assistantRegistry, type AssistantConfig } from '@/shared/assistant';
import type { SetupContext } from './types';
import {
  BootstrapStep,
  PropertyInfoStep,
  AIProviderStep,
  KnowledgeStep,
  AdminAccountStep,
} from './steps';

export const setupAssistant: AssistantConfig<SetupContext> = {
  id: 'setup',
  name: 'Setup Wizard',
  renderMode: 'fullscreen',
  apiBasePath: '/api/v1/setup',

  getInitialContext: () => ({
    propertyName: '',
    propertyType: undefined,
    aiProvider: undefined,
    aiConfigured: false,
    adminCreated: false,
  }),

  steps: [
    {
      id: 'bootstrap',
      progressIndex: 0,
      progressLabel: 'Start',
      isActive: (step) => step === 'bootstrap',
      Component: BootstrapStep,
    },
    {
      id: 'property',
      progressIndex: 1,
      progressLabel: 'Property',
      isActive: (step) => ['ask_name', 'ask_type'].includes(step),
      Component: PropertyInfoStep,
      resumeMessage: (ctx) => ctx.propertyName
        ? `Welcome back! Let's continue setting up ${ctx.propertyName}.`
        : undefined,
    },
    {
      id: 'ai-provider',
      progressIndex: 2,
      progressLabel: 'AI',
      isActive: (step) => ['ask_ai_provider', 'ask_api_key'].includes(step),
      Component: AIProviderStep,
      formSchema: apiKeyFormSchema,
    },
    {
      id: 'knowledge',
      progressIndex: 3,
      progressLabel: 'Knowledge',
      isActive: (step) => step.startsWith('ask_') && step.includes('knowledge')
        || step === 'scraping' || step === 'show_checklist',
      Component: KnowledgeStep,
    },
    {
      id: 'admin',
      progressIndex: 4,
      progressLabel: 'Account',
      isActive: (step) => step === 'ask_admin',
      Component: AdminAccountStep,
      formSchema: adminFormSchema,
    },
  ],

  onComplete: async (context) => {
    // Redirect to login
    window.location.href = '/login';
  },
};

// Register on import
assistantRegistry.register(setupAssistant);
```

---

## Example: Future Channel Setup Assistant

```typescript
// features/channel-setup/whatsapp/config.ts

import { assistantRegistry, type AssistantConfig } from '@/shared/assistant';

interface WhatsAppContext {
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerified: boolean;
}

export const whatsappAssistant: AssistantConfig<WhatsAppContext> = {
  id: 'whatsapp-setup',
  name: 'WhatsApp Setup',
  renderMode: 'popup',              // Opens as modal
  apiBasePath: '/api/v1/apps/whatsapp',

  triggers: {
    pages: ['settings/channels', 'settings/channels/whatsapp'],
    keywords: ['setup whatsapp', 'connect whatsapp', 'whatsapp'],
    condition: () => !isWhatsAppConfigured(),
  },

  getInitialContext: () => ({
    webhookVerified: false,
  }),

  steps: [
    {
      id: 'intro',
      progressIndex: 1,
      isActive: (step) => step === 'intro',
      Component: WhatsAppIntroStep,
    },
    {
      id: 'credentials',
      progressIndex: 2,
      isActive: (step) => step === 'credentials',
      Component: WhatsAppCredentialsStep,
      formSchema: whatsappCredentialsSchema,
    },
    {
      id: 'webhook',
      progressIndex: 3,
      isActive: (step) => step === 'webhook',
      Component: WhatsAppWebhookStep,
    },
    {
      id: 'test',
      progressIndex: 4,
      isActive: (step) => step === 'test',
      Component: WhatsAppTestStep,
    },
  ],
};

assistantRegistry.register(whatsappAssistant);
```

**Usage in Settings page:**

```typescript
// pages/settings/channels/WhatsAppSettings.tsx

import { useAssistant } from '@/shared/assistant';
import { Button } from '@/components/ui/button';

export function WhatsAppSettings() {
  const { open } = useAssistant();

  return (
    <div>
      <h2>WhatsApp Business</h2>

      {!isConfigured && (
        <Button onClick={() => open('whatsapp-setup')}>
          Set up with Jack
        </Button>
      )}

      {/* Rest of settings UI */}
    </div>
  );
}
```

---

## Example: Floating Help Assistant

```typescript
// features/help/config.ts

import { assistantRegistry, type AssistantConfig } from '@/shared/assistant';

export const helpAssistant: AssistantConfig = {
  id: 'help',
  name: 'Ask Jack',
  renderMode: 'floating',

  triggers: {
    pages: ['*'],  // Available on all pages
  },

  steps: [
    {
      id: 'chat',
      progressIndex: 1,
      isActive: () => true,
      Component: HelpChatStep,  // Free-form chat interface
    },
  ],
};

assistantRegistry.register(helpAssistant);
```

**Usage in app layout:**

```typescript
// layouts/DashboardLayout.tsx

import { AssistantFloating } from '@/shared/assistant';

export function DashboardLayout({ children }) {
  return (
    <div>
      <Sidebar />
      <main>{children}</main>

      {/* Floating help button + panel */}
      <AssistantFloating assistantId="help" position="bottom-right" />
    </div>
  );
}
```

---

## Implementation Phases

### Phase 8A: Extract Setup Step Components ✅

> **Effort:** 1-2 days | **Risk:** Low | **Breaking Changes:** None
> **Status:** Complete

**Goal:** Break the setup monolith into step components without changing architecture.

**Approach:** Used step hooks instead of step components to encapsulate handler logic.

#### Completed

- [x] Create `features/setup/` directory structure
- [x] Create `features/setup/types.ts` - Types and constants (166 lines)
- [x] Create `features/setup/api.ts` - API client functions (189 lines)
- [x] Create `features/setup/utils.ts` - Utility functions (220 lines)
- [x] Create `features/setup/configs.ts` - Step configurations (182 lines)
- [x] Create `features/setup/hooks/` directory
- [x] Create `features/setup/hooks/useBootstrapStep.ts` - Bootstrap handler
- [x] Create `features/setup/hooks/usePropertyStep.ts` - Property info handlers
- [x] Create `features/setup/hooks/useAIProviderStep.ts` - AI provider handlers
- [x] Create `features/setup/hooks/useKnowledgeStep.ts` - Knowledge gathering handlers
- [x] Create `features/setup/hooks/useAdminStep.ts` - Admin creation handler
- [x] Create `features/setup/hooks/index.ts` with exports
- [x] Create `features/setup/index.ts` - Public exports
- [x] Refactor `Setup.tsx` to use hooks (1072 → 406 lines, 62% reduction)
- [x] `pnpm typecheck` passes

#### File Changes

```
New:
  features/setup/types.ts
  features/setup/api.ts
  features/setup/utils.ts
  features/setup/configs.ts
  features/setup/hooks/useBootstrapStep.ts
  features/setup/hooks/usePropertyStep.ts
  features/setup/hooks/useAIProviderStep.ts
  features/setup/hooks/useKnowledgeStep.ts
  features/setup/hooks/useAdminStep.ts
  features/setup/hooks/index.ts
  features/setup/index.ts

Modified:
  pages/Setup.tsx (1072 → 406 lines)
```

#### Verification

- [x] `pnpm typecheck` passes
- [x] All setup functionality preserved
- [x] Resume from each step works
- [x] Skip setup works

---

### Phase 8B: Shared Assistant Foundation ✅

> **Effort:** 2-3 days | **Risk:** Medium | **Breaking Changes:** None
> **Status:** Complete

**Goal:** Create the reusable assistant system in `shared/assistant/`.

#### Completed

- [x] Create `shared/assistant/types.ts`
  - `RenderMode` type
  - `TriggerConfig` interface
  - `AssistantConfig` interface
  - `StepConfig` interface
  - `StepProps` interface
  - `ChatMessage`, `AssistantState`, `AssistantActions`, `AssistantContextValue`
- [x] Create `shared/assistant/registry.ts`
  - `AssistantRegistry` class
  - `register()`, `get()`, `getAll()`, `has()`
  - `getForPage()`, `getForError()`, `searchByKeyword()`, `getAutoActivate()`
  - Export `assistantRegistry` singleton
- [x] Create `shared/assistant/context.tsx`
  - `AssistantContext`
  - `AssistantProvider` component
  - `useAssistantContext()` hook
  - `useAssistant()` hook
- [x] Create `shared/assistant/hooks/useAssistantFlow.ts`
  - Step state management
  - `transitionTo()`, `goBack()`, `goNext()`
  - Lifecycle hook calls (onEnter, onExit)
  - Chat message helpers
  - `getProgress()`, `complete()`, `skip()`
- [x] Create `shared/assistant/components/AssistantContainer.tsx`
  - Renders active step from config
  - Progress indicator support
  - Navigation controls
- [x] Create `shared/assistant/hooks/index.ts` and `components/index.ts`
- [x] Create `shared/assistant/index.ts` exports
- [x] Create `features/setup/assistant-config.ts`
  - Define `setupAssistantConfig`
  - Register with `assistantRegistry`
  - `getInitialSetupContext()`
- [x] Create `features/setup/steps/types.ts`
  - `SetupStepContext` interface
  - `StepUIConfig`, `StepHandlers` interfaces
- [x] Create `features/setup/steps/useSetupSteps.ts`
  - Unified hook for all setup step logic
  - Provides UI config and handlers
- [x] Create `features/setup/SetupAssistant.tsx`
  - Main component using shared assistant system
  - Integrates with ChatInterface
- [x] Migrate `Setup.tsx` to use shared assistant (406 → 21 lines)

#### File Changes

```
New:
  shared/assistant/types.ts
  shared/assistant/registry.ts
  shared/assistant/context.tsx
  shared/assistant/hooks/useAssistantFlow.ts
  shared/assistant/hooks/index.ts
  shared/assistant/components/AssistantContainer.tsx
  shared/assistant/components/index.ts
  shared/assistant/index.ts
  features/setup/assistant-config.ts
  features/setup/SetupAssistant.tsx
  features/setup/steps/types.ts
  features/setup/steps/useSetupSteps.ts
  features/setup/steps/BootstrapStep.tsx
  features/setup/steps/PropertyStep.tsx
  features/setup/steps/index.ts

Modified:
  pages/Setup.tsx (406 → 21 lines)
  features/setup/index.ts (added exports)
```

#### Verification

- [x] `pnpm typecheck` passes
- [x] `assistantRegistry.get('setup')` returns config
- [x] Setup wizard functionality preserved
- [x] Shared assistant infrastructure ready for future use

---

### Phase 8C: Form Schema System ✅

> **Effort:** 2-3 days | **Risk:** Medium | **Breaking Changes:** None
> **Status:** Complete

**Goal:** Create declarative form schemas with validation.

**Approach:** Enhanced existing `FormCard` component to support schema-based validation while maintaining backward compatibility.

#### Completed

- [x] Create `shared/forms/types.ts`
  - `FieldValidation` interface
  - `FormField` interface
  - `FormSchema` interface
  - `FormState`, `FormRenderProps` interfaces
- [x] Create `shared/forms/validators.ts`
  - `validateRequired()`
  - `validatePattern()`
  - `validateMinLength()`, `validateMaxLength()`
  - `validateEmail()`, `validateUrl()`
  - `runFieldValidation()`
  - `runFormValidation()`
  - `hasErrors()`, `patterns` utilities
- [x] Create `shared/forms/FormRenderer.tsx`
  - Renders any `FormSchema`
  - Shows inline validation errors
  - Supports conditional field visibility (`showWhen`)
  - Handles cross-field validation
  - Password visibility toggle
  - `useFormState` hook for external usage
- [x] Create `shared/forms/index.ts` exports
- [x] Create `features/setup/schemas.ts`
  - `getApiKeyFormSchema()` - API key validation
  - `getAdminFormSchema()` - Admin account with password match
  - `getManualEntryFormSchema()` - Knowledge manual entry
- [x] Update `FormCard` to support schema-based validation
  - Added `schema` prop
  - Inline error display on blur
  - Cross-field validation support
  - Password match validation
- [x] Update `useSetupSteps` to pass schemas to forms
- [x] Update `ChatInterface` to pass schema to FormCard

#### File Changes

```
New:
  shared/forms/types.ts
  shared/forms/validators.ts
  shared/forms/FormRenderer.tsx
  shared/forms/index.ts
  features/setup/schemas.ts

Modified:
  components/setup/FormCard.tsx (added schema support)
  components/setup/ChatInterface.tsx (pass schema)
  features/setup/steps/types.ts (FormConfig with schema)
  features/setup/steps/useSetupSteps.ts (use schemas)
  features/setup/index.ts (export schemas)
```

#### Verification

- [x] `pnpm typecheck` passes
- [x] Admin form shows validation errors
- [x] API key form shows validation errors
- [x] Password mismatch validation works
- [x] Email format validation works
- [ ] Unit tests for validators (deferred)

---

### Phase 8D: Render Modes & Polish ✅

> **Effort:** 2 days | **Risk:** Low | **Breaking Changes:** None
> **Status:** Complete

**Goal:** Add support for popup, embedded, and floating render modes.

#### Completed

- [x] Create `shared/assistant/components/AssistantFullscreen.tsx`
  - Full page layout with header
  - Progress indicator
  - Skip button
  - Responsive design
- [x] Create `shared/assistant/components/AssistantPopup.tsx`
  - Modal dialog wrapper
  - Close button and backdrop
  - Keyboard support (Escape to close)
  - Size options (sm, md, lg, xl)
  - Progress indicator support
- [x] Create `shared/assistant/components/AssistantEmbedded.tsx`
  - Inline container
  - Optional border/elevation
  - Progress indicator support
- [x] Create `shared/assistant/components/AssistantFloating.tsx`
  - Floating panel with trigger button
  - Expand/collapse
  - Position options (all four corners)
  - Badge support
  - Smooth animations
- [x] Create `shared/assistant/components/AssistantTrigger.tsx`
  - Button to open an assistant
  - Badge support
  - `AssistantSuggestion` chip component
- [x] Update `shared/assistant/components/index.ts` exports
- [x] Create skeleton configs for future assistants:
  - `features/channel-setup/config.ts` (popup mode)
  - `features/help/config.ts` (floating mode)

#### File Changes

```
New:
  shared/assistant/components/AssistantFullscreen.tsx
  shared/assistant/components/AssistantPopup.tsx
  shared/assistant/components/AssistantEmbedded.tsx
  shared/assistant/components/AssistantFloating.tsx
  shared/assistant/components/AssistantTrigger.tsx
  features/channel-setup/config.ts (skeleton)
  features/help/config.ts (skeleton)

Modified:
  shared/assistant/components/index.ts (exports)
```

#### Verification

- [x] `pnpm typecheck` passes
- [x] All render mode components created
- [x] Skeleton configs ready for future implementation
- [ ] Integration test with actual usage (deferred)

---

## Summary

| Phase | Effort | Risk | Outcome | Status |
|-------|--------|------|---------|--------|
| **8A** | 1-2 days | Low | Step components extracted | ✅ Complete |
| **8B** | 2-3 days | Medium | Reusable assistant system | ✅ Complete |
| **8C** | 2-3 days | Medium | Declarative form validation | ✅ Complete |
| **8D** | 2 days | Low | All render modes supported | ✅ Complete |

**Total Effort:** ~8-10 days
**Status:** All phases complete

---

## Success Criteria

After Phase 8D is complete:

### 1. Adding a New Assistant

Requires only:
```typescript
// features/new-assistant/config.ts
export const newAssistant: AssistantConfig = {
  id: 'new-assistant',
  name: 'New Assistant',
  renderMode: 'popup',  // or 'embedded', 'floating'
  steps: [...],
};

assistantRegistry.register(newAssistant);
```

No changes to shared code.

### 2. Using an Assistant

From any component:
```typescript
const { open } = useAssistant();
<Button onClick={() => open('new-assistant')}>Start</Button>
```

Or with trigger:
```typescript
<AssistantTrigger assistantId="new-assistant" />
```

### 3. Code Metrics

| File | Before | After |
|------|--------|-------|
| `Setup.tsx` | 1072 lines | ~30 lines |
| Each step file | - | 50-200 lines |
| `shared/assistant/` | - | ~500 lines total |
| `shared/forms/` | - | ~300 lines total |

---

## Execution Order

```
Phase 8A ────► Phase 8B ────► Phase 8C ────► Phase 8D
    │              │              │              │
    │              │              │              └─ All render modes
    │              │              │                 Future assistants ready
    │              │              │
    │              │              └─ Form validation
    │              │                 Declarative schemas
    │              │
    │              └─ Reusable system
    │                 Setup uses shared infrastructure
    │
    └─ Step components
       Immediate maintainability
```

**After 8D:** Phase 5 (Channel Configuration) and Phase 6 (Ongoing Help) can use the assistant system directly.

---

## Related Documents

- [AI Assistant Framework](./001-ai-assistant-framework.md) - Parent feature with vision
- [Local Development](../05-operations/local-development.md) - Development setup

---

## Appendix: Render Mode Comparison

| Mode | Use Case | Container | Example |
|------|----------|-----------|---------|
| `fullscreen` | Onboarding, setup | Full page with header | Setup wizard |
| `popup` | Focused task | Modal dialog | WhatsApp setup |
| `embedded` | In-page workflow | Inline container | Knowledge import |
| `floating` | Always available | Floating panel | Ask Jack help |

```
┌─────────────────────────────────────────────────────────────┐
│ FULLSCREEN                                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Header with progress                              [Skip]│ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │                                                         │ │
│ │                    Step Content                         │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Page with POPUP                                              │
│                     ┌───────────────────┐                    │
│                     │ Popup Header   [X]│                    │
│                     ├───────────────────┤                    │
│                     │                   │                    │
│                     │  Step Content     │                    │
│                     │                   │                    │
│                     └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Page with EMBEDDED                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Embedded Assistant                                      │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ Step Content                                        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Other page content...                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Page with FLOATING                                           │
│                                                              │
│ Page content...                                              │
│                                          ┌────────────────┐ │
│                                          │ Floating Panel │ │
│                                          │ ┌────────────┐ │ │
│                                          │ │   Chat     │ │ │
│                                          │ └────────────┘ │ │
│                                          └────────────────┘ │
│                                                      [Jack] │
└─────────────────────────────────────────────────────────────┘
```
