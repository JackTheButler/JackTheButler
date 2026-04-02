# Plugin System

> Phase: Planned
> Status: Not Started
> Priority: Medium
> Depends On: [PMS Provider Adapters](./009-pms-providers.md)

## Overview

Jack's integrations (AI providers, messaging channels, PMS adapters) are currently compiled directly into the core codebase. Adding a new integration requires modifying core files, rebuilding the image, and submitting a PR to the main repo. This phase decouples integrations from core so they can be developed, versioned, and distributed independently — as npm packages that operators install and load via a plugin config file — without touching Jack's kernel.

## Goals

1. **Zero core changes for new integrations** — Adding a new PMS, AI provider, or channel requires no modifications to `src/apps/`, only a new package following the plugin interface
2. **Stable public interface** — Plugin authors depend only on `@jack/shared`; core internals are never exposed or imported
3. **Monorepo for official plugins** — Official integrations live as workspace packages (`packages/pms-mews/`), published under `@jack-plugins/` on npm
4. **Community extensibility** — Anyone can publish a `@jack-plugins/pms-xxx` package; operators install it like any npm dependency
5. **No runtime complexity** — Plugins load at startup via `jack.config.ts`; no filesystem scanning, no hot-loading, no sandboxing

---

## Architecture

### Final Structure (after all phases)

```
jack/
├── packages/
│   ├── shared/                  ← @jack/shared — public plugin interface (types only)
│   ├── pms-mews/                ← @jack-plugins/pms-mews
│   ├── pms-cloudbeds/           ← @jack-plugins/pms-cloudbeds
│   ├── ai-anthropic/            ← @jack-plugins/ai-anthropic
│   ├── ai-openai/               ← @jack-plugins/ai-openai
│   ├── ai-ollama/               ← @jack-plugins/ai-ollama
│   ├── channel-whatsapp/        ← @jack-plugins/channel-whatsapp
│   ├── channel-sms/             ← @jack-plugins/channel-sms
│   └── channel-email/           ← @jack-plugins/channel-email
│
├── src/
│   ├── core/                    ← Unchanged
│   ├── apps/
│   │   ├── registry.ts          ← Keep (core concern)
│   │   ├── loader.ts            ← Modified to read jack.config.ts
│   │   ├── instrumentation.ts   ← Keep (needs DB — never moves to shared)
│   │   ├── index.ts             ← Simplified (no concrete impl exports)
│   │   └── tools/               ← Keep (built-in, not plugins)
│   │   # types.ts DELETED — moved to @jack/shared
│   │   # ai/, channels/, pms/ DELETED — moved to packages/
│   └── ...
│
└── jack.config.ts               ← NEW: operator's plugin list
```

### How It Connects (end state)

```
jack.config.ts
  plugins: ['@jack-plugins/pms-mews', '@jack-plugins/ai-anthropic', ...]
        ↓
  AppLoader.discoverApps()
    → await import('@jack-plugins/pms-mews')
    → { manifest } = plugin
    → registry.register(manifest)
        ↓
  Hotel admin configures plugin in dashboard
    → registry.activate(appId, config)
    → core calls createAppLogger(manifest.category, manifest.id)
    → manifest.createAdapter(config, { appLog })   ← context injected
        ↓
  Core kernel: registry.getActivePMSAdapter()
    → works identically — zero change to business logic
```

---

## Core Concepts

### The `PluginContext` Pattern (Critical Design Decision)

`createAppLogger` writes to the database. It lives in `src/apps/instrumentation.ts` and can **never** move to `@jack/shared` (which must be types-only with zero runtime dependencies).

But plugins need an `AppLogger` to satisfy `BaseProvider`. The solution: the registry creates the logger and **injects it** into the plugin factory via a `PluginContext` object.

**`@jack/shared` exports the type:**
```ts
// packages/shared/src/apps.ts
export interface PluginContext {
  appLog: AppLogger;
}

// All manifest factory signatures take a second context argument:
export interface PMSAppManifest extends AppManifest {
  category: 'pms';
  createAdapter: (config: Record<string, unknown>, context: PluginContext) => PMSAdapter;
  features: { reservations: boolean; guests: boolean; rooms: boolean; webhooks?: boolean };
}
```

**`registry.ts` creates the logger and injects it:**
```ts
// src/apps/registry.ts — initialize() method
import { createAppLogger } from './instrumentation.js';

case 'pms': {
  const pmsManifest = manifest as PMSAppManifest;
  const appLog = createAppLogger(manifest.category, manifest.id);
  const adapter = pmsManifest.createAdapter(ext.config, { appLog });
  this.pmsAdapters.set(appId, adapter);
  ext.instance = adapter;
  break;
}
```

**Plugin receives it in the constructor:**
```ts
// packages/pms-mews/src/index.ts
import type { PMSAppManifest, PMSAdapter, BaseProvider, AppLogger, PluginContext } from '@jack/shared';

class MewsAdapter implements PMSAdapter, BaseProvider {
  readonly id = 'pms-mews';
  readonly appLog: AppLogger;

  constructor(config: MewsConfig, context: PluginContext) {
    this.appLog = context.appLog;
    // ...
  }
}

export const manifest: PMSAppManifest = {
  id: 'pms-mews',
  // ...
  createAdapter: (config, context) => new MewsAdapter(config as MewsConfig, context),
};
```

**Plugins never import `createAppLogger`.** They only use the `appLog` they receive. This is the same as how Express middleware receives `req`/`res` rather than constructing them.

---

### Plugin Interface Contract

`@jack/shared` is the **only** import a plugin author ever needs. After Phase 1, it exports:

```ts
// packages/shared/src/index.ts — after Phase 1

// App manifest types (moved from src/apps/types.ts)
export type { AppCategory, ProviderStatus, ConfigFieldType, ConfigField }
export type { AppManifest, AIAppManifest, ChannelAppManifest, PMSAppManifest, ToolAppManifest }
export type { AnyAppManifest, AppInstance, ConnectionTestResult, AppLogger, BaseProvider }
export type { PluginContext }                           // NEW

// Adapter interfaces (re-exported from src/core/interfaces/)
export type { AIProvider, CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse }
export type { ChannelAdapter, InboundMessage, OutboundMessage, SendResult }
export type { PMSAdapter, NormalizedReservation, NormalizedGuest, NormalizedRoom, PMSEvent, ReservationQuery }

// Open IntegrationSource (Phase 4)
export type { IntegrationSource }
export { IntegrationSources }

// Existing exports (unchanged)
export { PERMISSIONS, WILDCARD_PERMISSION }
export type { Permission, ConversationState, ChannelType, TaskStatus, TaskPriority, ReservationStatus }
```

The core adapter interfaces (`AIProvider`, `PMSAdapter`, `ChannelAdapter`) are **re-exported** from `@jack/shared` in Phase 1 — they stay in `src/core/interfaces/` but become accessible via `@jack/shared` so plugin authors can type their implementations without importing from core.

---

### Plugin Config File

`jack.config.ts` is a **deployment-time** decision. Whoever sets up the Jack instance decides which plugins are installed. This is separate from **runtime configuration** (credentials, enabled/disabled) which hotel admins manage in the dashboard.

```ts
// jack.config.ts (repo root)
import type { JackConfig } from '@jack/shared';

export default {
  plugins: [
    '@jack-plugins/ai-anthropic',
    '@jack-plugins/ai-openai',
    '@jack-plugins/ai-ollama',
    '@jack-plugins/channel-whatsapp',
    '@jack-plugins/channel-sms',
    '@jack-plugins/channel-email',
    '@jack-plugins/pms-mews',
    '@jack-plugins/pms-cloudbeds',
  ],
} satisfies JackConfig;
```

`AppLoader.discoverApps()` reads this and dynamically imports each plugin:
```ts
async discoverApps(): Promise<AnyAppManifest[]> {
  const { default: config } = await import('../../jack.config.js');
  const manifests: AnyAppManifest[] = [];
  for (const pluginPath of config.plugins) {
    const plugin = await import(pluginPath);
    this.registry.register(plugin.manifest);
    manifests.push(plugin.manifest);
  }
  // Always include built-in tools (not plugins)
  for (const manifest of getToolManifests()) {
    this.registry.register(manifest);
  }
  return manifests;
}
```

---

### Open `IntegrationSource` Type

Currently a closed union — every new PMS needs a core change:
```ts
// BEFORE (src/core/interfaces/pms.ts)
type IntegrationSource = 'mews' | 'cloudbeds' | 'opera' | 'apaleo' | 'protel' | 'manual' | 'mock';
```

After Phase 4, open string with well-known constants:
```ts
// AFTER (@jack/shared)
export type IntegrationSource = string;

export const IntegrationSources = {
  MEWS: 'mews',
  CLOUDBEDS: 'cloudbeds',
  OPERA: 'opera',
  APALEO: 'apaleo',
  PROTEL: 'protel',
  MANUAL: 'manual',
  MOCK: 'mock',
} as const;
```

Community PMS plugins use any string (e.g. `'pms-mypms'`). Existing code branching on `IntegrationSource` values keeps working — it just needs a `default` case in any `switch` statements.

---

## What's NOT in Scope (Future)

- **Plugin marketplace UI** — A dashboard screen to browse, install, and update plugins without editing `jack.config.ts`. Separate, later feature.
- **Runtime plugin install without restart** — True hot-loading while Jack is running. A restart is required after modifying `jack.config.ts`.
- **Plugin sandboxing** — Isolating plugin code from core memory. Plugins run in the same Node.js process, trusted the same way npm dependencies are trusted.
- **Cross-language plugins** — HTTP sidecar services. Overkill at current scale.
- **Separate repos for official plugins** — Official plugins stay in the monorepo until contributor volume demands otherwise.

---

## Implementation Phases

Each phase ends with a full verification (`pnpm typecheck && pnpm test && pnpm build`). Do not proceed to the next phase until verification passes.

---

### Phase 1: Shared Interface Package

**Goal:** All plugin-facing types live in `@jack/shared` so a plugin author's only import is `@jack/shared` and they never touch core internals.

#### Step 1.1 — Create `packages/shared/src/apps.ts`

Create this new file. Copy the **full contents** of `src/apps/types.ts` into it, then make these changes:
- Remove all imports (the file must have zero imports — `@jack/shared` is types-only)
- Add `PluginContext` interface after `AppLogger`:
  ```ts
  export interface PluginContext {
    appLog: AppLogger;
  }
  ```
- Update all three manifest factory signatures to accept context as second arg:
  ```ts
  // AIAppManifest
  createProvider: (config: Record<string, unknown>, context: PluginContext) => AIProvider;

  // ChannelAppManifest
  createAdapter: (config: Record<string, unknown>, context: PluginContext) => ChannelAdapter;

  // PMSAppManifest
  createAdapter: (config: Record<string, unknown>, context: PluginContext) => PMSAdapter;
  ```
- The `AIProvider`, `ChannelAdapter`, `PMSAdapter` types referenced in the manifest interfaces are not yet in scope here — use `unknown` as a temporary placeholder or add forward-reference imports from `@jack/shared`'s own files once they exist (see Step 1.2).

#### Step 1.2 — Re-export core adapter interfaces from `@jack/shared`

Add to `packages/shared/src/index.ts`:
```ts
// Re-export adapter interfaces so plugins can type their implementations
// without importing from core internals
export type {
  AIProvider,
  CompletionRequest, CompletionResponse, CompletionMessage,
  EmbeddingRequest, EmbeddingResponse,
  TokenUsage, MessageRole, ModelTier,
} from '../../src/core/interfaces/ai.js';

export type {
  ChannelAdapter,
  InboundMessage, OutboundMessage, SendResult,
} from '../../src/core/interfaces/channel.js';

export type {
  PMSAdapter, PMSEvent, PMSEventType,
  NormalizedReservation, NormalizedGuest, NormalizedRoom,
  GuestPreference, ReservationQuery, RoomStatus,
  IntegrationSource, PMSConfig, SyncResult,
} from '../../src/core/interfaces/pms.js';
```

> **Note:** These are path-relative re-exports from `packages/shared/` to `src/core/`. This works in the monorepo during development. In a future npm publish, `@jack/shared` would bundle these types. Using `export type` (type-only) ensures zero runtime impact.

Also add to `packages/shared/src/index.ts`:
```ts
export * from './apps.js';
```

#### Step 1.3 — Update `packages/shared/tsconfig.json`

Ensure it includes `src/apps.ts` and can resolve the relative re-exports:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*"]
}
```
The relative imports to `../../src/core/` work because `tsconfig.json` at the root includes `paths` for `@/`. Verify with `pnpm --filter @jack/shared typecheck`.

#### Step 1.4 — Update `src/apps/types.ts`

Replace the entire file with re-exports from `@jack/shared`:
```ts
// src/apps/types.ts
// All app types have moved to @jack/shared.
// This file exists only for backwards-compatible imports within src/.
export type {
  AppCategory, ProviderStatus, ConfigFieldType, ConfigField,
  AppManifest, AIAppManifest, ChannelAppManifest, PMSAppManifest, ToolAppManifest,
  AnyAppManifest, AppInstance, ConnectionTestResult, AppLogger, BaseProvider,
  PluginContext,
} from '@jack/shared';
```
All existing `import ... from './types.js'` in `src/apps/` continue to work unchanged. No other files need touching in this step.

#### Step 1.5 — Update `registry.ts` to inject `PluginContext`

In `src/apps/registry.ts`, update the `initialize()` method to import `createAppLogger` and inject context into each factory call:

```ts
import { createAppLogger } from './instrumentation.js';
import type { PluginContext } from '@jack/shared';
```

Update the `switch` in `initialize()`:
```ts
case 'ai': {
  const aiManifest = manifest as AIAppManifest;
  const appLog = createAppLogger(manifest.category, manifest.id);
  const provider = aiManifest.createProvider(ext.config, { appLog });
  this.aiProviders.set(appId, provider);
  ext.instance = provider;
  break;
}
case 'channel': {
  const channelManifest = manifest as ChannelAppManifest;
  const appLog = createAppLogger(manifest.category, manifest.id);
  const adapter = channelManifest.createAdapter(ext.config, { appLog });
  this.channelAdapters.set(appId, adapter);
  ext.instance = adapter;
  break;
}
case 'pms': {
  const pmsManifest = manifest as PMSAppManifest;
  const appLog = createAppLogger(manifest.category, manifest.id);
  const adapter = pmsManifest.createAdapter(ext.config, { appLog });
  this.pmsAdapters.set(appId, adapter);
  ext.instance = adapter;
  break;
}
```

#### Step 1.6 — Update all existing adapters to accept `PluginContext`

Every existing adapter's manifest factory and constructor needs updating. Pattern for each:

```ts
// Before:
export const manifest: PMSAppManifest = {
  createAdapter: (config) => new MewsAdapter(config as MewsConfig),
};

class MewsAdapter implements PMSAdapter {
  readonly appLog = createAppLogger(manifest.category, manifest.id);
  // ...
}

// After:
import type { PluginContext, AppLogger } from '@jack/shared';

export const manifest: PMSAppManifest = {
  createAdapter: (config, context) => new MewsAdapter(config as MewsConfig, context),
};

class MewsAdapter implements PMSAdapter {
  readonly appLog: AppLogger;
  constructor(config: MewsConfig, context: PluginContext) {
    this.appLog = context.appLog;
    // ... rest of constructor
  }
}
```

Adapters to update (all files in `src/apps/`):
- `src/apps/ai/providers/anthropic.ts`
- `src/apps/ai/providers/openai.ts`
- `src/apps/ai/providers/ollama.ts`
- `src/apps/ai/providers/local.ts`
- `src/apps/channels/whatsapp/meta.ts`
- `src/apps/channels/sms/twilio.ts`
- `src/apps/channels/email/smtp.ts`
- `src/apps/pms/providers/mock.ts`
- `src/apps/pms/providers/mews.ts`
- `src/apps/pms/providers/cloudbeds.ts`

> **Pitfall:** The webchat channel adapter may not have a constructor — check if it needs updating. Tools don't use `createAppLogger` via `PluginContext` since they have no manifest factory; skip them.

#### Step 1.7 — Remove direct `createAppLogger` calls from adapters

After Step 1.6, adapters no longer call `createAppLogger` directly. Remove the import of `createAppLogger` from each adapter file. Run `pnpm typecheck` — any remaining direct usage will show as "unused import" or missing symbol.

#### Verify Phase 1

```bash
pnpm --filter @jack/shared build
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass. If typecheck fails on a factory signature mismatch, a manifest `createAdapter` is still using the old single-argument signature.

---

### Phase 2: Plugin Config File

**Goal:** Core discovers plugins from `jack.config.ts` instead of a hardcoded static `allManifests`. The `allManifests` static registry is deleted.

#### Step 2.1 — Add `JackConfig` to `@jack/shared`

Add to `packages/shared/src/apps.ts`:
```ts
export interface JackConfig {
  /**
   * List of plugin package names or local paths to load at startup.
   * Each must export a { manifest } object conforming to AnyAppManifest.
   * Example: '@jack-plugins/pms-mews' or './packages/pms-mews/src/index.js'
   */
  plugins: string[];
}
```

#### Step 2.2 — Create `jack.config.ts` at repo root

```ts
// jack.config.ts
import type { JackConfig } from '@jack/shared';

export default {
  plugins: [
    // AI Providers
    '@jack-plugins/ai-anthropic',
    '@jack-plugins/ai-openai',
    '@jack-plugins/ai-ollama',
    // Channels
    '@jack-plugins/channel-whatsapp',
    '@jack-plugins/channel-sms',
    '@jack-plugins/channel-email',
    // PMS
    '@jack-plugins/pms-mock',
    '@jack-plugins/pms-mews',
    '@jack-plugins/pms-cloudbeds',
  ],
} satisfies JackConfig;
```

> **Note:** At this point these package names don't exist yet — they will be wired up in Phase 3. For now keep the existing `allManifests` static import as a fallback so Phase 2 doesn't break the app. The loader will prefer `jack.config.ts` when it exists.

#### Step 2.3 — Update `AppLoader.discoverApps()`

Replace the body of `discoverApps()` in `src/apps/loader.ts`:

```ts
async discoverApps(categories?: AppCategory[]): Promise<AnyAppManifest[]> {
  let manifests: AnyAppManifest[];

  try {
    // Try loading from jack.config.ts first
    const { default: config } = await import('../../jack.config.js') as { default: JackConfig };
    manifests = [];
    for (const pluginPath of config.plugins) {
      try {
        const plugin = await import(pluginPath) as { manifest: AnyAppManifest };
        manifests.push(plugin.manifest);
      } catch (err) {
        log.warn({ pluginPath, err }, 'Failed to load plugin — skipping');
      }
    }
    log.info({ count: manifests.length }, 'Plugins loaded from jack.config.ts');
  } catch {
    // jack.config.ts not found — fall back to static manifests (transition period)
    log.warn('jack.config.ts not found, falling back to built-in manifests');
    manifests = getAllManifests();
  }

  // Always include built-in tool manifests (tools are not plugins)
  for (const toolManifest of getToolManifests()) {
    manifests.push(toolManifest);
  }

  const filtered = categories
    ? manifests.filter((m) => categories.includes(m.category))
    : manifests;

  this.registry.registerAll(filtered);
  log.info({ count: filtered.length }, 'Apps discovered and registered');
  return filtered;
}
```

Import `JackConfig` and `getToolManifests` at the top of `loader.ts`.

#### Step 2.4 — Make `discoverApps` async

The method signature changes from `discoverApps(categories?: AppCategory[]): AnyAppManifest[]` to `async discoverApps(categories?: AppCategory[]): Promise<AnyAppManifest[]>`.

Update all callers. Search for `discoverApps` in the codebase:
```bash
grep -r "discoverApps" src/
```
Update each call site to `await loader.discoverApps(...)`.

#### Verify Phase 2

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm dev  # start the server — verify apps still load correctly
```

At this point `jack.config.ts` exists but the `@jack-plugins/*` packages don't yet — the fallback to `getAllManifests()` kicks in. The app should behave identically to before.

---

### Phase 3: Extract Integrations to Workspace Packages

**Goal:** Each integration lives in `packages/xxx/` with its own `package.json`, imports only from `@jack/shared`, and has no knowledge of core internals. The `src/apps/ai/`, `src/apps/channels/`, and `src/apps/pms/` directories are deleted.

Extract in this order. Complete one extraction fully (including verification) before starting the next.

**Order:** pms-mock → pms-mews → pms-cloudbeds → ai-anthropic → ai-openai → ai-ollama → channel-whatsapp → channel-sms → channel-email

> The Local AI provider (`src/apps/ai/providers/local.ts`) stays in `src/` — it depends on `@xenova/transformers` which is a heavy optional dependency managed separately. It is not extracted.

---

#### Template: How to Extract One Package

Use `pms-mews` as the example. Apply the same pattern for each.

**A. Create the package directory structure:**
```
packages/pms-mews/
├── src/
│   └── index.ts       ← move adapter code here
├── package.json
└── tsconfig.json
```

**B. `package.json` template:**
```json
{
  "name": "@jack-plugins/pms-mews",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@jack/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

If the adapter has external npm dependencies (e.g. Mews SDK, axios), add them to `dependencies` here, not in the root `package.json`.

**C. `tsconfig.json` template:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

**D. `src/index.ts` — copy from `src/apps/pms/providers/mews.ts`:**
- Remove import of `createAppLogger` (already done in Phase 1)
- Change any `@/` internal imports to only `@jack/shared` imports
- Verify the adapter class only uses `AppLogger`, `PluginContext`, and types from `@jack/shared`
- Export the manifest as a named export AND as default:
  ```ts
  export { manifest };          // named — for explicit imports
  export default { manifest };  // default — for jack.config.ts dynamic import
  ```

**E. Update `pnpm-workspace.yaml`** to include the new package:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```
(If already using `packages/*` glob, no change needed — pnpm auto-discovers.)

**F. Update `jack.config.ts`** to point to the new workspace package name (e.g. `@jack-plugins/pms-mews`). Since it's a workspace package, pnpm resolves it locally.

**G. Add to root `tsconfig.json` references array:**
```json
{ "path": "packages/pms-mews" }
```

**H. Delete the old source file:**
- Delete `src/apps/pms/providers/mews.ts`
- Update `src/apps/pms/providers/index.ts` to remove the Mews export
- Update `src/apps/pms/index.ts` to remove the Mews manifest from `pmsManifests`
- Update `src/apps/index.ts` to remove Mews exports

**I. Install and verify:**
```bash
pnpm install                              # links the new workspace package
pnpm --filter @jack-plugins/pms-mews build
pnpm typecheck
pnpm test
pnpm build
```

---

#### After All Extractions

Once all providers are extracted:

1. **Delete empty directories**: `src/apps/ai/`, `src/apps/channels/pms/providers/`
2. **Clean up `src/apps/index.ts`**: Remove all provider/adapter class exports. It should only export:
   - Registry and Loader
   - `getToolManifests()` (tools stay)
   - `getAllManifests()` (now reads from the loaded registry, not static imports)
3. **Delete `src/apps/pms/providers/index.ts`** and `src/apps/pms/index.ts` if they become empty re-export files
4. **Update `allManifests` fallback** in `loader.ts`: the fallback path calls `getAllManifests()` which now returns only tool manifests (since all others are gone). Remove the fallback entirely and throw if `jack.config.ts` is not found.

#### Verify Phase 3

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev  # verify all apps load, configure, and connect correctly
```

---

### Phase 4: Open `IntegrationSource` Type

**Goal:** Community PMS plugins can declare any string as their `IntegrationSource` without a core change.

#### Step 4.1 — Update `src/core/interfaces/pms.ts`

```ts
// Before
export type IntegrationSource = 'mews' | 'cloudbeds' | 'opera' | 'apaleo' | 'protel' | 'manual' | 'mock';

// After
export type IntegrationSource = string;

export const IntegrationSources = {
  MEWS: 'mews',
  CLOUDBEDS: 'cloudbeds',
  OPERA: 'opera',
  APALEO: 'apaleo',
  PROTEL: 'protel',
  MANUAL: 'manual',
  MOCK: 'mock',
} as const;
```

#### Step 4.2 — Audit switch statements

Search for any `switch` or `if/else` branching on `IntegrationSource` values:
```bash
grep -r "IntegrationSource\|\.source ===\|\.provider ===" src/
```

For every `switch (x.source)` that doesn't have a `default` case, add one:
```ts
default:
  log.warn({ source: x.source }, 'Unknown integration source — skipping');
  break;
```

#### Step 4.3 — Update `@jack/shared` re-exports

Add `IntegrationSources` to the re-export in `packages/shared/src/index.ts`:
```ts
export type { IntegrationSource } from '../../src/core/interfaces/pms.js';
export { IntegrationSources } from '../../src/core/interfaces/pms.js';
```

#### Verify Phase 4

```bash
pnpm typecheck
pnpm test
```

TypeScript should no longer complain about string assignments to `IntegrationSource`. Existing string literal usages like `'mews'` still work — they are valid `string` values.

---

### Phase 5: Community Plugin Documentation

**Goal:** An external developer can build and publish a working `@jack-plugins/xxx` package in under an hour.

#### Step 5.1 — Write `docs/05-operations/plugin-authoring.md`

Cover:
- Prerequisites: `@jack/shared` installed as a peer dependency
- Required exports: `manifest` (named) and `default { manifest }` (default)
- Manifest interface reference (link to `@jack/shared` types)
- `PluginContext` — what it provides, how to use `appLog`
- The `BaseProvider` contract — why `readonly appLog: AppLogger` is required
- Instrumentation rules from CLAUDE.md (wrap every outbound call)
- `jack.config.ts` registration
- Verification checklist (from CLAUDE.md After Writing Code section)
- Full annotated example (a minimal PMS adapter)

#### Step 5.2 — Publish `@jack/shared` to npm

Update `packages/shared/package.json`:
```json
{
  "name": "@jack/shared",
  "version": "1.0.0",
  "publishConfig": { "access": "public" }
}
```

Add `"prepare": "tsc"` script back (removed during Docker fixes — now safe since `src/` is present at publish time).

Publish: `pnpm --filter @jack/shared publish`.

#### Step 5.3 — Create plugin starter template

Create `packages/plugin-starter/` as a minimal working example:
```
packages/plugin-starter/
├── src/
│   └── index.ts     ← annotated template adapter
├── package.json
├── tsconfig.json
└── README.md        ← authoring guide quickstart
```

#### Verify Phase 5

Clone `plugin-starter` to a temp directory outside the repo, run `pnpm install` (pulling `@jack/shared` from npm), implement the required exports, add it to a local `jack.config.ts`, and verify it loads. This is the acceptance test that the plugin contract is truly self-contained.

---

## Related Documents

- [PMS Provider Adapters](./009-pms-providers.md) — The integrations being extracted into plugins
- [PMS Adapter: Cloudbeds](./012-pms-cloudbeds.md) — First integration extracted in Phase 3
- [System Health Dashboard](./011-system-health-dashboard.md) — Depends on `createAppLogger(manifest.category, manifest.id)` — the `PluginContext` pattern preserves this contract
- [Architecture](../03-architecture/index.md) — Kernel/adapter separation this phase formalises
