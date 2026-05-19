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

## Deploy

One container serves **everything from one origin**: the API, the dashboard
SPA, the widget loader (`/widget.js`) and bundle (`/widget/app/*`). SQLite
lives on a mounted volume; migrations run on startup.

```bash
export JWT_SECRET=$(openssl rand -hex 24)
export APP_CONFIG_KEY=$(openssl rand -hex 24)
docker compose up --build        # → http://localhost:3000
```

- Both secrets are **required in production** (≥ 16 chars) — `config.ts`
  throws otherwise. Data persists in the `jane-data` volume (`/data/app.db`).
- The landing site (`apps/landing/`) deploys separately:
  `pnpm deploy:website` (Cloudflare Pages).

To run the built server without Docker: `pnpm build && pnpm build:widget &&
pnpm build:dashboard`, then `NODE_ENV=production JWT_SECRET=… APP_CONFIG_KEY=…
pnpm start`.
