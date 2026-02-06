# Operations

Deployment, configuration, and operational guides for Jack The Butler.

---

## Documents

| Document | Description |
|----------|-------------|
| [Local Development](local-development.md) | Development environment setup |
| [Deployment](deployment.md) | Production deployment guide |
| [Configuration](configuration.md) | Configuration reference |
| [Testing Strategy](testing-strategy.md) | Testing approach |
| [Logging](logging.md) | Structured logging standard |
| [Error Handling](error-handling.md) | Error handling patterns |

---

## Quick Start

### Prerequisites

- Docker (recommended) or Node.js 22+

No external databases required — Jack uses embedded SQLite.

### Minimal Deployment

```bash
curl -fsSL https://raw.githubusercontent.com/JackTheButler/JackTheButler/main/install.sh | bash
```

Or with Docker directly:

```bash
docker run -d \
  --name jack \
  -p 3000:3000 \
  -v jack-data:/app/data \
  ghcr.io/jackthebutler/jackthebutler:latest
```

Access dashboard at `http://localhost:3000`. Configure AI provider in **Engine > Apps**.

---

## Backup

SQLite makes backups simple — just copy the database file:

```bash
# Backup
cp data/jack.db data/jack.db.backup

# Restore
cp data/jack.db.backup data/jack.db
```

---

## Health Check

```bash
curl http://localhost:3000/health
```

---

## Related

- [Architecture](../03-architecture/) — System design
- [API Specs](../04-specs/api/) — API documentation
