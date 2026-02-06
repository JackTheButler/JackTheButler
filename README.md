# Jack The Butler

> **Jack** - Joint AI Control Kernel
> A self-hosted AI assistant for the hospitality industry

[![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)](LICENSE.txt)

**Website**: [JackTheButler.com](https://jackthebutler.com)

---

## What is Jack?

Jack The Butler is a self-hosted AI assistant platform designed specifically for hotels and hospitality businesses. It acts as a central orchestration hub that connects:

- **Guest communication channels** (WhatsApp, SMS, web chat, email)
- **Staff interfaces** (dashboard, internal messaging)
- **Hotel systems** (PMS, POS, housekeeping, maintenance)

Jack handles routine guest requests autonomously while intelligently routing complex issues to the right staff members with full context.

---

## Features

- **Multi-channel messaging** - WhatsApp, SMS, Email, Web Chat
- **AI-powered responses** - Anthropic Claude, OpenAI, or local models
- **Knowledge base** - Semantic search over your hotel information
- **Task routing** - Automatically create and assign tasks to staff
- **Self-hosted** - Your data stays on your infrastructure
- **Easy setup** - Single SQLite database, no external services required

---

## Quick Start

```bash
# Clone the repository
git clone git@github.com:JackTheButler/JackTheButler.git
cd JackTheButler

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

Visit `http://localhost:3000` to access the dashboard.

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

- **Issues**: [GitHub Issues](https://github.com/JackTheButler/JackTheButler/issues)
- **Website**: [JackTheButler.com](https://jackthebutler.com)

---

Built with care for the hospitality industry.
