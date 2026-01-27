# Component: AI Engine

The AI Engine is responsible for understanding guest messages, generating appropriate responses, and executing skills to fulfill requests.

---

## Purpose

Transform natural language guest messages into meaningful responses and actions, leveraging large language models while maintaining hospitality-appropriate tone and accuracy.

---

## Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                               AI ENGINE                                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MESSAGE PROCESSOR                               │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Intent     │  │   Entity     │  │  Sentiment   │               │   │
│  │  │  Classifier  │  │  Extractor   │  │  Analyzer    │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         └─────────────────┼─────────────────┘                       │   │
│  │                           ▼                                         │   │
│  │                  ┌────────────────┐                                 │   │
│  │                  │ Understanding  │                                 │   │
│  │                  │    Result      │                                 │   │
│  │                  └───────┬────────┘                                 │   │
│  └──────────────────────────┼──────────────────────────────────────────┘   │
│                             │                                              │
│                             ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RESPONSE GENERATOR                               │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Context    │  │  Knowledge   │  │     LLM      │               │   │
│  │  │   Builder    │  │  Retriever   │  │   Provider   │               │   │
│  │  │              │  │    (RAG)     │  │              │               │   │
│  │  │ • Guest      │  │              │  │ • Claude     │               │   │
│  │  │ • History    │  │ • FAQs       │  │ • GPT        │               │   │
│  │  │ • Property   │  │ • Policies   │  │ • Local      │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                     │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                              │
│                             ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SKILL EXECUTOR                                  │   │
│  │                                                                     │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │  Service   │ │ Concierge  │ │   Dining   │ │   Query    │        │   │
│  │  │  Request   │ │  Booking   │ │   Order    │ │    PMS     │        │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MEMORY MANAGER                                  │   │
│  │                                                                     │   │
│  │  • Short-term: Current conversation context                         │   │
│  │  • Long-term: Guest preferences and history                         │   │
│  │  • Property: Hotel-specific knowledge                               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Responsibilities

### Message Understanding
- Classify guest intent from natural language
- Extract entities (dates, room numbers, quantities)
- Analyze sentiment and urgency
- Detect language for multi-lingual support

### Response Generation
- Build context from conversation history and guest profile
- Retrieve relevant knowledge via RAG
- Generate natural, hospitality-appropriate responses
- Determine confidence level for escalation decisions

### Skill Execution
- Map intents to executable skills
- Gather required parameters through conversation
- Execute actions via Integration Service
- Handle multi-step workflows

### Memory Management
- Maintain conversation context within session
- Update guest preferences based on interactions
- Access and contribute to property knowledge base

---

## Intent Classification

### Intent Hierarchy

```
intent/
├── inquiry/
│   ├── amenity          # "What time does the pool close?"
│   ├── policy           # "What's your cancellation policy?"
│   ├── location         # "Where is the gym?"
│   └── general          # "Do you have a business center?"
│
├── request/
│   ├── service/
│   │   ├── towels       # "Can I get extra towels?"
│   │   ├── housekeeping # "Please clean my room"
│   │   └── amenity      # "I need an iron"
│   ├── dining/
│   │   ├── room_service # "I'd like to order food"
│   │   └── reservation  # "Book me a table"
│   ├── concierge/
│   │   ├── recommendation # "Where should I eat?"
│   │   ├── booking      # "Book me a taxi"
│   │   └── activity     # "What's there to do nearby?"
│   └── room/
│       ├── early_checkin # "Can I check in early?"
│       ├── late_checkout # "Can I get late checkout?"
│       └── change       # "Can I change rooms?"
│
├── complaint/
│   ├── noise            # "It's too loud"
│   ├── cleanliness      # "Room wasn't clean"
│   ├── maintenance      # "AC is broken"
│   └── service          # "Staff was rude"
│
├── feedback/
│   ├── positive         # "Everything is great!"
│   └── neutral          # "It's okay"
│
└── other/
    ├── greeting         # "Hello"
    ├── farewell         # "Goodbye"
    └── unclear          # Can't determine
```

### Classification Output

```typescript
interface IntentClassification {
  intent: string;           // e.g., "request.service.towels"
  confidence: number;       // 0.0 - 1.0
  entities: Entity[];       // Extracted parameters
  sentiment: Sentiment;     // positive/neutral/negative
  urgency: Urgency;         // low/medium/high/critical
  language: string;         // ISO 639-1 code
}

interface Entity {
  type: string;             // e.g., "quantity", "room_number", "date"
  value: any;               // Extracted value
  confidence: number;
}
```

---

## Response Generation

### Context Building

```typescript
interface GenerationContext {
  // Conversation
  conversation: {
    id: string;
    messages: Message[];
    currentIntent: IntentClassification;
  };

  // Guest
  guest: {
    name: string;
    loyaltyTier?: string;
    preferences: Preference[];
    stayHistory: Stay[];
    currentStay?: Stay;
  };

  // Property
  property: {
    name: string;
    amenities: Amenity[];
    policies: Policy[];
    currentTime: Date;
  };

  // Retrieved Knowledge
  knowledge: {
    relevantFAQs: FAQ[];
    similarResponses: Response[];
  };
}
```

### Prompt Structure

```
[System Prompt]
You are Jack, an AI butler for {property.name}. You are helpful,
professional, and warm. You speak in a conversational but respectful tone.

[Guest Context]
Guest: {guest.name}
Loyalty: {guest.loyaltyTier}
Current Stay: Room {room}, {nights} nights
Preferences: {preferences}

[Property Context]
Current Time: {time}
{relevant_policies}
{relevant_amenities}

[Retrieved Knowledge]
{RAG results}

[Conversation History]
{recent_messages}

[Current Message]
Guest: {message}

[Instructions]
Respond helpfully. If you need to take an action, use the appropriate tool.
If you're not confident (< 70%), indicate uncertainty and offer to connect
with staff.
```

### Response Validation

Before returning a response, validate:
- [ ] Factually accurate (matches knowledge base)
- [ ] Appropriate tone (professional, warm)
- [ ] Actionable (clear next steps if needed)
- [ ] Safe (no PII exposure, no harmful content)
- [ ] Confidence above threshold

---

## Skills

Skills are executable capabilities that Jack can perform.

### Skill Definition

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  intents: string[];           // Matching intents
  requiredParams: Param[];     // Must have
  optionalParams: Param[];     // Nice to have
  execute: (params: any) => Promise<SkillResult>;
}

interface Param {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  description: string;
  enumValues?: string[];
  extractionHint: string;      // Help AI extract this
}
```

### Built-in Skills

| Skill | Intent | Parameters | Integration |
|-------|--------|------------|-------------|
| `request_towels` | request.service.towels | quantity, room | Housekeeping |
| `request_housekeeping` | request.service.housekeeping | room, type | Housekeeping |
| `order_room_service` | request.dining.room_service | items, room | POS |
| `book_restaurant` | request.dining.reservation | date, time, party_size | POS |
| `check_availability` | request.room.early_checkin | date, time | PMS |
| `create_maintenance` | complaint.maintenance | room, issue | Maintenance |
| `lookup_guest` | (internal) | identifier | PMS |
| `get_property_info` | inquiry.* | topic | Knowledge Base |

### Skill Execution Flow

```
Intent classified
       │
       ▼
┌──────────────┐
│ Match skill  │
└──────┬───────┘
       │
       ▼
┌──────────────┐     Missing params    ┌──────────────┐
│ Check params │ ────────────────────► │ Ask guest    │
└──────┬───────┘                       └──────────────┘
       │ All params present                   │
       ▼                                      │
┌──────────────┐                              │
│ Execute skill│ ◄────────────────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Format       │
│ response     │
└──────────────┘
```

---

## LLM Provider Abstraction

```typescript
interface LLMProvider {
  name: string;

  complete(request: CompletionRequest): Promise<CompletionResponse>;

  embedText(text: string): Promise<number[]>;
}

interface CompletionRequest {
  messages: ChatMessage[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
}

// Implementations
class ClaudeProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }
class LocalProvider implements LLMProvider { ... }
```

### Provider Selection

```yaml
ai:
  defaultProvider: claude

  providers:
    claude:
      model: claude-sonnet-4-20250514
      apiKey: ${ANTHROPIC_API_KEY}

    openai:
      model: gpt-4o
      apiKey: ${OPENAI_API_KEY}

    local:
      model: llama-3.1-8b
      endpoint: http://localhost:11434

  fallback:
    - claude
    - openai
    - local
```

---

## Configuration

```yaml
ai_engine:
  understanding:
    confidenceThreshold: 0.7
    sentimentAnalysis: true
    languageDetection: true

  generation:
    temperature: 0.7
    maxTokens: 500
    includeHistory: 10  # messages

  rag:
    enabled: true
    topK: 5
    similarityThreshold: 0.75

  skills:
    timeout: 30000
    maxRetries: 2

  memory:
    shortTermTTL: 3600
    longTermSync: true
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| `ai.requests` | Total AI requests |
| `ai.latency` | Response generation time |
| `ai.confidence.avg` | Average confidence score |
| `ai.escalations` | Low-confidence escalations |
| `ai.skills.executed` | Skills executed |
| `ai.skills.failures` | Skill execution failures |
| `ai.tokens.input` | Input tokens consumed |
| `ai.tokens.output` | Output tokens generated |

---

## Related

- [Gateway](gateway.md) - Message routing
- [Integration Layer](integration-layer.md) - Skill execution
- [Data Model](../data-model.md) - Guest/conversation storage
- [ADR-002: AI Provider Abstraction](../decisions/002-ai-provider-abstraction.md)
