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

## Push notifications (optional)

The dashboard is an installable PWA and can deliver Web Push notifications
(e.g. a new message in a conversation an agent has taken over). It's **off
until VAPID keys are configured** — the Settings → Profile toggle then shows
"not configured on this server".

```bash
npx web-push generate-vapid-keys   # prints a public + private key
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and (optionally) `VAPID_SUBJECT`
(a `mailto:` you own) in the env, then restart the API. Notes:

- **No third-party service / cost** — Web Push is sent directly to the browser's
  push service via the standard protocol; the keypair is self-generated.
- The service worker only runs in the **built** dashboard, so test push via
  `pnpm preview:dashboard` (`:4173`), not `pnpm dev:dashboard`.
- **iOS** delivers push only to an **installed** PWA (Add to Home Screen);
  desktop browsers work without installing.

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
