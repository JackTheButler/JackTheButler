# Configuration Reference

Jack The Butler is configured through environment variables. This guide covers all available options.

## Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment: `development`, `test`, or `production` |
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_PATH` | No | `./data/jack.db` | Path to SQLite database file |

## Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | Dev default | Secret for JWT signing (min 32 chars) |
| `ENCRYPTION_KEY` | **Yes** | Dev default | Key for encrypting stored credentials (min 32 chars) |
| `JWT_EXPIRES_IN` | No | `15m` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiration |

## Apps (AI, Channels, PMS)

AI providers, messaging channels, and PMS integrations are configured via the dashboard under **Engine > Apps**, not environment variables. This includes:

- **AI**: Anthropic Claude, OpenAI, Ollama, Local
- **Channels**: WhatsApp, SMS (Twilio), Email (SMTP)
- **PMS**: Mews, Cloudbeds, Opera, Apaleo

## Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `json` | Log format: `json` or `pretty` |

## Example Configuration

### Development (.env)

```bash
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/jack.db
JWT_SECRET=your-development-secret-at-least-32-chars
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

### Production (.env)

```bash
NODE_ENV=production
PORT=3000
DATABASE_PATH=/app/data/jack.db
JWT_SECRET=your-production-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-production-encryption-key-min-32-chars
LOG_LEVEL=info
LOG_FORMAT=json
```

## Docker Environment

Minimal (uses built-in defaults):

```bash
docker run -d \
  -p 3000:3000 \
  -v jack-data:/app/data \
  jackthebutler/jack:latest
```

For production, set your own secrets:

```bash
docker run -d \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e JWT_SECRET=your-jwt-secret-min-32-chars \
  -e ENCRYPTION_KEY=your-encryption-key-min-32-chars \
  jackthebutler/jack:latest
```

Or use a `.env` file:

```bash
docker run -d \
  --env-file .env \
  jackthebutler/jack:1.0.0
```

## Configuration via Dashboard

Most integrations can also be configured through the dashboard:

1. Go to **Settings > Integrations**
2. Select the integration to configure
3. Fill in the required fields
4. Click **Save** and **Test Connection**

Dashboard configuration is stored encrypted in the database and takes precedence over environment variables.
