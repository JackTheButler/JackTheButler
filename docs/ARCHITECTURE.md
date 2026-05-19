# Backend Architecture

Feature-first modular monolith. One folder per domain; business logic stays
transport-agnostic so HTTP, WebSocket, webhooks, and the AI pipeline can all
reuse it.

```
src/
  index.ts            process entrypoint — runMigrations() + serve(app)
  app.ts              composition root — builds the Hono app (no side effects)
  config.ts           runtime config (read once)
  core/               cross-cutting, domain-agnostic
    logger.ts  errors.ts (AppError)  http.ts (onError)
  db/
    client.ts  migrate.ts
    schema/           one file per domain + index.ts barrel
  modules/            one folder per domain
    auth/  routes.ts  service.ts  middleware.ts  schema.ts  <primitives>
```

## Module contract

Every folder in `src/modules/<name>/` MUST have:

- `routes.ts` — thin HTTP adapter: validate input → call service → serialize.
  No business logic, no error formatting.
- `service.ts` — the domain logic. Plain args in, plain data out, throws
  `AppError`. **Never imports `hono`** / never sees a `Context`.
- optional: `middleware.ts`, `schema.ts` (zod), domain primitives.

A new domain = a new folder following this shape + one `app.route(...)` line.

## The five guardrails (enforced, not just documented)

1. **Module contract** — `tests/architecture.test.ts` fails if a module is
   missing `routes.ts`/`service.ts`.
2. **Transport-agnostic services** — same test fails if any `service.ts`
   imports `hono`. Logic stays reusable across entry points.
3. **Schema barrel** — `db/schema/index.ts` re-exports every table so the
   Drizzle client and the migration check see all of them.
4. **Migration sync** — `tests/db.migrations.test.ts` applies committed
   migrations to an empty DB and asserts every schema table exists. Forgetting
   `pnpm db:generate` fails CI.
5. **Protected-by-default** — `app.ts` mounts `app.use('/api/app/*',
   requireAuth)`. Business modules under `/api/app/*` are authed automatically;
   public routes are the explicit exception.

## Integration packages (channels / AI providers)

Every channel or AI provider is a separate workspace package — never core code.

- A package exports one `AppModule` (`manifest` + `validate` +
  `createInstance`) and depends **only** on `@janetheoperator/shared`,
  never on `src/`. Dependency direction is one-way.
- Contracts live in `@janetheoperator/shared`:
  - `@janetheoperator/shared` — manifest + DTO types (UI + API safe)
  - `@janetheoperator/shared/contracts` — `AppModule`/`AppContract`
    (API + packages; types only, erased at compile, never ships to the UI)
- `src/modules/apps/registry.ts` is the **only** place the core references a
  package — a typed array. New integration = new package + one registry line;
  no other core change.
- Config is stored in `app_configs` (PK = manifest id), the JSON blob
  AES-256-GCM encrypted (`modules/apps/crypto.ts`, key `APP_CONFIG_KEY`).
  Secret fields are never returned by the API (masked); status is derived,
  never stored.
- The framework code in `modules/apps/` is generic over the contract and does
  **not** grow as apps are added.

## Error handling

Services throw `AppError(code, status)`. `core/http.ts` `onError` is the only
place that turns errors into responses (`{ error: code }`). Routes never format
errors; the wire shape is never duplicated.

## Conventions for growth

- Cross-feature reuse: import the owning module's service. Never reimplement;
  never import sideways between modules' internals.
- Shared API/UI types belong in `packages/shared`, imported by both sides.
- New table → add `db/schema/<domain>.ts`, re-export in the barrel,
  `pnpm db:generate`, commit the migration.
