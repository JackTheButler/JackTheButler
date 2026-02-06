# Deployment

Deploying Jack The Butler to production environments.

---

## Overview

Jack The Butler is designed for **self-hosted deployment** on hotel infrastructure. Each hotel runs their own instance, keeping guest data on their own servers.

### Deployment Options

| Method | Complexity | Best For |
|--------|------------|----------|
| Docker (recommended) | Low | Most deployments |
| Direct Node.js | Low | Custom environments |
| Docker Compose | Medium | With local LLM (Ollama) |

---

## Docker Deployment (Recommended)

### One-Command Deploy

```bash
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  jackthebutler/jack:latest
```

That's it. Jack is now running at `http://localhost:3000`. Configure AI provider in **Engine > Apps**.

For production, set your own secrets (see [Configuration](configuration.md)).

### Configuration via Environment

```bash
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  --env-file /path/to/.env \
  jackthebutler/jack:latest
```

### Environment File

```bash
# /path/to/.env

# Core
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (stored in volume)
DATABASE_PATH=/app/data/jack.db

# Security (CHANGE THESE!)
JWT_SECRET=generate-a-secure-random-string-min-32-chars
ENCRYPTION_KEY=another-secure-random-string-32-chars

# AI and channels are configured via dashboard (Engine > Apps)

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hotel@gmail.com
SMTP_PASSWORD=app-specific-password
```

---

## Docker Compose Deployment

For deployments with additional services (like Ollama for local LLM):

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  jack:
    image: jackthebutler/jack:latest
    container_name: jack
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - jack-data:/app/data
    env_file:
      - .env
    depends_on:
      - ollama  # Optional

  # Optional: Local LLM
  ollama:
    image: ollama/ollama:latest
    container_name: jack-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  jack-data:
  ollama-data:
```

### Commands

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f jack

# Stop
docker compose down

# Update
docker compose pull
docker compose up -d
```

---

## Direct Node.js Deployment

For environments where Docker isn't available:

### Prerequisites

```bash
# Install Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm
```

### Installation

```bash
# Clone repository
git clone https://github.com/jackthebutler/jack.git
cd jack

# Install dependencies
pnpm install --frozen-lockfile

# Build
pnpm build

# Configure
cp .env.example .env
nano .env  # Edit configuration
```

### Running

```bash
# Start directly
node dist/index.js

# Or use PM2 for process management
npm install -g pm2
pm2 start dist/index.js --name jack
pm2 save
pm2 startup  # Auto-start on boot
```

---

## Reverse Proxy Setup

### Nginx

```nginx
# /etc/nginx/sites-available/jack
server {
    listen 80;
    server_name jack.yourhotel.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name jack.yourhotel.com;

    ssl_certificate /etc/letsencrypt/live/jack.yourhotel.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jack.yourhotel.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for chat
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/jack /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy (Simpler)

```caddyfile
# /etc/caddy/Caddyfile
jack.yourhotel.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

---

## SSL/TLS Certificates

### Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d jack.yourhotel.com

# Auto-renewal (added automatically)
sudo certbot renew --dry-run
```

---

## Data Persistence

### Backup Strategy

Jack stores all data in a single SQLite file, making backups simple:

```bash
# Manual backup
docker exec jack sqlite3 /app/data/jack.db ".backup '/app/data/backup.db'"
docker cp jack:/app/data/backup.db ./backups/jack-$(date +%Y%m%d).db

# Automated daily backup
cat > /etc/cron.daily/jack-backup << 'EOF'
#!/bin/bash
BACKUP_DIR=/backups/jack
mkdir -p $BACKUP_DIR
docker exec jack sqlite3 /app/data/jack.db ".backup '/app/data/backup.db'"
docker cp jack:/app/data/backup.db $BACKUP_DIR/jack-$(date +%Y%m%d).db
# Keep last 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/jack-backup
```

### Restore from Backup

```bash
# Stop Jack
docker stop jack

# Restore database
docker cp ./backups/jack-20240115.db jack:/app/data/jack.db

# Start Jack
docker start jack
```

---

## Updating

### Docker Update

```bash
# Pull latest image
docker pull jackthebutler/jack:latest

# Stop current container
docker stop jack

# Remove old container (data is preserved in volume)
docker rm jack

# Start new container
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  --env-file /path/to/.env \
  jackthebutler/jack:latest

# Run migrations (if needed)
docker exec jack pnpm db:migrate
```

### Direct Node.js Update

```bash
cd /path/to/jack

# Backup database
cp data/jack.db data/jack.db.backup

# Pull latest
git pull

# Install dependencies
pnpm install --frozen-lockfile

# Build
pnpm build

# Run migrations
pnpm db:migrate

# Restart
pm2 restart jack
```

---

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "database": "connected",
  "channels": {
    "whatsapp": "connected",
    "sms": "connected",
    "email": "connected",
    "webchat": "connected"
  }
}
```

### Docker Health Check

```bash
docker inspect --format='{{.State.Health.Status}}' jack
```

### Simple Monitoring Script

```bash
#!/bin/bash
# /usr/local/bin/check-jack.sh

HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status')

if [ "$HEALTH" != "healthy" ]; then
  echo "Jack is unhealthy, restarting..."
  docker restart jack
  # Send alert (optional)
  # curl -X POST https://hooks.slack.com/... -d '{"text":"Jack restarted"}'
fi
```

```bash
# Run every 5 minutes
echo "*/5 * * * * /usr/local/bin/check-jack.sh" | crontab -
```

---

## Resource Requirements

### Minimum

| Resource | Requirement |
|----------|-------------|
| CPU | 1 core |
| RAM | 512 MB |
| Disk | 1 GB |

### Recommended

| Resource | Requirement |
|----------|-------------|
| CPU | 2 cores |
| RAM | 1 GB |
| Disk | 10 GB |

### With Local LLM (Ollama)

| Resource | Requirement |
|----------|-------------|
| CPU | 4+ cores |
| RAM | 8+ GB |
| Disk | 20+ GB |
| GPU | Optional (faster inference) |

---

## Disaster Recovery

### Recovery Targets

| Metric | Target | Description |
|--------|--------|-------------|
| **RTO** (Recovery Time Objective) | < 1 hour | Maximum acceptable downtime |
| **RPO** (Recovery Point Objective) | < 24 hours | Maximum acceptable data loss |

### Failure Scenarios and Recovery

| Scenario | Detection | Recovery Procedure | RTO |
|----------|-----------|-------------------|-----|
| Container crash | Health check fails, auto-restart | Docker `--restart unless-stopped` handles automatically | < 1 min |
| Database corruption | Integrity check fails on startup | Restore from daily backup | < 30 min |
| Server failure | External monitoring (e.g., Pingdom) | Spin up new server, restore backup, reconfigure DNS | < 1 hour |
| Data volume loss | Docker volume gone | Restore from off-site backup | < 1 hour |
| Ransomware/security breach | Manual detection, monitoring alerts | Isolate, rebuild from clean backup, rotate all secrets | 2-4 hours |

### Recovery Runbook

```bash
#!/bin/bash
# disaster-recovery.sh - Jack The Butler Recovery Procedure

echo "=== Jack The Butler Disaster Recovery ==="
echo "1. Verifying backup availability..."

# Step 1: Check backup exists
LATEST_BACKUP=$(ls -t /backups/jack/*.db | head -1)
if [ -z "$LATEST_BACKUP" ]; then
    echo "ERROR: No backup found! Check off-site storage."
    exit 1
fi
echo "   Latest backup: $LATEST_BACKUP"

# Step 2: Verify backup integrity
echo "2. Verifying backup integrity..."
sqlite3 "$LATEST_BACKUP" "PRAGMA integrity_check" | grep -q "ok"
if [ $? -ne 0 ]; then
    echo "ERROR: Backup file corrupted!"
    exit 1
fi
echo "   Backup integrity: OK"

# Step 3: Stop any existing container
echo "3. Stopping existing containers..."
docker stop jack 2>/dev/null || true
docker rm jack 2>/dev/null || true

# Step 4: Create fresh data volume
echo "4. Preparing data volume..."
docker volume rm jack-data 2>/dev/null || true
docker volume create jack-data

# Step 5: Copy backup to new volume
echo "5. Restoring database from backup..."
docker run --rm -v jack-data:/app/data -v /backups/jack:/backup alpine \
    cp /backup/$(basename $LATEST_BACKUP) /app/data/jack.db

# Step 6: Start Jack
echo "6. Starting Jack..."
docker run -d \
    --name jack \
    --restart unless-stopped \
    -p 3000:3000 \
    -v jack-data:/app/data \
    --env-file /etc/jack/.env \
    jackthebutler/jack:latest

# Step 7: Wait for health check
echo "7. Waiting for service to be healthy..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health | grep -q "healthy"; then
        echo "   Service is healthy!"
        break
    fi
    sleep 2
done

# Step 8: Verify channels
echo "8. Verifying channel connections..."
curl -s http://localhost:3000/health | jq '.channels'

echo "=== Recovery Complete ==="
echo "Data restored from: $LATEST_BACKUP"
echo "IMPORTANT: Notify operations team and verify guest messaging."
```

### Off-Site Backup

Store backups in at least two locations:

```bash
# Daily backup to off-site storage (S3, Azure Blob, etc.)
cat > /etc/cron.daily/jack-offsite-backup << 'EOF'
#!/bin/bash
BACKUP_FILE=/backups/jack/jack-$(date +%Y%m%d).db

# Create backup
docker exec jack sqlite3 /app/data/jack.db ".backup '/app/data/backup.db'"
docker cp jack:/app/data/backup.db $BACKUP_FILE

# Upload to S3 (example)
aws s3 cp $BACKUP_FILE s3://hotel-backups/jack/

# Or Azure Blob
# az storage blob upload -f $BACKUP_FILE -c jack-backups -n jack-$(date +%Y%m%d).db

# Or simple rsync to another server
# rsync -avz $BACKUP_FILE backup-server:/backups/jack/
EOF
chmod +x /etc/cron.daily/jack-offsite-backup
```

### Testing Recovery

Run recovery drills quarterly:

1. **Monthly**: Verify backup integrity (`sqlite3 backup.db "PRAGMA integrity_check"`)
2. **Quarterly**: Full recovery drill to staging environment
3. **Annually**: Complete disaster simulation with team

---

## Monitoring & Alerting

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Health check | 2 failures | 5 failures | Restart container, page on-call |
| Response time (p95) | > 2s | > 5s | Investigate, scale if needed |
| Error rate (5xx) | > 1% | > 5% | Investigate logs, page on-call |
| Database size | > 5 GB | > 8 GB | Archive old conversations |
| Disk usage | > 70% | > 90% | Clean up logs, expand disk |
| Memory usage | > 70% | > 90% | Restart, investigate leak |
| CPU usage (sustained) | > 70% | > 90% | Scale up, investigate |
| Message queue depth | > 100 | > 500 | Investigate backlog |
| Webhook failures | > 5/min | > 20/min | Check channel status |
| AI latency (p95) | > 5s | > 10s | Check AI provider status |
| Escalation queue | > 20 | > 50 | Alert supervisors |
| SLA breaches | > 5/hour | > 10/hour | Page duty manager |

### On-Call Schedule

```yaml
# /etc/jack/oncall.yaml
escalation:
  levels:
    - name: primary
      contacts:
        - type: pagerduty
          service_key: ${PAGERDUTY_SERVICE_KEY}
      wait_minutes: 5

    - name: secondary
      contacts:
        - type: phone
          number: ${ONCALL_PHONE}
        - type: email
          address: ${ONCALL_EMAIL}
      wait_minutes: 15

    - name: management
      contacts:
        - type: phone
          number: ${MANAGER_PHONE}
      wait_minutes: 30

  quiet_hours:
    start: "22:00"
    end: "08:00"
    severity_override: critical  # Only page for critical during quiet hours
```

### Alert Routing

| Alert Type | Primary | Escalation | Response SLA |
|------------|---------|------------|--------------|
| Container unhealthy | On-call engineer | Manager | 15 min |
| Database error | On-call engineer | Manager | 15 min |
| Channel outage | On-call engineer | Manager | 30 min |
| AI provider down | On-call engineer | N/A (auto-fallback) | Monitor |
| Security alert | Security team | Management | Immediate |
| Guest complaint SLA breach | Duty manager | GM | 30 min |

### Example Alertmanager Config

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true

    - match:
        alertname: 'HighErrorRate'
      receiver: 'slack-engineering'

receivers:
  - name: 'default'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#jack-alerts'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        severity: critical

  - name: 'slack-engineering'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#jack-engineering'
```

---

## Cost Tracking

### AI Provider Costs

Track AI API costs per provider:

```typescript
interface AIUsageMetrics {
  provider: 'anthropic' | 'openai' | 'local';
  inputTokens: number;
  outputTokens: number;
  requests: number;
  estimatedCost: number;  // USD
}

// Cost rates (as of 2025, check current pricing)
const COST_PER_1K_TOKENS = {
  anthropic: { input: 0.003, output: 0.015 },  // Claude Sonnet
  openai: { input: 0.005, output: 0.015 },     // GPT-4o
  local: { input: 0, output: 0 }               // Ollama (free)
};

async function trackAICost(
  provider: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const rates = COST_PER_1K_TOKENS[provider];
  const cost = (inputTokens / 1000 * rates.input) + (outputTokens / 1000 * rates.output);

  await db.aiUsage.create({
    data: {
      provider,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
      timestamp: new Date()
    }
  });

  // Update daily aggregate
  await updateDailyAggregate(provider, inputTokens, outputTokens, cost);
}
```

### Cost Dashboard Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Daily AI spend | Total AI API cost per day | > $50/day |
| Cost per conversation | Average AI cost per conversation | > $0.50 |
| Cost per guest | Average AI cost per unique guest | > $2/stay |
| Token efficiency | Output/Input token ratio | > 3:1 (may indicate verbose responses) |
| Fallback usage | % requests using fallback provider | > 10% |

### Budget Alerts

```yaml
costs:
  ai:
    daily_budget: 100         # USD
    monthly_budget: 2500      # USD
    alerts:
      - threshold: 0.8        # 80% of budget
        action: notify
      - threshold: 1.0        # 100% of budget
        action: notify_urgent
      - threshold: 1.2        # 120% of budget
        action: fallback_to_local  # Switch to Ollama if configured

  sms:
    monthly_budget: 500       # USD
    per_message_cost: 0.0075  # USD (Twilio rate)
    alerts:
      - threshold: 0.9
        action: notify
```

### Cost per Conversation Tracking

```sql
-- Example query to track cost per conversation
SELECT
  DATE(c.created_at) as date,
  COUNT(DISTINCT c.id) as conversations,
  SUM(au.input_tokens) as total_input_tokens,
  SUM(au.output_tokens) as total_output_tokens,
  SUM(au.estimated_cost) as total_cost,
  SUM(au.estimated_cost) / COUNT(DISTINCT c.id) as cost_per_conversation
FROM conversations c
JOIN ai_usage au ON au.conversation_id = c.id
WHERE c.created_at >= DATE('now', '-30 days')
GROUP BY DATE(c.created_at)
ORDER BY date DESC;
```

### ROI Tracking

| Metric | Calculation | Target |
|--------|-------------|--------|
| Cost savings vs staff | (avg staff time per request × hourly rate) - AI cost | > 80% savings |
| Guest satisfaction delta | CSAT with Jack - CSAT before Jack | > +0.5 points |
| Response time improvement | Avg response time before - Avg with Jack | > 90% faster |
| Staff hours saved | Requests handled by AI × avg staff time per request | Track monthly |

---

## Security Checklist

- [ ] Change default JWT_SECRET and ENCRYPTION_KEY
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Configure firewall (only expose ports 80, 443)
- [ ] Set up regular backups
- [ ] Keep Docker/Node.js updated
- [ ] Review channel webhook secrets
- [ ] Enable rate limiting
- [ ] Set LOG_LEVEL=info in production

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs jack

# Common issues:
# - Missing environment variables
# - Port already in use
# - Permission issues on data volume
```

### Database Errors

```bash
# Check database integrity
docker exec jack sqlite3 /app/data/jack.db "PRAGMA integrity_check"

# If corrupted, restore from backup
docker stop jack
docker cp ./backups/latest.db jack:/app/data/jack.db
docker start jack
```

### High Memory Usage

```bash
# Check memory
docker stats jack

# SQLite is memory efficient, high usage usually means:
# - Large conversation history (consider archiving)
# - Memory leak (update to latest version)
```

### Webhook Not Receiving

```bash
# Check if port is accessible
curl -I https://jack.yourhotel.com/health

# Verify webhook configuration in provider dashboard
# Check firewall rules
sudo ufw status
```

---

## Related

- [Local Development](local-development.md) - Development setup
- [Configuration](configuration.md) - All configuration options
- [Tech Stack](../03-architecture/tech-stack.md) - Technology choices
