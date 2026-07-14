# Jane the Operator — Build Plan

AI support chat for a single business. Customers reach support via channels
(WebChat first, more later). The AI handles most conversations; human agents
can take over, and the AI pauses until handed back.

> Status: **Stages 1–6 + 9 (deploy) done.** Stage 6 ships the AI pipeline:
> `assistant_profile` table + UI (5 fields drive the system prompt);
> `@thebutler/pipeline` integration with a 4-stage custom list
> (resolveConversation → loadPriorHistory → generateResponse →
> saveOutboundMessage); `GenerationContract` adds `generate()` to
> `ai-anthropic`; fire-and-forget dispatch from `ingestInboundMessage`
> when `mode='ai'` and a generation app is active; AI replies flow back
> through the existing event bus / WS gateways. Last-10 prior turns
> feed the model; system prompt rebuilt per turn from `assistant_profile`.
> Runtime failures record on `last_error` (no auto-disable). 69 tests
> green. Next: **Stage 7 — Knowledge Base** (RAG; embeddings app +
> contract).
> Each stage below is detailed and agreed **before** it is built. Keep every
> stage minimal, clean, and independently testable.

---

## Principles

- Small increments — each stage ships something demoable and testable.
- Build the thing only when the thing it depends on exists.
- Human-takeover is designed into the data model from stage 2, before any AI.
- `@thebutler/pipeline` is a published npm dependency, used as a black box
  behind a contract boundary. We do not depend on its source.

---

## Stages

Order is locked. Scope per stage is decided in a short discussion right
before that stage starts — nothing below is final detail.

| #   | Stage                              | Outcome (testable)                                            |
| --- | ---------------------------------- | ------------------------------------------------------------- |
| 1   | Persistence + minimal staff login  | Protected API; seedable DB; an agent can log in.              |
| 2   | Chat/inbox, no AI + takeover flag  | Human-only inbox end-to-end; `mode` (ai\|human) + handoff.    |
| 3   | App-connection framework + stub    | Pluggable-app system (manifest/registry/loader) proven by a stub. |
| 4   | AI app                             | AI provider registers/configures as an app (no pipeline yet). |
| 5   | WebChat app                        | WebChat channel registers/configures; customer can send in.   |
| 6   | AI pipeline                        | Message → AI answer persisted; takeover pauses the pipeline.  |
| 7   | Knowledge Base                     | A KB entry demonstrably changes the AI answer (RAG).         |
| 8   | Full Staff & Permissions           | Roles/permissions enforced across the app.                   |
| 9   | _Decide next_                      | Review and pick what follows (more channels, settings, etc.). |

---

## Stage 1 — locked scope

- **Stack:** SQLite + Drizzle ORM, `drizzle-kit` migrations. DB at `data/app.db`.
- **Schema:** one table `staff` (`id` uuid PK, `email` unique, `password_hash`,
  `name`, `created_at`). No roles (Stage 8), no sessions table.
- **Auth:** bcrypt hash + `jose` JWT in an httpOnly `SameSite=Lax` `Secure`
  cookie. **Rolling session:** 5-day expiry, re-issued when token >1 day old.
- **First-install admin:** `GET /api/auth/setup-status`, `POST /api/auth/setup`
  (only when `staff` empty), then disabled. No seed credentials.
- **Endpoints:** setup-status, setup, `POST /login`, `POST /logout`,
  `GET /me`, one protected example route + auth middleware.
- **Out of scope:** roles, password reset, refresh tokens, rate limiting,
  account lockout, hard session revocation.
- **Exit:** `pnpm check` green; migrations clean from empty; tests cover
  login ok/fail, protected route 401/200, setup flow, `/me`.

---

## Stage 2 — locked scope

- **DB only now** (done): `customers`, `conversations`, `messages` tables +
  migration `0001`. Service/routes/UI deferred — built with webchat (Stage 5)
  so there's a real end-to-end example.
- **Customer entity:** `customers.id` is the stable per-customer key for AI
  memory/history. Cross-channel identity resolution deferred.
- **Takeover model:** `conversations.mode` (`ai`|`human`); reply allowed only
  after takeover (strict). No automated transitions until Stage 6.
- **Status:** `open`|`closed` only; "needs reply" is derived, never stored.
- **Deferred:** real-time (Stage 6 WebSocket), unread/read-state (Stage 8).

---

## Stage 3 — locked scope (done)

- Framework only — no real channels/AI. `packages/app-stub` proves the loop.
- Contracts in `@janetheoperator/shared` (+ `/contracts` subpath); apps are
  separate packages depending only on shared; `modules/apps/registry.ts` is
  the single core reference point.
- `app_configs` table (migration `0002`); config AES-256-GCM encrypted
  (`APP_CONFIG_KEY`); secrets masked in responses; status derived.
- API under `/api/app/apps` (authed): list, get, put config, enable, disable,
  check. Apps-tab UI deferred to a follow-on slice.
- Channel/AI contracts intentionally **not** designed yet — defined in
  Stage 5/6 against the real example.

---

## Execution order (revised)

WebChat is built **before** the AI app: **5 → 4 → 6**. 4 and 5 are independent;
the pipeline (6) needs both. WebChat is the first demoable end-to-end slice and
forces the channel-contract design, so it goes first.

---

## Stage 4 — done (AI app)

- `packages/ai-anthropic`, capability **`generation`** (renamed from
  "completion" for vendor-neutrality; covers answer + utility roles via two
  model fields).
- Manifest extended: `AppCapability = 'generation' | 'embedding'`,
  `AppManifest.capability?`, new `ConfigFieldType = 'select'` +
  `options?`. Embedding stays a separate app + contract, built in **Stage 7**.
- `check()` is a **real connectivity test** (raw `/v1/messages` call) —
  exposed in the UI via a "Test connection" button.
- **Generic config panel** `/apps/:id` (renders any manifest, Status/Switch,
  per-field errors, Save, Test connection). Custom panel `/apps/webchat`
  unchanged.

---

## Stage 6 — done (AI pipeline)

- **`assistant_profile`** single-row table (migration `0006`); five fields
  drive the system prompt: Name, Tone, Instructions, Fallback message,
  Topics to avoid. Lazy-seeded with defaults on first read so the
  pipeline never trips on missing config. `GET`/`PUT /api/app/assistant`.
- `AssistantPage` rewritten as a single-page form (no tabs); reuses the
  shared `SaveButton`, `Field`, `Card` patterns + ApiError-driven field
  errors.
- **`GenerationContract`** in `shared/contracts` (`generate(messages,
  maxTokens?, temperature?) → {content, usage?}`) — provider-neutral.
- `ai-anthropic.generate()` splits system turns out into Anthropic's
  top-level `system` field; default `maxTokens=512`.
- **Pipeline glue** in `src/core/pipeline.ts` — cross-cutting infra (not
  a module), same tier as `core/events.ts` and `core/realtime.ts`.
  Provider adapters over our conversations/messages/customers/apps
  modules. Custom 4-stage list:
  - `resolveConversation` (defaults; finds by id)
  - `loadPriorHistory` (custom — last 10, excludes the just-saved inbound by id)
  - `generateResponse` (defaults)
  - `saveOutboundMessage` (defaults; our `addMessage` adapter persists
    + emits `message.created`)
- Skip stages we don't need: language detection, translation, intent
  classification, embeddings, RAG, long-term memory.
- `ingestInboundMessage` persists the customer turn synchronously and
  fires-and-forgets `runAiPipeline` when `mode='ai'` and
  `getActiveGenerationInstance()` is non-null. Pipeline errors record
  on the AI app's `last_error` (no auto-disable; admin-only policy).
- Existing webchat + dashboard WS gateways pick up the AI
  `message.created` event with no extra wiring.
- Tests (`tests/pipeline.test.ts`, 5 cases): skip-when-disabled, reply
  persisted + emitted, system-prompt assembly, prior-history feeds
  excluding the inbound, success clears `last_error`. Fixture
  `stub-generation-app` replaces the registry for hermetic runs.

---

## Stage 5 — locked scope (WebChat) — biggest stage; sliced

Absorbs the deferred Stage 2 conversation logic. Settings (manifest):
title, welcome message, accent color, position (`bottom-right|left`),
allowed domains (origin allowlist); plus generated/displayed widget key +
embed snippet. Introduces the **first public, unauthenticated endpoints**
(`/widget.js`, `/widget/config`, `/widget/socket`), all `Origin`-checked
against allowed domains.

Decisions: (A) iframe panel + injected launcher; (B) WebSocket transport
(real-time lands here); (C) origin allowlist + public widget key;
(D) generic Apps form by default + optional per-app custom panel (webchat
ships one); (E) one shared widget component, preview/live modes;
(F) manifest gains `color` + `generated/readonly` presentational types.
Shared widget lives in its own package (e.g. `packages/widget-ui`),
consumed by both the embed loader and the dashboard preview.

**Theming:** script attr `data-jane-theme="auto|light|dark"` (default
`auto` → `prefers-color-scheme`, which propagates into the iframe); dashboard
config default; optional `JaneWidget.setTheme()` JS API for sites with a
manual toggle (loader postMessages it in). Precedence: attr → JS API →
config default → auto. **No host-DOM sniffing.** `widget-ui` receives an
already-resolved `light|dark` theme (presentational); resolution lives in
the loader/runtime (slice 4).

**Slices (widget UI first; each independently green):**

1. **Widget UI + Apps preview panel — mock data, no backend.** Lock look,
   position, accent, welcome, copy-snippet UX, live preview.
2. **Conversation backend** — `modules/conversations/` service + routes
   (deferred Stage 2 logic).
3. **Channel contract + public webchat ingress** — shared channel contract,
   `packages/channel-webchat`, public endpoints + origin guard,
   registry-injectable refactor + demote `app-stub` to test fixture.
4. **Real-time WebSocket.**
5. **Wire it live** — widget ↔ socket, inbox ↔ API.

Constraint: widget stays strictly presentational (props in, events out) so
slice 5 is pure wiring, not a rewrite.

**Continuous conversation (locked).** Exactly **one conversation per
`(channel, channelExternalId)`** — DB-enforced (`channel_external_id` NOT
NULL, `UNIQUE(channel, channel_external_id)`). Closed is not terminal: an
inbound message **reopens** the same conversation regardless of time gap, and
reopen **resets `mode→ai` + unassigns** (takeover binds to the episode, not
the relationship) and inserts a `system`/`event='reopened'` marker row
(timeline divider + AI segment boundary + analytics; hidden from the
customer; ignored by snippet/needsReply). Per-issue analytics & AI history
windowing/summarisation derive from these markers — deferred to the memory
stage.

**Identity model (locked, slice 2).** `customers` = *identified* persons only
(strong channel id, or later a verified email/phone) — the durable
memory/history anchor. Anonymous webchat gets **no customer**;
`conversations.customer_id` is **nullable**, continuity via
`(channel, channelExternalId)`. `customer_identities` (one→many, unique
`(channel, external_id)`) maps a channel-native id to a customer. Strong
channels resolve-or-create; webchat is anonymous. The common path is
**promote, not merge** (attach a conversation to an existing customer when a
strong id appears). True cross-channel **merge + verification + `kind`/
`verified`/`customers.merged_into`** is a dedicated **later stage** — schema
is merge-ready (entity vs. identifiers split) but not built.

---

## Per-stage process

For each stage, before writing code:

1. Agree the minimal scope and the exit/test criteria.
2. Note any data-model or contract changes.
3. Build it small; keep it green (`pnpm check`).
4. Update this file's status line and move to the next stage.
