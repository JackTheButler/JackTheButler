# Jack The Butler - Production Dockerfile
# Build: docker build -t jack .
# Run: docker run -d -p 3000:3000 -v jack-data:/app/data jack

# ===================
# Base: install all deps (shared by both builders)
# ===================
FROM node:22-slim AS base

WORKDIR /app

# Install build dependencies for better-sqlite3 and native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Copy workspace manifests for dependency install
# packages/ is copied whole so new plugins don't require Dockerfile changes
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages ./packages
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/webchat/package.json ./apps/webchat/

# Install all dependencies
RUN pnpm install --frozen-lockfile && npm rebuild better-sqlite3

# ===================
# Shared: build @jack/shared (required by backend, plugins, and dashboard)
# ===================
FROM base AS shared-builder

RUN pnpm --filter @jack/shared build

# ===================
# Backend: plugins + TypeScript (runs in parallel with frontend-builder)
# ===================
FROM shared-builder AS backend-builder

ARG VERSION=dev

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Build all plugin packages
RUN pnpm --filter '@jack-plugins/*' build

# Build backend TypeScript
RUN pnpm build

# ===================
# Frontend: dashboard + webchat (runs in parallel with backend-builder)
# ===================
FROM shared-builder AS frontend-builder

COPY apps/dashboard ./apps/dashboard
COPY apps/webchat ./apps/webchat

# Build dashboard
RUN pnpm --filter @jack/dashboard build

# Build webchat widget
RUN pnpm --filter @jack/webchat build

# ===================
# Production Stage
# ===================
FROM node:22-slim

ARG VERSION=dev

WORKDIR /app

# Install build dependencies for better-sqlite3 and runtime deps for ONNX
RUN apt-get update && apt-get install -y python3 make g++ procps && rm -rf /var/lib/apt/lists/*

# Install pnpm for production deps
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Copy workspace manifests — packages/ from backend-builder includes package.json + built dist/
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY --from=backend-builder /app/packages ./packages
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/webchat/package.json ./apps/webchat/

# Install production dependencies only and build native modules
# --ignore-scripts prevents prepare scripts from running tsc (devDeps not available in prod)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && npm rebuild better-sqlite3

# Copy @jack workspace packages from builder (workspace symlinks are not reliable in prod stage)
COPY --from=backend-builder /app/node_modules/@jack ./node_modules/@jack

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy migrations folder
COPY --from=backend-builder /app/migrations ./migrations

# Copy built dashboard
COPY --from=frontend-builder /app/apps/dashboard/dist ./dashboard

# Copy built webchat widget
COPY --from=frontend-builder /app/apps/webchat/dist ./widget

# Create data directory
RUN mkdir -p /app/data

# Data volume for SQLite database
VOLUME /app/data

# Environment defaults
ENV APP_VERSION=$VERSION
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/jack.db
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD pgrep -x node || exit 1

# Run the application
CMD ["node", "dist/index.js"]
