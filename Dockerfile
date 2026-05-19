# Single-service image: one process serves the API + dashboard SPA + widget.
# Multi-stage: build everything, then a slim runtime.

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for better-sqlite3's native build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install with the lockfile (better-sqlite3 builds via onlyBuiltDependencies).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

COPY . .

# Build packages + API, then the widget bundle, then the dashboard SPA.
RUN pnpm build:all

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/app.db

# Only what the server needs at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/apps/widget/dist ./apps/widget/dist
COPY --from=build /app/apps/widget/loader.js ./apps/widget/loader.js
COPY --from=build /app/apps/dashboard/dist ./apps/dashboard/dist

# SQLite lives at DB_PATH (/data/app.db). Persistence comes from the mounted
# volume — a Railway Volume mounted at /data (or the compose volume locally).
# No Docker VOLUME directive: Railway rejects it.
RUN mkdir -p /data
EXPOSE 3000

# Migrations run on startup (src/index.ts → runMigrations()).
CMD ["node", "dist/index.js"]
