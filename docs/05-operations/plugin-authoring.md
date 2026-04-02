# Plugin Authoring Guide

This guide explains how to build and publish a Jack The Butler plugin — a self-contained npm package that adds a new AI provider, communication channel, or PMS integration without modifying Jack's core.

---

## Prerequisites

- Node.js ≥ 22
- pnpm (or npm/yarn)
- TypeScript ≥ 5.7
- A Jack instance to test against

---

## Concepts

### What is a plugin?

A plugin is an npm package that exports a `manifest` object. Jack's loader imports it at startup, reads the manifest, and registers it in the app registry. The hotel admin then configures and activates it in the dashboard.

### The only import you need

```ts
import type { ... } from '@jack/shared';
```

`@jack/shared` is the complete public interface. **Never import from Jack's `src/` internals.** If you need something that isn't in `@jack/shared`, open an issue.

### Plugin categories

| Category | Interface to implement | Manifest type |
|---|---|---|
| `ai` | `AIProvider` | `AIAppManifest` |
| `channel` | `ChannelAdapter` | `ChannelAppManifest` |
| `pms` | `PMSAdapter` | `PMSAppManifest` |

---

## Quick Start

The `packages/plugin-starter/` directory contains three annotated example files — one per category:

| File | Category | Starting class |
|---|---|---|
| `pms-example.ts` | `pms` | `StarterAdapter` |
| `ai-example.ts` | `ai` | `StarterAIProvider` |
| `channel-example.ts` | `channel` | `StarterChannelAdapter` |

Copy the file that matches your category and use it as your `src/index.ts`:

```bash
# Example: building a new PMS integration
mkdir -p packages/pms-yourpms/src
cp packages/plugin-starter/src/pms-example.ts packages/pms-yourpms/src/index.ts
```

Then:
1. Create `package.json` and `tsconfig.json` in your package directory (see templates below)
2. Update `package.json` — set `name` to `@jack-plugins/pms-yourpms`
3. Replace the starter class with your real implementation
4. Update the `manifest` id, name, and configSchema
5. Add to root `package.json` as `"@jack-plugins/pms-yourpms": "workspace:*"` and run `pnpm install`

---

## Package Structure

```
packages/pms-yourpms/
├── src/
│   └── index.ts        ← copy from plugin-starter/src/pms-example.ts
├── package.json
└── tsconfig.json
```

### `package.json`

```json
{
  "name": "@jack-plugins/pms-yourpms",
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
    "@jack/shared": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

Add any PMS SDK (e.g. `axios`, `yourpms-sdk`) to `dependencies` here.

### `tsconfig.json`

**Inside the monorepo** (workspace package):
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

**Outside the monorepo** (standalone package, `@jack/shared` installed from npm):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

---

## Required Exports

Your `src/index.ts` must export:

```ts
// Named export — required: Jack's loader reads plugin.manifest
export const manifest: PMSAppManifest = { ... };

// Default export — optional, for convenience when manually importing
export default { manifest };
```

Jack's loader auto-discovers all `@jack-plugins/*` packages and does:
```ts
const plugin = await import('@jack-plugins/pms-yourpms');
registry.register(plugin.manifest);
```

If `plugin.manifest` is undefined, the loader logs a warning and skips your plugin.

---

## Typed Config Interface

Define a TypeScript interface that mirrors your `configSchema` fields exactly. This gives you type safety throughout your adapter and makes it clear which fields the code depends on.

```ts
// ✅ Define your own config interface — one field per configSchema entry
export interface YourPMSConfig {
  apiKey: string;
  baseUrl?: string;
  propertyId?: string;
}

// Cast in the factory so the rest of the class is fully typed
export const manifest: PMSAppManifest = {
  createAdapter: (config, context) => new YourAdapter(config as unknown as YourPMSConfig, context),
};
```

```ts
// ❌ Don't read raw config fields without a typed interface
const flat = config as unknown as Record<string, unknown>;
const apiKey = flat.apiKey as string; // typos invisible to TypeScript
```

All fields the constructor reads **must** have a corresponding entry in `configSchema`. If a field is in the code but not in `configSchema`, there is no UI for the admin to set it.

---

## The `PluginContext` Pattern

The registry creates a logger and **injects it** into your factory. You never call `createAppLogger` yourself.

```ts
// ✅ Correct — receive appLog from context
class YourAdapter implements PMSAdapter {
  readonly appLog: AppLogger;

  constructor(config: YourPMSConfig, context: PluginContext) {
    this.appLog = context.appLog;
  }
}

export const manifest: PMSAppManifest = {
  createAdapter: (config, context) => new YourAdapter(config as unknown as YourPMSConfig, context),
};

// ❌ Wrong — never import or call createAppLogger
import { createAppLogger } from '@jack/core/instrumentation'; // doesn't exist publicly
```

---

## Wrapping Outbound Calls

**Every call to an external API must be wrapped with `this.appLog()`.**

This is how the System Health dashboard tracks response times, error rates, and active connections for your plugin. Unwrapped calls are invisible to the health system.

```ts
async getReservation(externalId: string): Promise<NormalizedReservation | null> {
  return this.appLog('get_reservation', { externalId }, async () => {
    const response = await fetch(`${this.baseUrl}/reservations/${externalId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return this.normalize(await response.json());
  });
}
```

The three arguments:
- `operation` — a snake_case string identifying the call (e.g. `'get_reservation'`)
- `metadata` — an object of key facts logged with the call
- `fn` — the async function that makes the call; its return value is passed through

### Operation names must be method-specific

Each public adapter method gets its own operation name. This is what appears in the System Health dashboard — granular names let you see exactly which operations are slow or failing.

```ts
// ✅ Correct — each method has a distinct operation name
async getReservation(id: string) {
  return this.appLog('get_reservation', { id }, async () => { ... });
}
async searchReservations(query: ReservationQuery) {
  return this.appLog('search_reservations', { query }, async () => { ... });
}
async getGuest(id: string) {
  return this.appLog('get_guest', { id }, async () => { ... });
}
```

```ts
// ❌ Wrong — consolidating all calls behind a shared wrapper with a generic name
private async request(endpoint: string, body: unknown) {
  return this.appLog('api_request', { endpoint }, async () => { ... }); // loses method context
}
```

If your adapter needs a shared HTTP helper (e.g. to handle auth headers, retries, or pagination), that is fine — but the `appLog` wrapping must still happen at the **public method level**, not inside the helper.

```ts
// ✅ Correct — appLog at the public method, helper handles HTTP mechanics only
async getReservation(id: string) {
  return this.appLog('get_reservation', { id }, async () => {
    return this.request('GET', `/reservations/${id}`); // helper has no appLog
  });
}

private async request(method: string, path: string) {
  // handles auth, retries, error parsing — no appLog here
  const response = await fetch(`${this.baseUrl}${path}`, { ... });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

---

## PMS Plugin Specifics

### Config interface

PMS plugins should always include `stalenessThreshold` and `syncInterval` in their config interface and `configSchema`:

```ts
export interface YourPMSConfig {
  apiKey: string;
  propertyId?: string;
  stalenessThreshold?: number;
  syncInterval?: number;
}
```

These control how Jack's sync scheduler treats your plugin. Without them, the scheduler falls back to defaults and the admin has no way to tune them.

### Manifest features

```ts
export const manifest: PMSAppManifest = {
  // ...
  features: {
    reservations: true,      // implements getReservation, searchReservations, etc.
    guests: true,            // implements getGuest, getGuestByPhone, etc.
    rooms: true,             // implements getRoomStatus, getAllRooms
    webhooks: false,         // set true if implementing parseWebhook
  },
};
```

### Provider field

```ts
readonly provider = 'yourpms';  // appears on NormalizedGuest.source, NormalizedReservation.source
```

Use any string — `IntegrationSource` is an open type. Use `IntegrationSources.MEWS` etc. for well-known systems.

### `docsUrl`

Add a `docsUrl` to the manifest pointing to your PMS's API documentation or your plugin's readme. The dashboard links to it from the app configuration panel.

```ts
export const manifest: PMSAppManifest = {
  id: 'pms-yourpms',
  docsUrl: 'https://yourpms.com/api-docs',
  // ...
};
```

---

## AI Plugin Specifics

Implement `AIProvider` and `BaseProvider`:

```ts
import type { AIProvider, AIAppManifest, AppLogger, BaseProvider, PluginContext } from '@jack/shared';

class YourAIProvider implements AIProvider, BaseProvider {
  readonly appLog: AppLogger;

  constructor(config: YourAIConfig, context: PluginContext) {
    this.appLog = context.appLog;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.appLog('completion', { model: this.model }, async () => {
      // call your AI API
    });
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.appLog('embedding', { model: this.model }, async () => {
      // call your embeddings API
    });
  }

  async testConnection() { ... }
}

export const manifest: AIAppManifest = {
  category: 'ai',
  capabilities: { completion: true, embedding: false, streaming: false },
  createProvider: (config, context) => new YourAIProvider(config as unknown as YourAIConfig, context),
  // ...
};
```

---

## Channel Plugin Specifics

Implement `BaseProvider`. `ChannelAdapter` is satisfied **structurally** — you don't list it in `implements`, you just implement `send()` and `parseIncoming()`:

```ts
import type {
  ChannelAppManifest, AppLogger, BaseProvider, ConnectionTestResult, PluginContext,
  OutboundMessage, SendResult, InboundMessage,
} from '@jack/shared';
import { withLogContext } from '@jack/shared';

class YourChannelAdapter implements BaseProvider {
  readonly id = 'channel-yourprovider';
  readonly appLog: AppLogger;
  readonly channel = 'sms'; // or 'whatsapp', 'email', etc.

  constructor(config: YourChannelConfig, context: PluginContext) {
    this.appLog = context.appLog;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    return this.appLog('send_message', { to: message.channelId }, async () => {
      // call your channel API
      return withLogContext({ status: 'sent' as const }, { to: message.channelId });
    });
  }

  async parseIncoming(raw: unknown): Promise<InboundMessage> { ... }
  async testConnection(): Promise<ConnectionTestResult> { ... }
}

export const manifest: ChannelAppManifest = {
  category: 'channel',
  features: { inbound: true, outbound: true, media: false },
  createAdapter: (config, context) => new YourChannelAdapter(config as unknown as YourChannelConfig, context),
  // ...
};
```

---

## Registering Your Plugin

Jack auto-discovers every `@jack-plugins/*` package in `node_modules`. No config file to edit — installing the package is enough.

**Workspace package** (inside the monorepo):

Add to the root `package.json` dependencies and run `pnpm install`:

```json
"@jack-plugins/pms-yourpms": "workspace:*"
```

**Published npm package**:

```bash
npm install @jack-plugins/pms-yourpms
```

Then restart Jack. Your plugin will appear in the dashboard under **Engine → Apps**.

---

## Verification Checklist

Before shipping, run through these checks:

- [ ] `pnpm --filter @jack-plugins/pms-yourpms build` — package builds without errors
- [ ] `pnpm typecheck` — full repo typecheck passes
- [ ] `pnpm test` — no regressions
- [ ] A typed config interface is defined and matches `configSchema` fields 1:1
- [ ] Every outbound call is wrapped with `this.appLog()` at the **public method level**
- [ ] Each `appLog` operation name is method-specific (not a generic name like `api_request`)
- [ ] `manifest.id` is globally unique (check existing plugins)
- [ ] All `configSchema` fields that the code reads are declared
- [ ] `export default { manifest }` is present
- [ ] `testConnection()` makes a real lightweight API call
- [ ] `parseWebhook` returns `null` for unknown event types (not throws)
- [ ] Large batch operations are chunked (don't send 1000 items in one API call)

---

## Publishing to npm

```bash
# From your plugin's directory
npm publish --access public
```

Update `package.json` with `"publishConfig": { "access": "public" }` to make this the default.

Community plugins published under `@jack-plugins/` scope are listed in the plugin registry at [jackthebutler.com/plugins](https://jackthebutler.com/plugins).
