# Phase 4: Intelligence

**Version:** 0.5.0
**Codename:** Intelligence
**Goal:** AI responds intelligently with RAG

---

## Overview

Phase 4 replaces the echo responder with real AI. After this phase:

1. Claude API generates responses
2. Knowledge base stores hotel information
3. Vector search finds relevant context
4. Intent classification categorizes messages
5. **AI responds to "What time is checkout?"**

---

## Prerequisites

- Phase 3 complete (Pipeline working with echo)

---

## Deliverables

### 0.5.0-alpha.1: AI Provider Abstraction

**Files to create:**

```
src/ai/
├── index.ts                  # AI engine exports
├── types.ts                  # Provider interfaces
├── providers/
│   ├── index.ts              # Provider factory
│   ├── claude.ts             # Claude provider
│   ├── openai.ts             # OpenAI provider (fallback)
│   └── ollama.ts             # Ollama provider (local)
└── fallback.ts               # Fallback manager
```

**Provider interface:**

```typescript
// src/ai/types.ts
export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(text: string): Promise<number[]>;
}

export interface CompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}
```

**Claude provider:**

```typescript
// src/ai/providers/claude.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: request.maxTokens || 1024,
      messages: request.messages.filter(m => m.role !== 'system'),
      system: request.messages.find(m => m.role === 'system')?.content,
    });

    return {
      content: response.content[0].text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
```

**Acceptance criteria:**
- [ ] Claude provider works
- [ ] OpenAI provider works (fallback)
- [ ] Provider selected by config
- [ ] Fallback triggers on failure

---

### 0.5.0-alpha.2: Knowledge Base

**Files to create:**

```
src/ai/
├── knowledge/
│   ├── index.ts              # Knowledge service
│   ├── embeddings.ts         # Embedding generation
│   └── search.ts             # Vector search
```

**Create tables (migration):**
- `knowledge_base` table - FAQ, policies, amenities content
- `knowledge_embeddings` virtual table (sqlite-vec) - vector embeddings

```sql
-- Add to migration
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);
```

**Knowledge service:**

```typescript
// src/ai/knowledge/index.ts
export class KnowledgeService {
  constructor(private db: Database, private provider: LLMProvider) {}

  async add(item: KnowledgeItem): Promise<void> {
    // 1. Insert into knowledge_base
    await this.db.insert(knowledgeBase).values(item);

    // 2. Generate embedding
    const embedding = await this.provider.embed(item.content);

    // 3. Store embedding
    await this.db.run(
      `INSERT INTO knowledge_embeddings (id, embedding) VALUES (?, ?)`,
      [item.id, JSON.stringify(embedding)]
    );
  }

  async search(query: string, limit = 5): Promise<KnowledgeItem[]> {
    // 1. Generate query embedding
    const queryEmbedding = await this.provider.embed(query);

    // 2. Vector similarity search
    const results = await this.db.all(`
      SELECT k.*, e.distance
      FROM knowledge_embeddings e
      JOIN knowledge_base k ON k.id = e.id
      WHERE e.embedding MATCH ?
      ORDER BY e.distance
      LIMIT ?
    `, [JSON.stringify(queryEmbedding), limit]);

    return results;
  }
}
```

**Acceptance criteria:**
- [ ] Knowledge items can be added
- [ ] Embeddings generated and stored
- [ ] Vector search returns relevant results
- [ ] Search is fast (< 100ms)

---

### 0.5.0-alpha.3: Intent Classification

**Files to create:**

```
src/ai/
├── intent/
│   ├── index.ts              # Intent classifier
│   ├── taxonomy.ts           # Intent types
│   └── prompts.ts            # Classification prompts
```

**Intent taxonomy (subset):**

```typescript
// src/ai/intent/taxonomy.ts
export const IntentTaxonomy = {
  'request.service.housekeeping': {
    description: 'Housekeeping service requests',
    examples: ['I need more towels', 'Can you clean my room?'],
    department: 'housekeeping',
  },
  'inquiry.amenity': {
    description: 'Questions about hotel amenities',
    examples: ['What time is the pool open?', 'Where is the gym?'],
    department: null,
  },
  'inquiry.checkout': {
    description: 'Questions about checkout',
    examples: ['What time is checkout?', 'Can I get late checkout?'],
    department: 'front_desk',
  },
  // ... more intents
} as const;
```

**Intent classifier:**

```typescript
// src/ai/intent/index.ts
export class IntentClassifier {
  constructor(private provider: LLMProvider) {}

  async classify(message: string): Promise<ClassificationResult> {
    const prompt = buildClassificationPrompt(message, IntentTaxonomy);

    const response = await this.provider.complete({
      messages: [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 100,
    });

    return parseClassificationResponse(response.content);
  }
}
```

**Acceptance criteria:**
- [ ] Intent taxonomy defined
- [ ] Classifier returns intent + confidence
- [ ] Classification is fast (< 500ms)
- [ ] Handles unknown intents gracefully

---

### 0.5.0-alpha.4: Response Generator

**Replace echo responder with AI:**

```typescript
// src/ai/responder.ts
export class AIResponder implements Responder {
  constructor(
    private provider: LLMProvider,
    private knowledge: KnowledgeService,
    private classifier: IntentClassifier
  ) {}

  async generate(conversation: Conversation, message: InboundMessage): Promise<Response> {
    // 1. Classify intent
    const intent = await this.classifier.classify(message.content);

    // 2. Search knowledge base
    const context = await this.knowledge.search(message.content);

    // 3. Build prompt with context
    const prompt = buildResponsePrompt({
      message: message.content,
      intent,
      context,
      conversationHistory: await getRecentMessages(conversation.id),
    });

    // 4. Generate response
    const response = await this.provider.complete({
      messages: [
        { role: 'system', content: BUTLER_SYSTEM_PROMPT },
        ...prompt,
      ],
    });

    return {
      content: response.content,
      intent: intent.intent,
      confidence: intent.confidence,
    };
  }
}
```

**Acceptance criteria:**
- [ ] AI generates contextual responses
- [ ] Knowledge base context included
- [ ] Intent influences response
- [ ] Responses are helpful and polite

---

### 0.5.0-alpha.5: Seed Knowledge Base

**Create seed data:**

```typescript
// src/db/seeds/knowledge.ts
export const seedKnowledge = [
  {
    category: 'faq',
    title: 'Checkout Time',
    content: 'Checkout time is 11:00 AM. Late checkout until 2:00 PM is available for $50. Please contact the front desk to request late checkout.',
    keywords: ['checkout', 'time', 'late checkout'],
  },
  {
    category: 'amenity',
    title: 'Pool Hours',
    content: 'The pool is open daily from 6:00 AM to 10:00 PM. Towels are available poolside. The pool is heated year-round.',
    keywords: ['pool', 'swimming', 'hours'],
  },
  {
    category: 'service',
    title: 'Room Service',
    content: 'Room service is available 24/7. The menu is in your room or on the TV. Delivery typically takes 30-45 minutes.',
    keywords: ['room service', 'food', 'dining'],
  },
  // ... more knowledge items
];
```

**Acceptance criteria:**
- [ ] 10+ knowledge items seeded
- [ ] Embeddings generated for all
- [ ] "What time is checkout?" returns correct answer
- [ ] "Where is the pool?" returns correct answer

---

## Testing Checkpoint

### Manual Tests

```bash
# Test 1: AI response via WebSocket
wscat -c ws://localhost:3000/ws
> {"type":"message","content":"What time is checkout?"}
< {"type":"message","content":"Checkout time is 11:00 AM..."}

# Test 2: Knowledge search
curl http://localhost:3000/api/v1/knowledge/search?q=pool \
  -H "Authorization: Bearer <token>"
# Expected: Pool-related knowledge items

# Test 3: Intent classification
curl -X POST http://localhost:3000/api/v1/ai/classify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"I need extra towels"}'
# Expected: {"intent":"request.service.housekeeping","confidence":0.95}
```

### Stakeholder Demo

**Demo script:**
1. Send "What time is checkout?" - Get accurate answer
2. Send "I need extra towels" - Get helpful response
3. Send "Where is the gym?" - Get amenity info
4. Show intent classification in logs
5. Show knowledge base matches

**Key message:** "Jack now understands questions and gives accurate answers."

---

## Exit Criteria

Phase 4 is complete when:

1. **Claude API** generates responses
2. **Knowledge base** stores hotel information
3. **Vector search** finds relevant context
4. **Intent classification** categorizes messages
5. **AI responds accurately** to common questions

---

## Dependencies

**Add to package.json:**

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "openai": "^4.73.0",
    "sqlite-vec": "^0.1.0"
  }
}
```

---

## Next Phase

After Phase 4, proceed to [Phase 5: Channels](phase-5-channels.md) to add WhatsApp integration.

---

## Checklist for Claude Code

```markdown
## Phase 4 Implementation Checklist

### 0.5.0-alpha.1: AI Providers
- [ ] Install @anthropic-ai/sdk, openai
- [ ] Create src/ai/types.ts
- [ ] Create src/ai/providers/claude.ts
- [ ] Create src/ai/providers/openai.ts
- [ ] Create src/ai/fallback.ts
- [ ] Add ANTHROPIC_API_KEY to config
- [ ] Verify: Claude API responds

### 0.5.0-alpha.2: Knowledge Base
- [ ] Install sqlite-vec
- [ ] Create src/ai/knowledge/index.ts
- [ ] Create src/ai/knowledge/embeddings.ts
- [ ] Implement vector search
- [ ] Verify: Search returns results

### 0.5.0-alpha.3: Intent Classification
- [ ] Create src/ai/intent/taxonomy.ts
- [ ] Create src/ai/intent/index.ts
- [ ] Create classification prompts
- [ ] Verify: Intents classified correctly

### 0.5.0-alpha.4: Response Generator
- [ ] Create src/ai/responder.ts
- [ ] Replace EchoResponder with AIResponder
- [ ] Include knowledge context
- [ ] Include conversation history
- [ ] Verify: AI responses are good

### 0.5.0-alpha.5: Seed Knowledge
- [ ] Create src/db/seeds/knowledge.ts
- [ ] Add 10+ knowledge items
- [ ] Generate embeddings for all
- [ ] Verify: Common questions answered

### Phase 4 Complete
- [ ] All checks above pass
- [ ] "What time is checkout?" answered correctly
- [ ] Commit: "Phase 4: Intelligence complete"
- [ ] Tag: v0.5.0
```
