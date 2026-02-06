# Getting Started with Jack The Butler

This guide will help you get Jack The Butler up and running quickly.

## Prerequisites

- Docker or Node.js 22+

## Quick Start with Docker

The fastest way to run Jack is with Docker:

```bash
docker run -d \
  --name jack \
  -p 3000:3000 \
  -v jack-data:/app/data \
  jackthebutler/jack:latest
```

Jack is now running at http://localhost:3000. Configure AI provider in **Engine > Apps**.

## Quick Start with Node.js

1. Clone the repository:
```bash
git clone https://github.com/jackthebutler/jack.git
cd jack
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Run database migrations:
```bash
pnpm db:migrate
```

5. Start the server:
```bash
pnpm dev
```

Jack is now running at http://localhost:3000

## First Steps

### 1. Access the Dashboard

Open http://localhost:3000 in your browser. The default admin credentials are:
- Email: `admin@hotel.com`
- Password: `admin123`

### 2. Configure AI Provider

1. Go to **Settings > Integrations**
2. Click on **AI** integration
3. Select **Anthropic** (or OpenAI)
4. Enter your API key
5. Click **Test Connection**
6. Toggle **Enabled** to activate

### 3. Set Up a Channel (WhatsApp)

1. Go to **Settings > Integrations**
2. Click on **WhatsApp** integration
3. Select **Meta Business**
4. Enter your Meta Business credentials:
   - Access Token
   - Phone Number ID
   - Webhook Verify Token
5. Click **Test Connection**
6. Configure the webhook URL in your Meta dashboard:
   - URL: `https://your-domain.com/webhooks/whatsapp`
   - Verify Token: Your configured token

### 4. Test the Setup

1. Send a message to your WhatsApp Business number
2. You should see the conversation appear in the dashboard
3. Jack will respond automatically using AI

## Next Steps

- [Configuration Guide](./configuration.md) - Detailed configuration options
- [Dashboard Guide](./dashboard-guide.md) - Learn to use the staff dashboard
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Getting Help

- Documentation: https://jackthebutler.com/docs
- Issues: https://github.com/jackthebutler/jack/issues
- Support: support@jackthebutler.com
