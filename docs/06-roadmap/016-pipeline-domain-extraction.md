# Pipeline Domain Extraction

> Phase: Planned
> Status: Not Started
> Priority: High
> Depends On: [Message Pipeline](./014-message-pipeline.md)

## Overview

Extract a generic message pipeline that is decoupled from the hospitality domain, so the same pipeline can power AI assistants for other verticals (trading, car dealer, handyman, travel) without changes to the pipeline code. Hospitality-specific concepts move into a `HospitalityDomain` implementation that the pipeline accepts via dependency injection.

## Goals

1. **Generic pipeline** — `src/core/pipeline/` contains zero hospitality vocabulary; grep for hotel/guest/concierge/reservation returns nothing.
2. **Pluggable domain layer** — a single `DomainAdapter` interface defines everything the pipeline needs from a domain.
3. **Type-safe wiring** — the active domain is passed via DI at the gateway boundary; no global registry, no side-effect imports.
4. **Validated by a second domain** — proven by a non-hospitality stub domain running end-to-end through the same pipeline.
5. **Package-ready** — folder boundaries map cleanly to future `@jackthebutler/pipeline-core` + `@jackthebutler/domain-*` packages.

## Key Features

1. **`DomainAdapter` interface** — top-level bundle of three sub-interfaces (`EntityResolver`, `IntentCatalog`, `PromptTemplates`) defining the irreducible surface a domain must supply.
2. **`HospitalityDomain` implementation** — wraps existing services, intent definitions, and prompt strings as the first concrete domain.
3. **DI bootstrap** — `processMessage(inbound, domain)` accepts the domain at call time; the gateway constructs `hospitalityDomain` once at startup.
4. **Stub second domain** — a minimal non-hospitality domain used as the validation artifact for the abstraction.

---

## Architecture

### Where it lives

```
src/core/
├── domain/                          ← NEW: domain abstraction layer
│   ├── adapter.ts                   ← DomainAdapter interface
│   ├── entity-resolver.ts           ← EntityResolver interface
│   ├── intent-catalog.ts            ← IntentCatalog interface
│   ├── prompt-templates.ts          ← PromptTemplates interface
│   ├── types.ts                     ← Entity, Intent shared types
│   └── hospitality/                 ← first implementation
│       ├── index.ts                 ← exports hospitalityDomain: DomainAdapter
│       ├── entity-resolver.ts       ← wraps guestService
│       ├── intent-catalog.ts        ← wraps intent-definitions.ts
│       └── prompt-templates.ts      ← extracts the "Jack the concierge" prompts
│
├── pipeline/                        ← signature change, no structural change
│   ├── index.ts                     ← processMessage(inbound, domain)
│   ├── context.ts                   ← MessageContext gains domain field
│   └── stages/
│       ├── resolve-conversation.ts  ← uses ctx.domain.entities
│       ├── classify-intent.ts       ← uses ctx.domain.intents + .prompts
│       ├── generate-response.ts     ← uses ctx.domain.prompts.responder
│       └── ... (other stages unchanged)
```

### How it connects

```
HTTP / WebSocket request
        │
        ▼
  Gateway (src/gateway/server.ts)
   constructs hospitalityDomain once
   processMessage(inbound, domain)
        │
        ▼
  Pipeline (src/core/pipeline/)
   ctx.domain = domain
   stages call ctx.domain.x.y() where needed
        │
        ▼
  HospitalityDomain (src/core/domain/hospitality)
   entities → wraps guestService
   intents  → wraps intent-definitions.ts
   prompts  → owns the concierge persona text
        │
        ▼
  Existing services, DB, PMS — unchanged
```

The domain adapter is the only place the pipeline and hospitality logic meet. The pipeline does not import hospitality code; hospitality does not import pipeline code.

### Technical details

- `DomainAdapter` is an internal kernel type. It does not belong in `@jackthebutler/shared` — plugin authors never interact with the pipeline directly.
- Of the 15 original pipeline stages, only 3 need to call into the domain: `resolveConversation`, `classifyIntent`, `generateResponse`. The other 9 active stages operate on generic `MessageContext` and need no domain knowledge.
- `routeTask`, `checkEscalation`, and `checkAutonomy` stages are currently commented out in `src/core/pipeline/index.ts` and stay out of scope for this roadmap.

---

## The three interfaces

`DomainAdapter` bundles exactly three sub-interfaces. These are the irreducible surface — the things that genuinely vary between domains.

**`EntityResolver`** — answers "who is this person?" Returns the domain's notion of a user plus their current contextual state. Hospitality returns `{ guest, currentReservation? }`. Trading would return `{ account, positions, watchlist }`. Handyman returns `{ homeowner, openJobs }`. The `Entity` type is generic; what populates it is domain-specific.

**`IntentCatalog`** — defines what the user might want. Provides the list of intents the classifier should choose from, with examples and any classifier-specific metadata. The pipeline's classifier stage is generic — it consults this catalog instead of a hardcoded list.

**`PromptTemplates`** — owns the words the system uses. Both the responder system prompt ("You are Jack, a friendly hotel concierge…") and the classifier system prompt live here. A trading domain swaps these out without touching the pipeline.

## Why these three (and not more)

An interface earns its place only when the implementation actually varies between domains. Earlier drafts included separate interfaces for `ConversationRepo`, `MemoryStore`, `KnowledgeSource`, `EscalationPolicy`, `AutonomyPolicy`, `TaskRouter`, and `VerificationPolicy` — all cut. Conversation persistence, memory storage, and knowledge search have universal shape; what differs is the content, not the structure. They stay as shared services that domain implementations use internally. Task routing, escalation, and autonomy are deferred from the pipeline entirely.

## Dependency injection vs registry

The existing plugin system (`src/apps/registry.ts`) uses self-registration. That pattern fits **runtime-pluggable** concerns — channels, AI providers, PMS adapters — that the user toggles via the dashboard and that can coexist. The domain is different: it is a **deployment-time decision**, fixed at boot. DI gives compile-time safety, trivial testing, and zero hidden coupling. The cost is one line of code at the gateway boundary.

---

## Key Differences

How the domain layer differs from the existing plugin system.

| Aspect | Plugins (AI / channel / PMS) | Domain |
|---|---|---|
| **Pluggability** | Runtime — toggled by user in dashboard | Deployment-time — one active per process |
| **Coexistence** | Multiple can be active simultaneously | Exactly one active |
| **Wiring pattern** | Self-registration into `AppRegistry` | Dependency injection at gateway |
| **Where defined** | `packages/{ai,channel,pms}-*` workspace packages | `src/core/domain/{name}/` |
| **Public contract** | `@jackthebutler/shared` types | Internal kernel interface (`DomainAdapter`) |
| **Compile-time safety** | Manifest validated at load time | Wiring validated by TypeScript |

---

## What's NOT in Scope (Future)

- **Packaging** — moving to `@jackthebutler/pipeline-core` and `@jackthebutler/domain-*` npm packages. Folder boundaries chosen here will map cleanly; this roadmap stops at the monorepo refactor.
- **Task routing, escalation, autonomy stages** — intentionally commented out. Reintroducing them is a separate roadmap, after a real second domain reveals what their interfaces should look like.
- **Per-domain database schemas** — the SQLite schema remains hospitality-shaped. The domain layer hides this from the pipeline, but a real second domain in production would need its own tables.
- **Per-domain dashboards** — the React dashboard at `apps/dashboard` is hospitality-specific. A trading or handyman deployment would need its own dashboard.
- **Runtime domain switching** — by design. If a use case for runtime switching emerges, it would require a different (registry-based) pattern.

---

## Implementation Phases

### Phase 1 — Define the contracts

**Goal:** The three interface files plus the top-level `DomainAdapter` exist and typecheck cleanly. Nothing imports them yet.

Creates `src/core/domain/{adapter,entity-resolver,intent-catalog,prompt-templates,types}.ts`. Pure type definitions, no runtime impact.

### Phase 2 — Build `HospitalityDomain`

**Goal:** A concrete `hospitalityDomain` value implements `DomainAdapter` by delegating to existing services. The dev server still uses the old code path.

Creates `src/core/domain/hospitality/*` as thin wrappers — no logic moves yet.

### Phase 3 — Wire the domain into the pipeline (plumbing only)

**Goal:** `processMessage(inbound, domain)` accepts a domain parameter. Stages have access to `ctx.domain` but still use direct service imports.

Touches `src/core/pipeline/index.ts`, `src/core/pipeline/context.ts`, and the gateway entry points. Sending a message produces byte-identical output to before.

### Phase 4 — Migrate `resolveConversation`

**Goal:** The first stage uses `ctx.domain.entities` instead of importing `guestService` directly.

Touches `src/core/pipeline/stages/resolve-conversation.ts` only. First end-to-end exercise of the interface — if `EntityResolver` doesn't fit the real lookup logic, the shape is adjusted before more stages migrate.

### Phase 5 — Migrate `classifyIntent`

**Goal:** The classifier stage pulls its intent list and classifier prompt from `ctx.domain.intents` and `ctx.domain.prompts.classifier`.

Touches `src/core/pipeline/stages/classify-intent.ts`. Classification accuracy on existing hotel intents stays unchanged.

### Phase 6 — Migrate `generateResponse`

**Goal:** The hardcoded "You are Jack, a friendly hotel concierge…" prompt is deleted from the stage. The responder prompt now comes from `ctx.domain.prompts.responder(ctx)`.

Touches `src/core/pipeline/stages/generate-response.ts`. After this phase, grep of `src/core/pipeline/` for hotel/guest/concierge/reservation must return zero hits.

### Phase 7 — Validate with a stub second domain

**Goal:** A minimal non-hospitality domain (e.g., handyman) runs end-to-end through the same pipeline with no pipeline code changes, producing sensibly different output.

Creates `src/core/domain/handyman/index.ts` — roughly 50 lines: three intents, a one-line responder prompt, an in-memory entity resolver. Wired via env var (`DOMAIN=handyman pnpm dev`). This is the abstraction's proof.

### Phase 8 — Move to packages (deferred)

**Goal:** Extract to `@jackthebutler/pipeline-core` and `@jackthebutler/domain-hospitality`.

Mechanical at this point — copy files, update import paths. Not part of this roadmap; only worth doing when an external consumer forces the question.

---

## Related Documents

- [Message Pipeline Refactor](./014-message-pipeline.md) — the existing pipeline structure being extended here
- [Plugin System](./013-plugin-system.md) — the runtime-pluggable contract for AI/channel/PMS, contrasted with the deployment-time domain layer
