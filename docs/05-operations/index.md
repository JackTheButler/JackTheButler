# Operations

Deployment, configuration, and operational guides for Jack The Butler.

---

## Overview

This section covers running Jack in production, including:
- Deployment options and guides
- Configuration reference
- Monitoring and alerting
- Troubleshooting runbooks

---

## Documents

| Document | Description |
|----------|-------------|
| [Deployment](deployment.md) | Installation and deployment guide |
| [Configuration](configuration.md) | Configuration reference |
| [Runbooks](runbooks/) | Operational procedures |

---

## Quick Start

### Prerequisites

- Docker (recommended) or Node.js 22+
- API key for AI provider (Anthropic recommended)
- WhatsApp Business API access (optional, for WhatsApp channel)

No external databases required - Jack uses embedded SQLite.

### Minimal Deployment

```bash
# One-command Docker deployment
docker run -d \
  --name jack \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e JWT_SECRET=your-secure-secret-min-32-chars \
  jackthebutler/jack:latest

# Access dashboard
open http://localhost:3000
```

---

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| Docker (recommended) | Most deployments | Low |
| Direct Node.js | Custom environments | Low |
| Docker Compose | With local LLM (Ollama) | Medium |

See [Deployment Guide](deployment.md) for detailed instructions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    JACK THE BUTLER                          │
│                  (Single Container)                         │
├─────────────────────────────────────────────────────────────┤
│                             │                               │
│  ┌──────────────────────────┼──────────────────────────┐   │
│  │                   Gateway (Node.js)                   │   │
│  │              REST API • WebSocket • Webhooks         │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                             │                               │
│         ┌───────────────────┼───────────────────┐          │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐     │
│  │  Channel   │     │    AI      │     │Integration │     │
│  │  Service   │     │  Engine    │     │  Service   │     │
│  └────────────┘     └────────────┘     └────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Data Layer                        │   │
│  │  ┌────────────────────────────────────────────────┐ │   │
│  │  │  SQLite + sqlite-vec (embedded, single file)    │   │
│  │  │  Guests • Conversations • Tasks • Embeddings   │   │
│  │  └────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Monitoring Stack

### Recommended Tools

| Purpose | Tool |
|---------|------|
| Metrics | Prometheus + Grafana |
| Logs | Loki or ELK |
| Traces | Jaeger |
| Alerts | Alertmanager or PagerDuty |
| Uptime | Better Uptime or Pingdom |

### Key Metrics

| Category | Metrics |
|----------|---------|
| Gateway | Request rate, latency, error rate, WebSocket connections |
| AI Engine | Inference latency, token usage, confidence distribution |
| Channels | Message delivery rate, failures by channel |
| Tasks | Creation rate, completion time, SLA breaches |
| Business | Conversations/day, resolution rate, CSAT |

---

## Backup Strategy

| Data | Frequency | Retention | Method |
|------|-----------|-----------|--------|
| SQLite Database | Daily | 30 days | File copy (`cp jack.db backup.db`) |
| Configuration | On change | Forever | Git |
| Secrets | On change | Versioned | Environment file backup |

SQLite makes backups simple - just copy the database file while the application is idle or use SQLite's `.backup` command.

---

## Security Checklist

- [ ] All traffic over TLS
- [ ] API authentication enforced
- [ ] Secrets in secure vault
- [ ] Database encrypted at rest
- [ ] Network segmentation
- [ ] Regular security updates
- [ ] Audit logging enabled
- [ ] Penetration testing scheduled

---

## Support

### Logs

Jack logs to stdout/stderr in JSON format (via Pino). View logs with:

```bash
# Docker
docker logs jack

# Direct Node.js
# Logs go to stdout, redirect as needed
```

### Health Endpoint

```bash
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

---

## Related

- [Architecture](../03-architecture/) - System design
- [API Specs](../04-specs/api/) - API documentation
