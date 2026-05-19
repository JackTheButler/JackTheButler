# Jane the Operator — Build Plan

AI support chat for a single business. Customers reach support via channels
(WebChat first, more later). The AI handles most conversations; human agents
can take over, and the AI pauses until handed back.

> Status: **Stage 1 done. Stage 2 DB done. Stage 3 done** (backend — app
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

## Per-stage process

For each stage, before writing code:

1. Agree the minimal scope and the exit/test criteria.
2. Note any data-model or contract changes.
3. Build it small; keep it green (`pnpm check`).
4. Update this file's status line and move to the next stage.
