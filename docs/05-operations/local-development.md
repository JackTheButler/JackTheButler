# Local Development

Setting up a local development environment for Jack The Butler.

---

## Prerequisites

### Required

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | ≥22 | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm | ≥10 | `npm install -g pnpm` |
| Git | ≥2.40 | [git-scm.com](https://git-scm.com) |

### Optional

| Tool | Purpose |
|------|---------|
| Docker | Containerized deployment testing |
| VS Code | IDE with extensions |
| DB Browser for SQLite | Database GUI |
| ngrok | Webhook testing |
| Ollama | Local LLM testing |

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/jackthebutler/jack.git
cd jack

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Initialize database
pnpm db:migrate

# 5. Seed development data (optional)
pnpm db:seed

# 6. Start development server
pnpm dev
```

The server will be available at `http://localhost:3000`.

That's it! No Docker, no external databases, no complex setup.

---

## Environment Configuration

### `.env` File

```bash
# ============================================
# CORE
# ============================================
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# ============================================
# DATABASE
# ============================================
# SQLite database file (created automatically)
DATABASE_PATH=./data/jack.db

# ============================================
# SECURITY
# ============================================
JWT_SECRET=dev-secret-change-in-production-min-32-chars
ENCRYPTION_KEY=dev-encryption-key-32-bytes-long

# ============================================
# AI & CHANNELS
# ============================================
# Configured via dashboard (Engine > Apps), not env vars

# Twilio (SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Email
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=

# ============================================
# INTEGRATIONS (Optional for local dev)
# ============================================

# PMS
PMS_VENDOR=mock
# PMS_VENDOR=opera
# OPERA_HOSTNAME=
# OPERA_CLIENT_ID=
# OPERA_CLIENT_SECRET=
```

---

## Project Structure

```
jack/
├── data/                    # SQLite database & uploads
│   ├── jack.db              # Main database (auto-created)
│   └── uploads/             # File uploads
├── src/                     # Source code
├── apps/                    # Frontend apps (dashboard, widget)
├── config/                  # Configuration files
├── tests/                   # Test files
├── .env                     # Environment variables
└── package.json
```

---

## Development Scripts

### Running the Application

```bash
# Start development server with hot reload
pnpm dev

# Start with debug logging
DEBUG=jack:* pnpm dev

# Start specific component
pnpm dev:gateway        # API server only
pnpm dev:dashboard      # Dashboard frontend only
pnpm dev:widget         # Chat widget only
```

### Database Operations

```bash
# Run migrations
pnpm db:migrate

# Create new migration
pnpm db:migrate:create add_guest_tags

# Generate migration from schema changes
pnpm db:generate

# Reset database (deletes all data)
pnpm db:reset

# Seed development data
pnpm db:seed

# Open database in browser UI
pnpm db:studio
```

### Testing

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/services/guest.test.ts

# Run with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

### Code Quality

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Type check
pnpm typecheck

# Run all checks (lint + types + tests)
pnpm check
```

### Building

```bash
# Build for production
pnpm build

# Build Docker image
pnpm docker:build

# Run Docker container locally
pnpm docker:run
```

---

## Database Management

### SQLite Location

The database is stored at `./data/jack.db` by default. To use a different location:

```bash
DATABASE_PATH=/path/to/your/database.db pnpm dev
```

### Viewing the Database

**Option 1: Drizzle Studio (built-in)**
```bash
pnpm db:studio
# Opens browser at http://localhost:4983
```

**Option 2: DB Browser for SQLite**
- Download from [sqlitebrowser.org](https://sqlitebrowser.org)
- Open `data/jack.db`

**Option 3: Command line**
```bash
sqlite3 data/jack.db
sqlite> .tables
sqlite> SELECT * FROM guests LIMIT 5;
```

### Backup & Restore

```bash
# Backup (just copy the file)
cp data/jack.db data/jack.db.backup

# Restore
cp data/jack.db.backup data/jack.db
```

---

## Local LLM with Ollama

For development without API costs or for testing offline mode:

### Install Ollama

```bash
# macOS
brew install ollama

# Start Ollama service
ollama serve
```

### Pull Models

```bash
# Chat model
ollama pull llama3.1

# Embeddings model
ollama pull nomic-embed-text
```

### Configure Jack

```bash
# .env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Set as primary provider
LLM_PROVIDER=ollama
```

---

## Webhook Testing

For testing WhatsApp, Twilio, and other webhooks locally:

### Using ngrok

```bash
# Install
brew install ngrok  # macOS

# Start tunnel
ngrok http 3000

# Output:
# Forwarding https://xxxx.ngrok.io -> http://localhost:3000
```

### Configure Webhooks

Update webhook URLs in provider dashboards:

| Provider | Webhook URL |
|----------|-------------|
| WhatsApp | `https://xxxx.ngrok.io/webhooks/whatsapp` |
| Twilio | `https://xxxx.ngrok.io/webhooks/twilio/sms` |
| SendGrid | `https://xxxx.ngrok.io/webhooks/email/inbound` |

---

## Email Testing

For local email testing without real SMTP:

### Using Mailhog (optional Docker)

```bash
# Run Mailhog
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

# Configure .env
SMTP_HOST=localhost
SMTP_PORT=1025

# View emails at http://localhost:8025
```

### Using Ethereal (no Docker)

```bash
# Generate test account at https://ethereal.email
# Use provided SMTP credentials in .env
```

---

## VS Code Setup

### Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker",
    "humao.rest-client",
    "vitest.explorer",
    "qwtel.sqlite-viewer"
  ]
}
```

### Workspace Settings

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "console": "integratedTerminal",
      "env": {
        "DEBUG": "jack:*"
      }
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test", "--", "--run", "${file}"],
      "console": "integratedTerminal"
    }
  ]
}
```

---

## Common Tasks

### Adding a New Channel

1. Create adapter in `src/channels/<channel>/`
2. Implement `ChannelAdapter` interface
3. Add webhook handler
4. Register in `src/channels/manager.ts`
5. Add configuration options
6. Write tests

### Adding a New PMS Integration

1. Create adapter in `src/integrations/pms/<vendor>/`
2. Implement `PMSAdapter` interface
3. Add sync configuration
4. Register in `src/integrations/manager.ts`
5. Document in `docs/04-specs/integrations/`

### Adding a New AI Skill

1. Create skill in `src/ai/skills/<skill>.ts`
2. Implement `Skill` interface
3. Define required parameters
4. Register in skill registry
5. Add to intent mapping

---

## Troubleshooting

### Database Locked

```bash
# SQLite can only have one writer at a time
# Make sure no other process is using the database

# Check for processes
lsof data/jack.db

# If stuck, restart the dev server
```

### Permission Denied on data/

```bash
# Create data directory with proper permissions
mkdir -p data
chmod 755 data
```

### TypeScript Errors After Pull

```bash
# Clean and reinstall
rm -rf node_modules
pnpm install

# Rebuild TypeScript
pnpm typecheck
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Ollama Connection Failed

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

---

## Related

- [Tech Stack](../03-architecture/tech-stack.md) - Technology choices
- [Testing Strategy](testing-strategy.md) - Testing approach
- [Deployment](deployment.md) - Production deployment
