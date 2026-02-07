# Getting Started with Jack The Butler

This guide will help you get Jack The Butler up and running quickly.

## Prerequisites

- Docker (recommended) or Node.js 22+

---

## Installation

### One-Line Install (Recommended)

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

### From Source

```bash
git clone https://github.com/JackTheButler/JackTheButler.git
cd JackTheButler
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
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

---

## First Steps

### 1. Complete the Setup Wizard

On first access, Jack presents a **Setup Wizard** that guides you through initial configuration:

1. **Property Info** — Enter your property name and type (hotel, B&B, vacation rental)
2. **AI Provider** — Choose Local AI (default) or configure Anthropic/OpenAI with an API key
3. **Knowledge Base** — Optionally scrape your website to populate the knowledge base
4. **Admin Account** — Create your admin credentials

After completing the wizard, log in with the credentials you created.

> **Skipping Setup:** If you skip the wizard, use the default admin credentials:
> - Email: `admin@butler.com`
> - Password: `pa$$word2026`

### 2. Configure AI Provider (if not done in setup)

1. Go to **Engine > Apps**
2. Click on an AI provider (Anthropic, OpenAI, or Ollama)
3. Enter your API key
4. Click **Save** and toggle **Enabled**

### 3. Set Up a Channel (WhatsApp)

1. Go to **Engine > Apps**
2. Click on **WhatsApp**
3. Enter your Meta Business credentials:
   - Access Token
   - Phone Number ID
   - Webhook Verify Token
4. Click **Save** and toggle **Enabled**
5. Configure the webhook URL in your Meta dashboard:
   - URL: `https://your-domain.com/webhooks/whatsapp`
   - Verify Token: Your configured token

### 4. Test the Setup

1. Send a message to your WhatsApp Business number
2. You should see the conversation appear in the dashboard
3. Jack will respond automatically using AI

---

## API Usage

### Authentication

```bash
# Get access token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@butler.com", "password": "pa$$word2026"}'

# Response: { "accessToken": "...", "refreshToken": "..." }
```

### Making Requests

```bash
# List conversations
curl http://localhost:3000/api/v1/conversations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get conversation messages
curl http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Send a message
curl -X POST http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from the API!"}'
```

---

## WebSocket Connection

Connect to receive real-time updates:

```javascript
// Connect with JWT token
const ws = new WebSocket('ws://localhost:3000/ws?token=YOUR_ACCESS_TOKEN');

ws.onopen = () => {
  console.log('Connected to Jack');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type, message.payload);
};

// Message types:
// - connected: Connection confirmed
// - stats:tasks: Task statistics
// - stats:conversations: Conversation statistics
// - stats:approvals: Approval queue stats
// - conversation:new: New conversation
// - conversation:message: New message
// - task:created: Task created
// - task:updated: Task updated
```

---

## Production Configuration

For production, set your own secrets:

```bash
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e JWT_SECRET=your-secret-min-32-chars \
  -e ENCRYPTION_KEY=your-key-min-32-chars \
  ghcr.io/jackthebutler/jackthebutler:latest
```

Or use an environment file:

```bash
docker run -d \
  --name jack \
  --restart unless-stopped \
  -p 3000:3000 \
  -v jack-data:/app/data \
  --env-file .env \
  ghcr.io/jackthebutler/jackthebutler:latest
```

---

## Next Steps

- [Configuration Guide](./configuration.md) - Detailed configuration options
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Getting Help

- Documentation: https://jackthebutler.com/docs
- Issues: https://github.com/JackTheButler/JackTheButler/issues
- Support: support@jackthebutler.com
