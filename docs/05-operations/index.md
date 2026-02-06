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

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/JackTheButler/JackTheButler/main/install.sh | bash
```

### Docker

```bash
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  ghcr.io/jackthebutler/jackthebutler:latest
```

---

## Accessing Jack

Once running, Jack exposes the following on port `3000`:

| Interface | URL | Description |
|-----------|-----|-------------|
| **Dashboard** | http://localhost:3000 | Staff web interface |
| **REST API** | http://localhost:3000/api/v1 | JSON API for integrations |
| **WebSocket** | ws://localhost:3000/ws | Real-time updates (requires JWT) |
| **Health Check** | http://localhost:3000/health | Server health status |
| **Webhooks** | http://localhost:3000/webhooks/* | Inbound webhooks |

Default credentials: `admin@butler.com` / `pa$$word2026`

Configure AI provider in **Engine > Apps**.

---

## Backup

SQLite makes backups simple — just copy the database file:

```bash
# Backup
docker exec jack sqlite3 /app/data/jack.db ".backup '/app/data/backup.db'"
docker cp jack:/app/data/backup.db ./backup.db

# Restore
docker stop jack
docker cp ./backup.db jack:/app/data/jack.db
docker start jack
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
- [User Guide](../user-guide/) — For hotel staff
