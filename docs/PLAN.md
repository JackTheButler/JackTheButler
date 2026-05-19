# Jane the Operator — Build Plan

AI support chat for a single business. Customers reach support via channels
(WebChat first, more later). The AI handles most conversations; human agents
can take over, and the AI pauses until handed back.

> Status: **Stages 1–3 done. Stage 5 slices 1–4 done** (widget-ui + preview;
> conversation backend + identity; public ingress; WS gateway + event bus;
> real loader + iframe bundle; 5a inbox live; 5b Apps tab + webchat config
> wired to real apps API, all mocks removed). **Stage 5 COMPLETE.** Next:
> Stage 6 (AI pipeline) — but per sequence, Stage 4 (AI app) first. Order: 5 → 4 → 6. **Stage 1 done. Stage 2 DB done. Stage 3 done** (backend — app
> framework + stub; Apps UI deferred as a follow-on slice). Stage 2
> service/routes deferred to build alongside webchat. Mock dashboard UI exists.
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

## Stage 4 — locked scope (AI app)

- One `ai` app `packages/ai-anthropic`, **capability `completion`**.
  Config: `apiKey` (secret), `completionModel` (opus/sonnet),
  `utilityModel` (haiku — language/intent = same contract, cheap model).
- Utility is **not** a separate app/contract — it's `completion` with the
  utility model. Embedding is a **separate app + `EmbeddingProvider`
  contract, built in Stage 7** (RAG), not here.
- Manifest gains `capability: 'completion' | 'embedding'` for `ai` apps.
  `CompletionProvider`/`EmbeddingProvider` contracts defined in Stage 6/7.
- `check()` is **network-free** in Stage 4 (config-shape only); real
  connectivity check deferred to Stage 6.

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
