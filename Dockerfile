# Jack The Butler - Production Dockerfile
# Build: docker build -t jack .
# Run: docker run -d -p 3000:3000 -v jack-data:/app/data jack

# ===================
# Build Stage
# ===================
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 and native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (root and dashboard)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/webchat/package.json ./apps/webchat/

# Install all dependencies
RUN pnpm install --frozen-lockfile && npm rebuild better-sqlite3

# Copy source code
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY apps/dashboard ./apps/dashboard
COPY apps/webchat ./apps/webchat

# Build backend TypeScript
RUN pnpm build

# Build dashboard
RUN pnpm --filter @jack/dashboard build

# Build webchat widget
RUN pnpm --filter @jack/webchat build

# ===================
# Production Stage
# ===================
FROM node:22-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 and runtime deps for ONNX
RUN apt-get update && apt-get install -y python3 make g++ procps && rm -rf /var/lib/apt/lists/*

# Install pnpm for production deps
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only and build native modules
RUN pnpm install --prod --frozen-lockfile && npm rebuild better-sqlite3

# Copy built backend
COPY --from=builder /app/dist ./dist

# Copy migrations folder
COPY --from=builder /app/migrations ./migrations

# Copy built dashboard
COPY --from=builder /app/apps/dashboard/dist ./dashboard

# Copy built webchat widget
COPY --from=builder /app/apps/webchat/dist ./widget

# Create data directory
RUN mkdir -p /app/data

# Data volume for SQLite database
VOLUME /app/data

# Environment defaults
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
