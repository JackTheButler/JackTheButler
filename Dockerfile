# Jack The Butler - Production Dockerfile
# Build: docker build -t jack .
# Run: docker run -d -p 3000:3000 -v jack-data:/app/data jack

# ===================
# Build Stage
# ===================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (allow build scripts via npm for native modules)
RUN pnpm install --frozen-lockfile && npm rebuild better-sqlite3

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN pnpm build

# ===================
# Production Stage
# ===================
FROM node:22-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install pnpm for production deps
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only and build native modules
RUN pnpm install --prod --frozen-lockfile && npm rebuild better-sqlite3

# Copy built files
COPY --from=builder /app/dist ./dist

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

# Health check - simplified since we don't have HTTP server yet
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD pgrep -x node || exit 1

# Run the application
CMD ["node", "dist/index.js"]
