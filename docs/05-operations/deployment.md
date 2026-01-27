# Deployment Guide

Installation and deployment instructions for Jack The Butler.

---

## Prerequisites

### Required

- Docker 24+ and Docker Compose 2.20+
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)
- 4GB RAM minimum (8GB recommended)
- 20GB disk space

### API Keys

- **Anthropic API Key** - For Claude AI (primary)
- **OpenAI API Key** - Optional, for fallback/embeddings
- **Twilio Account** - For SMS channel
- **WhatsApp Business API** - For WhatsApp channel

---

## Docker Compose Deployment

### 1. Clone Repository

```bash
git clone https://github.com/jackthebutler/jack.git
cd jack
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Database
DATABASE_URL=postgresql://jack:password@postgres:5432/jack
REDIS_URL=redis://redis:6379

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # Optional

# Channels
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...

# Security
JWT_SECRET=your-secure-random-string
ENCRYPTION_KEY=your-32-byte-key

# Property
DEFAULT_PROPERTY_NAME=The Grand Hotel
DEFAULT_TIMEZONE=America/New_York
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f gateway
```

### 4. Initialize Database

```bash
# Run migrations
docker-compose exec gateway npm run db:migrate

# Seed initial data (optional)
docker-compose exec gateway npm run db:seed
```

### 5. Access Dashboard

Open `http://localhost:3000` in your browser.

Default admin credentials:
- Email: `admin@hotel.com`
- Password: `changeme`

**Change the password immediately.**

---

## Docker Compose Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  gateway:
    image: jackthebutler/gateway:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  channel-service:
    image: jackthebutler/channel-service:latest
    environment:
      - GATEWAY_URL=http://gateway:3000
      - REDIS_URL=${REDIS_URL}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - WHATSAPP_ACCESS_TOKEN=${WHATSAPP_ACCESS_TOKEN}
    depends_on:
      - gateway
      - redis
    restart: unless-stopped

  ai-engine:
    image: jackthebutler/ai-engine:latest
    environment:
      - GATEWAY_URL=http://gateway:3000
      - DATABASE_URL=${DATABASE_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - gateway
      - postgres
    restart: unless-stopped

  integration-service:
    image: jackthebutler/integration-service:latest
    environment:
      - GATEWAY_URL=http://gateway:3000
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - gateway
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=jack
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=jack
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.25+
- kubectl configured
- Helm 3.10+

### 1. Add Helm Repository

```bash
helm repo add jackthebutler https://charts.jackthebutler.com
helm repo update
```

### 2. Create Namespace

```bash
kubectl create namespace jack
```

### 3. Create Secrets

```bash
kubectl create secret generic jack-secrets \
  --namespace jack \
  --from-literal=database-url='postgresql://...' \
  --from-literal=anthropic-api-key='sk-ant-...' \
  --from-literal=jwt-secret='...'
```

### 4. Install Chart

```bash
helm install jack jackthebutler/jack \
  --namespace jack \
  --values values.yaml
```

### values.yaml

```yaml
global:
  domain: jack.hotel.com

gateway:
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 2Gi

aiEngine:
  replicas: 2
  resources:
    requests:
      cpu: 1000m
      memory: 1Gi

postgresql:
  enabled: true
  primary:
    persistence:
      size: 50Gi

redis:
  enabled: true
  architecture: standalone

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - secretName: jack-tls
      hosts:
        - jack.hotel.com
```

### 5. Verify Deployment

```bash
kubectl get pods -n jack
kubectl get ingress -n jack
```

---

## Production Checklist

### Security

- [ ] Change default admin password
- [ ] Enable TLS for all endpoints
- [ ] Configure firewall rules
- [ ] Set up secrets management
- [ ] Enable audit logging
- [ ] Review CORS settings

### Performance

- [ ] Configure connection pooling
- [ ] Set appropriate resource limits
- [ ] Enable Redis persistence
- [ ] Configure CDN for static assets

### Reliability

- [ ] Set up database backups
- [ ] Configure health checks
- [ ] Set up monitoring
- [ ] Configure alerting
- [ ] Test failover procedures

### Integration

- [ ] Verify webhook URLs are accessible
- [ ] Test PMS connectivity
- [ ] Validate AI provider access
- [ ] Confirm channel credentials

---

## Upgrading

### Docker Compose

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Run migrations
docker-compose exec gateway npm run db:migrate
```

### Kubernetes

```bash
# Update Helm repo
helm repo update

# Upgrade release
helm upgrade jack jackthebutler/jack \
  --namespace jack \
  --values values.yaml
```

---

## Troubleshooting

### Common Issues

#### Gateway Won't Start

```bash
# Check logs
docker-compose logs gateway

# Common causes:
# - Database not ready: wait and retry
# - Missing environment variables: check .env
# - Port already in use: change port in docker-compose.yml
```

#### Database Connection Failed

```bash
# Test connection
docker-compose exec gateway npm run db:test

# Check PostgreSQL is running
docker-compose ps postgres

# Check connection string
echo $DATABASE_URL
```

#### Webhooks Not Received

```bash
# Verify webhook URL is publicly accessible
curl https://your-domain.com/webhooks/whatsapp

# Check ngrok if developing locally
ngrok http 3000
```

---

## Related

- [Configuration](configuration.md) - All configuration options
- [Architecture](../03-architecture/) - System design
- [Runbooks](runbooks/) - Operational procedures
