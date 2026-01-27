# Tech Stack

Technology choices for Jack The Butler.

---

## Overview

Jack's tech stack is directly inspired by [Clawdbot](https://github.com/clawdbot/clawdbot), designed for **self-hosted deployment** on hotel infrastructure. The stack prioritizes:

- **Self-host friendly** - Single Docker container, minimal dependencies
- **Local-first** - Data stays on hotel's own server
- **Privacy-focused** - No external data sharing required
- **Simple operations** - SQLite database, no external services needed
- **Developer experience** - TypeScript, hot reload, good tooling

---

## Core Runtime

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| Runtime | Node.js | ≥22 | Modern features, ESM support, performance |
| Language | TypeScript | 5.x | Type safety, developer experience |
| Execution | tsx | latest | Fast TypeScript execution in development |
| Package Manager | pnpm | 10.x | Fast, disk efficient, workspace support |

---

## Backend Framework

| Component | Technology | Rationale |
|-----------|------------|-----------|
| HTTP Server | **Hono** | Lightweight, fast, edge-ready, great DX |
| WebSocket | **ws** | Battle-tested, low-level control |
| Validation | **Zod** | TypeScript-first schema validation |
| Auth | **jose** | JWT handling, standards compliant |

### Why Hono over Express?

- 10x faster than Express
- Built-in TypeScript support
- Works on edge runtimes (Cloudflare, Vercel)
- Smaller bundle size
- Modern API design

```typescript
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());
app.use('/api/*', jwt({ secret: process.env.JWT_SECRET }));

app.get('/api/conversations', async (c) => {
  const conversations = await conversationService.list();
  return c.json(conversations);
});
```

---

## Database

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Primary DB | **SQLite** | Zero-config, single file, self-contained |
| ORM | **Drizzle** | Type-safe, performant, good migrations |
| Vector Search | **sqlite-vec** | Embeddings without separate service |
| Cache | **In-memory (LRU)** | Simple, no external service needed |

### Why SQLite over PostgreSQL?

For self-hosted deployment, SQLite provides:

- **Zero configuration** - No database server to install/manage
- **Single file** - Easy backup (just copy the file)
- **Portable** - Move installation by copying directory
- **Fast** - No network overhead, direct file access
- **Reliable** - Battle-tested, used by billions of devices

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('data/jack.db');
const db = drizzle(sqlite);

// Type-safe queries
const guest = await db
  .select()
  .from(guests)
  .where(eq(guests.id, guestId))
  .limit(1);
```

### Vector Search with sqlite-vec

```typescript
import * as sqliteVec from 'sqlite-vec';

// Load sqlite-vec extension
sqliteVec.load(sqlite);

// Create embeddings table
db.run(`
  CREATE VIRTUAL TABLE IF NOT EXISTS embeddings
  USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[1536]
  )
`);

// Similarity search
const similar = db.prepare(`
  SELECT id, distance
  FROM embeddings
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 5
`).all(queryEmbedding);
```

---

## AI & LLM

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Primary LLM | **Claude (Anthropic)** | Best for conversation, tool use, safety |
| Fallback LLM | **GPT-4 (OpenAI)** | Reliable fallback |
| Local LLM | **Ollama** | Privacy-sensitive deployments |
| Embeddings | **text-embedding-3-small** | Good quality, cost effective |
| Local Embeddings | **Ollama** | Fully offline capable |

### Provider Abstraction

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(text: string): Promise<number[]>;
}

// Easy to switch providers
const providers = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  ollama: new OllamaProvider(),  // For fully local deployment
};

// Use based on configuration
const provider = providers[config.llm.provider];
```

### Offline Mode with Ollama

For hotels requiring complete data privacy:

```typescript
// config/local.yaml
llm:
  provider: ollama
  model: llama3.1
  embeddings: nomic-embed-text
  baseUrl: http://localhost:11434
```

### Provider Fallback Behavior

When the primary AI provider fails, Jack automatically falls back to alternatives.

#### Fallback Configuration

```yaml
ai:
  fallback:
    enabled: true
    chain: [claude, openai, local]  # Fallback order

    triggers:
      consecutiveFailures: 3       # Failures before switching
      timeoutMs: 10000             # Timeout per request
      errorCodes: [500, 502, 503, 504, 'ECONNREFUSED', 'ETIMEDOUT']

    circuitBreaker:
      enabled: true
      failureThreshold: 5          # Failures to open circuit
      resetTimeMs: 60000           # Time before retry (1 minute)
      halfOpenRequests: 2          # Test requests when half-open

    costs:
      trackUsage: true
      alertThresholdUsd: 100       # Daily cost alert
```

#### Fallback Implementation

```typescript
class LLMFallbackManager {
  private circuitState: Map<string, CircuitState> = new Map();
  private failureCounts: Map<string, number> = new Map();

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    for (const providerName of this.config.fallback.chain) {
      const circuit = this.getCircuit(providerName);

      // Skip if circuit is open
      if (circuit.state === 'open') {
        continue;
      }

      try {
        const provider = this.providers[providerName];
        const response = await this.withTimeout(
          provider.complete(request),
          this.config.fallback.triggers.timeoutMs
        );

        // Success - reset failures
        this.resetFailures(providerName);
        return response;

      } catch (error) {
        this.recordFailure(providerName, error);

        // Check if should open circuit
        if (this.shouldOpenCircuit(providerName)) {
          this.openCircuit(providerName);
        }

        // Try next provider
        continue;
      }
    }

    // All providers failed
    throw new AllProvidersFailedError(this.config.fallback.chain);
  }

  private shouldOpenCircuit(provider: string): boolean {
    const failures = this.failureCounts.get(provider) || 0;
    return failures >= this.config.fallback.circuitBreaker.failureThreshold;
  }
}
```

#### Prompt Compatibility

Prompts are provider-agnostic with minor adaptations:

```typescript
function adaptPrompt(prompt: string, provider: string): string {
  // Claude uses XML tags, others use markdown
  if (provider !== 'claude' && prompt.includes('<')) {
    return convertXmlToMarkdown(prompt);
  }

  // Adjust system prompt style per provider
  const systemAdaptations = {
    claude: { prefix: 'You are', suffix: '' },
    openai: { prefix: 'You are', suffix: 'Be concise.' },
    local: { prefix: '### System\nYou are', suffix: '' }
  };

  return applyAdaptation(prompt, systemAdaptations[provider]);
}
```

#### Cost Implications

| Provider | Input Cost | Output Cost | Relative Cost |
|----------|------------|-------------|---------------|
| Claude (Sonnet) | $3/MTok | $15/MTok | 1x (baseline) |
| OpenAI (GPT-4o) | $5/MTok | $15/MTok | ~1.2x |
| Ollama (local) | $0 | $0 | 0x (hardware only) |

Cost tracking per provider:

```typescript
async function trackUsage(provider: string, tokens: TokenUsage): Promise<void> {
  const cost = calculateCost(provider, tokens);

  await db.insert(usageMetrics).values({
    provider,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    costUsd: cost,
    timestamp: new Date()
  });

  // Check daily cost alert
  const dailyTotal = await getDailyTotal();
  if (dailyTotal > config.costs.alertThresholdUsd) {
    await notifyOps('AI cost threshold exceeded', { dailyTotal });
  }
}
```

---

## Messaging Channels

| Channel | Library | Notes |
|---------|---------|-------|
| WhatsApp | **Meta Cloud API** | Direct API, business compliance |
| SMS | **Twilio SDK** | Industry standard |
| Email | **Nodemailer + node-imap** | SMTP send, IMAP receive |
| Web Chat | **WebSocket (ws)** | Native implementation |

### Why Meta Cloud API over Baileys?

- Official API with SLA
- Business compliance
- Proper rate limits
- No reverse engineering risks

---

## Frontend (Dashboard)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | **React 18** | Industry standard, large ecosystem |
| Build | **Vite** | Fast builds, great DX |
| Styling | **Tailwind CSS** | Utility-first, consistent |
| State | **TanStack Query** | Server state management |
| UI Components | **Radix UI** | Accessible, unstyled primitives |
| Forms | **React Hook Form + Zod** | Type-safe forms |

---

## Testing

| Type | Tool | Coverage Target |
|------|------|-----------------|
| Unit | **Vitest** | 70% |
| Integration | **Vitest + in-memory SQLite** | Key flows |
| E2E | **Playwright** | Critical paths |
| API | **Supertest** | All endpoints |

### Why Vitest over Jest?

- 10x faster execution
- Native ESM support
- Compatible API (easy migration)
- Built-in TypeScript

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('GuestService', () => {
  it('should cache guest after fetch', async () => {
    const db = createTestDb();  // In-memory SQLite
    const service = new GuestService(db);

    const guest = await service.findById('123');

    expect(guest).toBeDefined();
  });
});
```

---

## DevOps & Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Containerization | **Docker** | Single container deployment |
| Development | **Docker Compose** | Optional, for local dev |
| CI/CD | **GitHub Actions** | Integrated, generous free tier |
| Logging | **Pino** | Fast JSON logging |
| Monitoring | **Built-in /health endpoint** | Simple, no external deps |

### Single Container Deployment

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Data stored in volume
VOLUME /app/data

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
# One command to run
docker run -d \
  -p 3000:3000 \
  -v jack-data:/app/data \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  jackthebutler/jack
```

---

## Code Quality

| Tool | Purpose |
|------|---------|
| **oxlint** | Fast linting (Rust-based) |
| **Prettier** | Code formatting |
| **TypeScript strict** | Type checking |
| **Husky + lint-staged** | Pre-commit hooks |

---

## Security

| Component | Approach |
|-----------|----------|
| Auth | JWT with short expiry + refresh tokens |
| Secrets | Environment variables |
| Encryption | AES-256-GCM for sensitive data |
| API Security | Rate limiting, CORS, helmet |
| Webhooks | Signature verification per platform |

---

## Dependencies Summary

### Production
```json
{
  "dependencies": {
    "hono": "^4.x",
    "drizzle-orm": "^0.x",
    "better-sqlite3": "^11.x",
    "sqlite-vec": "^0.x",
    "ws": "^8.x",
    "zod": "^3.x",
    "jose": "^5.x",
    "@anthropic-ai/sdk": "^0.x",
    "openai": "^4.x",
    "twilio": "^5.x",
    "nodemailer": "^6.x",
    "pino": "^8.x"
  }
}
```

### Development
```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "vitest": "^2.x",
    "@types/node": "^22.x",
    "@types/better-sqlite3": "^7.x",
    "oxlint": "latest",
    "prettier": "^3.x",
    "drizzle-kit": "^0.x"
  }
}
```

---

## Comparison with Clawdbot

| Aspect | Clawdbot | Jack The Butler |
|--------|----------|-----------------|
| Runtime | Node.js ≥22 | Node.js ≥22 |
| Language | TypeScript | TypeScript |
| Database | SQLite | SQLite |
| Vector Search | sqlite-vec | sqlite-vec |
| HTTP Framework | Express/Hono | Hono |
| Testing | Vitest (70%) | Vitest (70%) |
| Linting | oxlint | oxlint |
| Deployment | Docker | Docker |
| Use Case | Personal assistant | Hotel concierge |

---

## Related

- [Project Structure](project-structure.md) - Code organization
- [Local Development](../05-operations/local-development.md) - Setup guide
- [Deployment](../05-operations/deployment.md) - Production deployment
