# Jane the Operator

pnpm monorepo skeleton.

## Layout

| Path                | Stack                                              |
| ------------------- | -------------------------------------------------- |
| `src/`              | API — Hono, pino, zod (Node ≥22, ESM)              |
| `apps/dashboard/`   | React 18 + Vite 6 + Tailwind 3 + Radix + TanStack  |
| `apps/landing/`     | Astro 5 + Tailwind 4                                |
| `packages/shared/`  | Shared types/schemas (`@janetheoperator/shared`)   |

## Develop

```bash
pnpm install
cp .env.example .env

pnpm dev            # API on :3000 (tsx watch)
pnpm dev:dashboard  # dashboard on :5173 (proxies /api -> :3000)
pnpm dev:website    # landing on :4321
```

## Other

```bash
pnpm build      # build shared, then API (tsc + tsc-alias)
pnpm typecheck  # shared build + API + dashboard
pnpm test       # vitest
pnpm check      # lint + typecheck + test
```

The project itself is undefined — this is just the scaffold with a test API
(`/health`, `/api/ping`) and empty dashboard/landing pages.
