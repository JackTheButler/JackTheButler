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

### Confidence Thresholds by Intent Category

Different intent categories have different confidence requirements based on risk and complexity:

| Intent Category | Threshold | Rationale |
|-----------------|-----------|-----------|
| `inquiry.*` | 0.70 | Information requests, low risk |
| `request.service.*` | 0.70 | Routine service requests |
| `request.dining.*` | 0.75 | Involves charges, moderate risk |
| `request.concierge.*` | 0.70 | Recommendations, low risk |
| `request.room.*` | 0.85 | Affects reservation, high risk |
| `complaint.*` | 0.80 | Sensitive, needs accuracy |
| `feedback.*` | 0.60 | Low risk, mainly logging |
| `other.*` | 0.50 | Greetings, farewells |

### Entity Schemas by Intent

Each intent has expected entities that should be extracted:

```typescript
const INTENT_ENTITY_SCHEMAS: Record<string, EntitySchema[]> = {
  'request.service.towels': [
    { name: 'quantity', type: 'number', required: false, default: 2 },
    { name: 'room_number', type: 'string', required: true }
  ],
  'request.service.housekeeping': [
    { name: 'room_number', type: 'string', required: true },
    { name: 'service_type', type: 'enum', values: ['full', 'turndown', 'refresh'], required: false }
  ],
  'request.dining.room_service': [
    { name: 'items', type: 'array', required: true },
    { name: 'room_number', type: 'string', required: true },
    { name: 'special_instructions', type: 'string', required: false }
  ],
  'request.dining.reservation': [
    { name: 'date', type: 'date', required: true },
    { name: 'time', type: 'time', required: true },
    { name: 'party_size', type: 'number', required: true },
    { name: 'restaurant_name', type: 'string', required: false }
  ],
  'request.room.early_checkin': [
    { name: 'requested_time', type: 'time', required: false }
  ],
  'request.room.late_checkout': [
    { name: 'requested_time', type: 'time', required: false }
  ],
  'complaint.maintenance': [
    { name: 'room_number', type: 'string', required: true },
    { name: 'issue_description', type: 'string', required: true },
    { name: 'urgency', type: 'enum', values: ['low', 'medium', 'high'], required: false }
  ]
};
```

### Fallback/Unknown Intent Handling

When the classifier cannot determine intent or confidence is very low:

```typescript
function handleUnknownIntent(classification: IntentClassification): Response {
  // If confidence is below minimum (0.4), ask for clarification
  if (classification.confidence < 0.4) {
    return {
      type: 'clarification',
      message: "I want to make sure I understand correctly. Could you tell me more about what you need help with?"
    };
  }

  // If intent is 'other.unclear', offer common options
  if (classification.intent === 'other.unclear') {
    return {
      type: 'options',
      message: "I'd be happy to help! Are you looking for information about the hotel, requesting a service, or something else?",
      suggestions: ['Ask about amenities', 'Request service', 'Make a reservation', 'Report an issue']
    };
  }

  // If multiple intents detected with similar confidence, disambiguate
  if (classification.alternativeIntents?.length > 0) {
    return {
      type: 'disambiguation',
      message: "Just to clarify - would you like me to help with A or B?",
      options: classification.alternativeIntents.map(i => i.intent)
    };
  }
}
```

### Custom Property Intents

Properties can define custom intents for property-specific services:

```yaml
# config/intents.yaml
custom_intents:
  - id: "request.spa.booking"
    description: "Book a spa appointment"
    examples:
      - "I'd like to book a massage"
      - "Can I schedule a spa treatment?"
    threshold: 0.75
    skill: "book_spa"
    entities:
      - name: "treatment_type"
        type: "string"
      - name: "preferred_time"
        type: "time"

  - id: "request.golf.tee_time"
    description: "Reserve a golf tee time"
    examples:
      - "Book me a tee time"
      - "I want to play golf tomorrow"
    threshold: 0.75
    skill: "book_golf"
```

### Confidence Score Calculation

Confidence is calculated using a multi-factor approach:

```typescript
function calculateConfidence(
  llmConfidence: number,      // Raw LLM classification confidence
  entityCompleteness: number, // 0-1, how many expected entities were extracted
  contextMatch: number,       // 0-1, how well it matches conversation context
  exampleSimilarity: number   // 0-1, semantic similarity to training examples
): number {
  // Weighted average
  const weights = {
    llm: 0.5,
    entities: 0.2,
    context: 0.15,
    examples: 0.15
  };

  const confidence =
    llmConfidence * weights.llm +
    entityCompleteness * weights.entities +
    contextMatch * weights.context +
    exampleSimilarity * weights.examples;

  // Apply penalty for missing required entities
  const missingRequired = getMissingRequiredEntities(intent, entities);
  if (missingRequired.length > 0) {
    return confidence * 0.8; // 20% penalty
  }

  return Math.min(confidence, 1.0);
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

### Skill Execution Contract

#### SkillResult Interface

```typescript
interface SkillResult {
  success: boolean;
  partial?: boolean;           // True if partially completed
  data?: Record<string, any>;  // Result data
  error?: SkillError;          // Error details if failed
  completedSteps?: string[];   // For multi-step skills
  pendingSteps?: string[];     // Remaining steps if partial
}

interface SkillError {
  code: string;                // e.g., 'TIMEOUT', 'INTEGRATION_ERROR', 'INVALID_PARAMS'
  message: string;             // Human-readable error
  retryable: boolean;          // Can this be retried?
  details?: Record<string, any>;
}
```

#### Error Handling

| Error Type | Behavior | Guest Message |
|------------|----------|---------------|
| Timeout | Retry once, then escalate | "I'm having trouble processing that. Let me connect you with our team." |
| Integration Error | Log, create manual task | "I've noted your request. Our team will follow up shortly." |
| Invalid Parameters | Re-prompt for params | "Could you please clarify [missing info]?" |
| Rate Limited | Queue and retry | "I'm processing your request. This may take a moment." |
| Permission Denied | Escalate to staff | "I'll need to have our team help with that request." |

#### Retry Policy

```typescript
const SKILL_RETRY_CONFIG = {
  maxAttempts: 2,              // Including initial attempt
  backoffMs: 1000,             // Initial backoff
  backoffMultiplier: 2,        // Exponential backoff
  maxBackoffMs: 5000,          // Cap backoff at 5 seconds
  retryableErrors: [
    'TIMEOUT',
    'RATE_LIMITED',
    'TEMPORARY_FAILURE'
  ]
};

async function executeWithRetry(skill: Skill, params: any): Promise<SkillResult> {
  let lastError: SkillError | null = null;
  let backoffMs = SKILL_RETRY_CONFIG.backoffMs;

  for (let attempt = 1; attempt <= SKILL_RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await skill.execute(params);
    } catch (error) {
      lastError = normalizeError(error);

      if (!SKILL_RETRY_CONFIG.retryableErrors.includes(lastError.code)) {
        break; // Non-retryable error
      }

      if (attempt < SKILL_RETRY_CONFIG.maxAttempts) {
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * SKILL_RETRY_CONFIG.backoffMultiplier, SKILL_RETRY_CONFIG.maxBackoffMs);
      }
    }
  }

  return { success: false, error: lastError };
}
```

#### Timeout Behavior

```typescript
const SKILL_TIMEOUT_MS = 30000; // 30 seconds default

async function executeSkillWithTimeout(skill: Skill, params: any): Promise<SkillResult> {
  const timeoutPromise = new Promise<SkillResult>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), SKILL_TIMEOUT_MS)
  );

  try {
    return await Promise.race([skill.execute(params), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      // Create follow-up task for staff
      await createManualTask({
        type: 'skill_timeout',
        skill: skill.id,
        params,
        reason: 'Skill execution timed out'
      });

      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true
        }
      };
    }
    throw error;
  }
}
```

#### Partial Success Handling

Skills can report partial completion for multi-item requests:

```typescript
// Example: Guest orders 3 items but 1 is unavailable
const result: SkillResult = {
  success: true,
  partial: true,
  data: {
    orderedItems: ['Club Sandwich', 'Caesar Salad'],
    unavailableItems: ['Lobster Bisque']
  },
  completedSteps: ['validate_order', 'check_availability', 'submit_partial'],
  pendingSteps: []
};

// Response generation uses partial flag
function formatPartialSuccess(result: SkillResult): string {
  if (result.partial) {
    return `I was able to order ${result.data.orderedItems.join(', ')} for you. ` +
           `Unfortunately, ${result.data.unavailableItems.join(', ')} is currently unavailable. ` +
           `Would you like to substitute something else?`;
  }
}
```

#### Async Skill Execution

Some skills are inherently asynchronous (e.g., booking confirmations):

```typescript
interface AsyncSkillResult extends SkillResult {
  async: true;
  trackingId: string;          // For status checks
  estimatedCompletionMs?: number;
  notifyOnComplete: boolean;
}

// Long-running skills return immediately with tracking
async function executeAsyncSkill(skill: Skill, params: any): Promise<AsyncSkillResult> {
  const trackingId = generateId();

  // Queue for background processing
  await jobQueue.add('skill_execution', {
    skillId: skill.id,
    params,
    trackingId,
    conversationId: context.conversationId
  });

  return {
    success: true,
    async: true,
    trackingId,
    estimatedCompletionMs: 60000,
    notifyOnComplete: true
  };
}

// Guest response for async skills
"I'm working on your restaurant reservation. I'll message you as soon as it's confirmed!"
```

#### No Automatic Rollback

Skills do NOT automatically rollback. Each skill is responsible for its own atomicity:

```typescript
// Design principle: Skills should be idempotent and atomic
// If skill A succeeds and skill B fails, skill A's result stands

// For critical multi-skill workflows, use saga pattern:
interface SagaStep {
  execute: () => Promise<any>;
  compensate: () => Promise<void>; // Undo action
}

// Example: Changing rooms requires multiple steps
const roomChangeSaga: SagaStep[] = [
  {
    execute: () => pms.releaseRoom(oldRoom),
    compensate: () => pms.assignRoom(guestId, oldRoom)
  },
  {
    execute: () => pms.assignRoom(guestId, newRoom),
    compensate: () => pms.releaseRoom(newRoom)
  }
];
```

---

## Sentiment Analysis

Sentiment is analyzed alongside intent classification, integrated into a single LLM call.

### Output Format

```typescript
interface SentimentResult {
  polarity: 'positive' | 'neutral' | 'negative';
  score: number;           // -1.0 to 1.0
  indicators: string[];    // Phrases that influenced the score
  escalationRisk: 'low' | 'medium' | 'high';
}
```

### Sentiment Thresholds

| Score Range | Polarity | Escalation Risk |
|-------------|----------|-----------------|
| 0.3 to 1.0 | positive | low |
| -0.3 to 0.3 | neutral | low |
| -0.6 to -0.3 | negative | medium |
| -1.0 to -0.6 | negative | high |

### Usage Beyond Escalation

Sentiment is used for:
1. **Escalation decisions** - Negative sentiment triggers faster escalation
2. **Response tone adjustment** - More empathetic responses for frustrated guests
3. **Guest satisfaction tracking** - Aggregated sentiment trends per stay
4. **Staff alerts** - Notify manager of highly negative interactions
5. **Post-stay follow-up** - Proactive outreach for negative experiences

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

## Multi-Language Support

Jack supports conversations in multiple languages, using LLM native capabilities.

### Supported Languages

| Language | Code | Support Level | Notes |
|----------|------|---------------|-------|
| English | en | Full | Primary, all features |
| Spanish | es | Full | High hotel demand |
| French | fr | Full | |
| German | de | Full | |
| Italian | it | Full | |
| Portuguese | pt | Full | |
| Chinese (Simplified) | zh | Full | |
| Japanese | ja | Full | |
| Korean | ko | Full | |
| Arabic | ar | Full | RTL supported |
| Hebrew | he | Full | RTL supported |
| Russian | ru | Full | |
| Dutch | nl | Supported | |
| Thai | th | Supported | |
| Vietnamese | vi | Supported | |

### Language Detection

```typescript
interface LanguageDetection {
  language: string;        // ISO 639-1 code
  confidence: number;      // 0.0 - 1.0
  script?: string;         // e.g., 'Latn', 'Arab', 'Hans'
}

// Detected as part of intent classification (single LLM call)
// If confidence < 0.7, default to property's primary language
```

### Response Language Rules

1. **Match guest language** - Respond in the language the guest used
2. **Persist across conversation** - Once detected, maintain language
3. **Guest can switch** - If guest changes language, switch with them
4. **Staff language** - Staff always see original + translation (if different)

### RTL Language Support

Arabic and Hebrew require right-to-left text handling:

```typescript
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

function formatMessage(content: string, language: string): FormattedMessage {
  const isRtl = RTL_LANGUAGES.includes(language);

  return {
    content,
    direction: isRtl ? 'rtl' : 'ltr',
    alignment: isRtl ? 'right' : 'left'
  };
}
```

### Fallback When Language Unsupported

```typescript
async function handleUnsupportedLanguage(
  detectedLanguage: string,
  message: string
): Promise<Response> {
  // Try to respond anyway - LLMs handle many languages
  const response = await llm.complete({
    messages: [
      { role: 'user', content: message }
    ],
    systemPrompt: `Respond in ${detectedLanguage} if possible, otherwise respond in English and apologize for the language limitation.`
  });

  // Log for analytics
  await logUnsupportedLanguage(detectedLanguage);

  return response;
}
```

### Translation for Staff Dashboard

Staff see both original and translated messages:

```typescript
interface StaffMessageView {
  original: {
    content: string;
    language: string;
  };
  translated?: {
    content: string;
    targetLanguage: string;  // Staff's preferred language
  };
}

// Translation happens server-side before display
// Uses same LLM provider, minimal additional cost
```

### Configuration

```yaml
language:
  detection:
    enabled: true
    confidenceThreshold: 0.7
    defaultLanguage: en

  translation:
    staffDashboard: true
    staffDefaultLanguage: en

  supported:
    full: [en, es, fr, de, it, pt, zh, ja, ko, ar, he, ru]
    basic: [nl, th, vi]
```

---

## Knowledge Base Management

The RAG knowledge base requires ongoing maintenance to stay accurate and useful.

### Knowledge Base Structure

```
knowledge/
├── faqs/                    # Frequently asked questions
│   ├── amenities.md
│   ├── policies.md
│   └── services.md
├── policies/                # Hotel policies
│   ├── cancellation.md
│   ├── checkout.md
│   └── pets.md
├── menus/                   # Restaurant menus, room service
│   ├── room_service.json
│   └── restaurant.json
├── local/                   # Local area info
│   ├── restaurants.md
│   └── attractions.md
└── operational/             # Internal procedures (not for guests)
    ├── escalation.md
    └── emergency.md
```

### Who Updates the Knowledge Base

| Role | Permissions | Typical Updates |
|------|-------------|-----------------|
| Property Admin | Full CRUD | Major policy changes, new amenities |
| Manager | Create, Update | Menu updates, seasonal info, local recs |
| Front Desk Supervisor | Update (limited) | FAQ corrections, contact info updates |
| Jack System | Create (learned) | New FAQ entries from conversations |

### Update Process

```typescript
interface KnowledgeUpdate {
  id: string;
  path: string;              // e.g., 'faqs/amenities.md'
  type: 'create' | 'update' | 'delete';
  content?: string;
  submittedBy: string;
  submittedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  approvedBy?: string;
  approvedAt?: Date;
}

async function submitKnowledgeUpdate(update: Omit<KnowledgeUpdate, 'id' | 'status'>): Promise<string> {
  const id = generateId('kb');

  // Create pending update
  await db.knowledgeUpdates.create({
    data: {
      id,
      ...update,
      status: 'pending'
    }
  });

  // Notify approvers
  await notifyKnowledgeApprovers(update);

  return id;
}

async function approveKnowledgeUpdate(updateId: string, approverId: string): Promise<void> {
  const update = await db.knowledgeUpdates.findUnique({ where: { id: updateId } });

  // Apply update to knowledge base
  await applyKnowledgeUpdate(update);

  // Regenerate embeddings for affected content
  await regenerateEmbeddings(update.path);

  // Mark as published
  await db.knowledgeUpdates.update({
    where: { id: updateId },
    data: {
      status: 'published',
      approvedBy: approverId,
      approvedAt: new Date()
    }
  });

  // Log for audit
  await createAuditLog({
    action: 'knowledge.updated',
    actorId: approverId,
    metadata: { path: update.path, type: update.type }
  });
}
```

### Embedding Regeneration

When knowledge base content changes, embeddings must be regenerated:

```typescript
interface EmbeddingJob {
  id: string;
  paths: string[];           // Files to re-embed
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  chunksProcessed: number;
  totalChunks: number;
}

async function regenerateEmbeddings(path: string): Promise<EmbeddingJob> {
  const content = await readKnowledgeFile(path);

  // Split into chunks (for large documents)
  const chunks = splitIntoChunks(content, {
    maxTokens: 500,
    overlap: 50
  });

  const jobId = generateId('emb');

  // Queue embedding job
  await jobQueue.add('generate_embeddings', {
    jobId,
    path,
    chunks,
    totalChunks: chunks.length
  });

  return {
    id: jobId,
    paths: [path],
    status: 'pending',
    chunksProcessed: 0,
    totalChunks: chunks.length
  };
}

// Background job processor
async function processEmbeddingJob(job: EmbeddingJob): Promise<void> {
  for (let i = 0; i < job.chunks.length; i++) {
    const chunk = job.chunks[i];

    // Generate embedding
    const embedding = await llmProvider.embedText(chunk.text);

    // Store in vector database
    await vectorDb.upsert({
      id: `${job.path}:${i}`,
      content: chunk.text,
      embedding,
      metadata: {
        path: job.path,
        chunkIndex: i,
        updatedAt: new Date()
      }
    });

    // Update progress
    await updateJobProgress(job.id, i + 1);
  }
}
```

### Version Control for Knowledge

All knowledge base changes are versioned:

```typescript
interface KnowledgeVersion {
  id: string;
  path: string;
  version: number;
  content: string;
  contentHash: string;
  createdBy: string;
  createdAt: Date;
  changeDescription: string;
}

// Keep last 10 versions per document
const MAX_VERSIONS = 10;

async function saveKnowledgeVersion(
  path: string,
  content: string,
  userId: string,
  description: string
): Promise<KnowledgeVersion> {
  const version = await getLatestVersion(path);

  const newVersion: KnowledgeVersion = {
    id: generateId('kv'),
    path,
    version: (version?.version || 0) + 1,
    content,
    contentHash: hash(content),
    createdBy: userId,
    createdAt: new Date(),
    changeDescription: description
  };

  await db.knowledgeVersions.create({ data: newVersion });

  // Prune old versions
  await pruneOldVersions(path, MAX_VERSIONS);

  return newVersion;
}

async function rollbackKnowledge(path: string, targetVersion: number): Promise<void> {
  const version = await db.knowledgeVersions.findFirst({
    where: { path, version: targetVersion }
  });

  if (!version) {
    throw new Error(`Version ${targetVersion} not found for ${path}`);
  }

  // Save current as new version (audit trail)
  await saveKnowledgeVersion(path, version.content, 'system', `Rollback to v${targetVersion}`);

  // Regenerate embeddings
  await regenerateEmbeddings(path);
}
```

### Learned Knowledge from Conversations

Jack can suggest new FAQ entries based on conversation patterns:

```typescript
interface LearnedKnowledge {
  id: string;
  question: string;          // Detected question pattern
  answer: string;            // Staff's provided answer
  occurrences: number;       // How many times similar question asked
  lastOccurrence: Date;
  status: 'suggested' | 'approved' | 'rejected';
  category?: string;
}

// When staff answers a question Jack couldn't handle
async function learnFromStaffAnswer(
  conversationId: string,
  question: string,
  staffAnswer: string
): Promise<void> {
  // Check if similar question already learned
  const existing = await findSimilarLearnedKnowledge(question);

  if (existing) {
    // Increment occurrence count
    await db.learnedKnowledge.update({
      where: { id: existing.id },
      data: {
        occurrences: existing.occurrences + 1,
        lastOccurrence: new Date()
      }
    });

    // If threshold reached, suggest for approval
    if (existing.occurrences >= 3 && existing.status === 'suggested') {
      await notifyKnowledgeApprovers({
        type: 'learned_knowledge_threshold',
        item: existing
      });
    }
  } else {
    // Create new learned knowledge entry
    await db.learnedKnowledge.create({
      data: {
        id: generateId('lk'),
        question,
        answer: staffAnswer,
        occurrences: 1,
        lastOccurrence: new Date(),
        status: 'suggested'
      }
    });
  }
}
```

### A/B Testing Knowledge Changes

For significant knowledge updates, A/B testing can validate effectiveness:

```typescript
interface KnowledgeExperiment {
  id: string;
  path: string;
  variants: {
    control: string;         // Current content
    treatment: string;       // New content
  };
  metrics: {
    control: ExperimentMetrics;
    treatment: ExperimentMetrics;
  };
  status: 'running' | 'concluded';
  trafficSplit: number;      // 0-1, percentage to treatment
  startedAt: Date;
  endsAt: Date;
}

interface ExperimentMetrics {
  impressions: number;       // Times this variant was used
  helpful: number;           // Times guest seemed satisfied
  escalations: number;       // Times conversation escalated after
  followUps: number;         // Times guest asked follow-up
}

async function getKnowledgeForExperiment(
  path: string,
  conversationId: string
): Promise<{ content: string; variant: 'control' | 'treatment' }> {
  const experiment = await getActiveExperiment(path);

  if (!experiment) {
    return { content: await getKnowledge(path), variant: 'control' };
  }

  // Consistent assignment based on conversation ID
  const hash = hashString(conversationId);
  const isControl = (hash % 100) >= (experiment.trafficSplit * 100);
  const variant = isControl ? 'control' : 'treatment';

  // Track impression
  await incrementExperimentMetric(experiment.id, variant, 'impressions');

  return {
    content: experiment.variants[variant],
    variant
  };
}
```

### Knowledge Base Sync Check

Automated validation of knowledge base health:

```yaml
knowledge:
  validation:
    schedule: "0 3 * * *"    # Daily at 3 AM
    checks:
      - type: stale_content
        maxAgeDays: 90
        action: notify
      - type: broken_links
        action: notify
      - type: embedding_coverage
        minCoverage: 0.95
        action: alert
      - type: duplicate_detection
        similarityThreshold: 0.9
        action: notify
```

---

## Related

- [Gateway](gateway.md) - Message routing
- [Integration Layer](integration-layer.md) - Skill execution
- [Data Model](../data-model.md) - Guest/conversation storage
- [ADR-002: AI Provider Abstraction](../decisions/002-ai-provider-abstraction.md)
