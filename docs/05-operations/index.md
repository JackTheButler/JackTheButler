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

- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- Node.js 20+ (for development)
- API keys for AI provider (Anthropic/OpenAI)
- WhatsApp Business API access (for WhatsApp channel)

### Minimal Deployment

```bash
# Clone repository
git clone https://github.com/jackthebutler/jack.git
cd jack

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start services
docker-compose up -d

# Run database migrations
docker-compose exec gateway npm run migrate

# Access dashboard
open http://localhost:3000
```

---

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| Docker Compose | Single property, development | Low |
| Kubernetes | Multi-property, production | Medium |
| Cloud Managed | Hands-off operation | Low |

See [Deployment Guide](deployment.md) for detailed instructions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
│                    (nginx / cloud LB)                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                             │                               │
│  ┌──────────────────────────┼──────────────────────────┐   │
│  │                     Gateway (x3)                     │   │
│  │               (Node.js, WebSocket)                   │   │
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
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │PostgreSQL│  │  Redis   │  │ Vector DB│          │   │
│  │  │ (Primary)│  │ (Cluster)│  │(pgvector)│          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
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
| PostgreSQL | Continuous | 30 days | WAL archiving |
| PostgreSQL | Daily | 90 days | pg_dump |
| Redis | Hourly | 7 days | RDB snapshot |
| Configuration | On change | Forever | Git |
| Secrets | On change | Versioned | Vault |

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

### Logs Location

| Service | Log Path |
|---------|----------|
| Gateway | `/var/log/jack/gateway.log` |
| AI Engine | `/var/log/jack/ai-engine.log` |
| Channel Service | `/var/log/jack/channels.log` |
| Integration | `/var/log/jack/integrations.log` |

### Health Endpoints

| Service | Endpoint |
|---------|----------|
| Gateway | `GET /health` |
| AI Engine | `GET /health` |
| Channel Service | `GET /health` |

---

## Related

- [Architecture](../03-architecture/) - System design
- [API Specs](../04-specs/api/) - API documentation
