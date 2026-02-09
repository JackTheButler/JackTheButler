# Jack The Butler

### The Open-Source Hotel Chatbot That Never Sleeps

> **Jack** - Joint AI Control Kernel
> A free, self-hosted AI concierge for hotels and hospitality

[![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)](LICENSE.txt)
[![Website](https://img.shields.io/badge/Website-JackTheButler.com-blue)](https://jackthebutler.com)
[![Deploy on Railway](https://img.shields.io/badge/Deploy-Railway-blueviolet)](https://railway.com/deploy/jack-the-butler)

**Website**: [https://jackthebutler.com](https://jackthebutler.com)

---

## What is Jack?

Jack The Butler is a **free, open-source hotel chatbot** that handles guest communication 24/7 across WhatsApp, SMS, email, and web chat. Unlike expensive SaaS solutions, Jack is **self-hosted** — your data stays on your server.

**Perfect for:**
- Hotels looking for an **AI concierge** without per-message fees
- Properties wanting to **automate guest messaging** on WhatsApp
- Hospitality businesses needing **24/7 automated responses**

Jack acts as a central hub connecting:

- **Guest channels** (WhatsApp, SMS, web chat, email)
- **Staff interfaces** (dashboard, internal messaging)
- **Hotel systems** (PMS, POS, housekeeping, maintenance)

The AI chatbot handles routine guest requests autonomously while intelligently routing complex issues to the right staff members with full context.

---

## Features

- **Hotel chatbot** - Automated guest messaging 24/7
- **Multi-channel inbox** - WhatsApp, SMS, Email, Web Chat in one dashboard
- **AI-powered responses** - Claude, GPT, or local models (no API costs)
- **Knowledge base** - Semantic search over your hotel information
- **Smart escalation** - Routes complex requests to staff automatically
- **Self-hosted** - Your data stays on your server, GDPR compliant
- **Free forever** - No per-message fees, no per-room pricing
- **Easy setup** - Deploy in 5 minutes, single SQLite database

---

## Quick Start

### Option A: Deploy to Cloud (Easiest)

Deploy Jack with one click - no installation needed:

| Railway | Render | Zeabur |
|---------|--------|--------|
| [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/W82qDp?referralCode=Aizkfk) | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/JackTheButler/JackTheButler) | [![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates?repo=JackTheButler/JackTheButler) |

1. Click a deploy button above
2. Sign up (email or Google - no GitHub needed)
3. Click **Deploy**
4. Wait for build to complete (~3-5 min)
5. Click the provided URL to access your dashboard

Your Jack will be live at a public URL with automatic HTTPS.

> **Pricing:** All providers have free tiers. For production use, expect ~$5-10/month.

---

### Option B: Install Locally

#### Step 1: Install Docker (if you don't have it)

Docker is a tool that runs Jack in an isolated container. It's free and easy to install:

| Operating System | Installation |
|------------------|--------------|
| **Mac** | Download [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/) |
| **Windows** | Download [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) |
| **Linux** | Run: `curl -fsSL https://get.docker.com \| sh` |

After installing, make sure Docker is running (you'll see the Docker icon in your system tray/menu bar).

#### Step 2: Install Jack

Open your terminal (Mac: Terminal app, Windows: PowerShell) and paste this command:

```bash
curl -fsSL https://raw.githubusercontent.com/JackTheButler/JackTheButler/main/install.sh | bash
```

That's it! The installer will download and start Jack automatically.

#### Step 3: Complete Setup Wizard

Once installation completes, open your web browser and go to:

**http://localhost:3000**

The **Setup Wizard** will guide you through:
1. **Property Info** - Enter your property name and type
2. **AI Provider** - Choose Local AI or configure Anthropic/OpenAI
3. **Knowledge Base** - Optionally import from your website
4. **Admin Account** - Create your login credentials

> **Skip Setup?** If you skip the wizard, use default credentials:
> - Email: `admin@butler.com`
> - Password: `pa$$word2026`

#### Step 4: You're Ready!

After completing setup, Jack is ready to use. You can:
- View and respond to guest conversations
- Manage tasks assigned to staff
- Add more knowledge to the knowledge base
- Configure additional channels (WhatsApp, SMS, Email) in **Engine > Apps**

---

## Managing Jack

Common commands to manage your Jack installation:

| Action | Command |
|--------|---------|
| **Stop Jack** | `docker stop jack` |
| **Start Jack** | `docker start jack` |
| **View logs** | `docker logs -f jack` |
| **Restart Jack** | `docker restart jack` |
| **Uninstall Jack** | `docker rm -f jack` |

---

## For Developers

### Manual Docker Install

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
git clone git@github.com:JackTheButler/JackTheButler.git
cd JackTheButler
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

### API & WebSocket Access

| Interface | URL | Description |
|-----------|-----|-------------|
| **Dashboard** | http://localhost:3000 | Staff web interface |
| **REST API** | http://localhost:3000/api/v1 | JSON API for integrations |
| **WebSocket** | ws://localhost:3000/ws | Real-time updates (requires JWT) |
| **Health Check** | http://localhost:3000/health | Server health status |
| **Webhooks** | http://localhost:3000/webhooks/* | WhatsApp, SMS, Email webhooks |

### API Authentication

```bash
# Get access token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@butler.com", "password": "pa$$word2026"}'

# Use token in requests
curl http://localhost:3000/api/v1/conversations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

<details>
<summary>WebSocket Connection Example</summary>

```javascript
// Connect with JWT token
const ws = new WebSocket('ws://localhost:3000/ws?token=YOUR_ACCESS_TOKEN');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type, message.payload);
};

// Message types received:
// - connected: Initial connection confirmation
// - stats:tasks: Task statistics update
// - stats:conversations: Conversation statistics update
// - stats:approvals: Approval queue update
// - conversation:new: New conversation created
// - conversation:message: New message in conversation
// - task:created: New task created
// - task:updated: Task status changed
```

</details>

---

## Documentation

See the [docs](docs/) folder for full documentation:

- [Vision & Goals](docs/01-vision/)
- [Use Cases](docs/02-use-cases/)
- [Architecture](docs/03-architecture/)
- [API Specs](docs/04-specs/)
- [Operations](docs/05-operations/)
- [User Guide](docs/user-guide/) - For hotel staff

---

## Tech Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript
- **Web Framework**: Hono
- **Database**: SQLite + Drizzle ORM
- **AI**: Anthropic Claude, OpenAI, Ollama, Local (Transformers.js)
- **Dashboard**: React + Vite + Tailwind CSS

---

## License

This project is licensed under the [Elastic License 2.0](LICENSE.txt).

**You may:**
- Use Jack for free at your property
- Modify the source code for your own use
- Self-host on your own infrastructure

**You may not:**
- Provide Jack to third parties as a hosted or managed service
- Remove or circumvent any license key functionality

---

## Contributing

We welcome contributions! By submitting a pull request, you agree to our [Contributor License Agreement](CLA.md).

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

By submitting a PR, you agree to the terms in [CLA.md](CLA.md).

---

## Support

- **Website**: [https://jackthebutler.com](https://jackthebutler.com)
- **Issues**: [GitHub Issues](https://github.com/JackTheButler/JackTheButler/issues)
- **Documentation**: [docs/](docs/)

---

## Why Jack?

| Feature | Jack | Other Hotel Chatbots |
|---------|------|---------------------|
| **Price** | Free | $200-2000/month |
| **Per-message fees** | None | $0.01-0.10/message |
| **Self-hosted** | ✅ | ❌ |
| **Open source** | ✅ | ❌ |
| **Data ownership** | 100% yours | Vendor servers |
| **WhatsApp support** | ✅ | ✅ |
| **Local AI option** | ✅ | ❌ |

---

**Keywords**: hotel chatbot, AI hotel concierge, hotel WhatsApp automation, guest messaging software, hotel virtual assistant, self-hosted hotel software, open source hotel chatbot, AI for hospitality

Built with ❤️ for the hospitality industry — [https://jackthebutler.com](https://jackthebutler.com)
