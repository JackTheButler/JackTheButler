# ADR-002: AI Provider Abstraction

## Status

Accepted

## Context

Jack The Butler relies on Large Language Models (LLMs) for:
- Intent classification
- Response generation
- Sentiment analysis
- Skill/tool execution

The LLM landscape is rapidly evolving with multiple providers (Anthropic, OpenAI, Google, local models) offering different capabilities, pricing, and performance characteristics.

### Constraints

- Hotels may have preferences or restrictions on AI providers
- Some regions may require data to stay on-premise (local models)
- Provider outages should not bring down the entire system
- Costs vary significantly between providers
- New providers and models are released frequently

### Requirements

- Support multiple AI providers
- Enable fallback when primary provider is unavailable
- Allow provider selection based on task type
- Support future providers without major refactoring

## Decision

Implement an **AI Provider Abstraction Layer** that:

1. Defines a common interface for all AI operations
2. Implements adapters for each supported provider
3. Supports provider configuration per property
4. Enables automatic fallback between providers
5. Routes different task types to optimal providers

### Interface Definition

```typescript
interface LLMProvider {
  name: string;

  // Core capabilities
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embedText(text: string): Promise<number[]>;

  // Capability discovery
  supportsToolUse(): boolean;
  supportsVision(): boolean;
  maxContextTokens(): number;
}
```

### Provider Configuration

```yaml
ai:
  defaultProvider: claude

  providers:
    claude:
      enabled: true
      model: claude-sonnet-4-20250514
      priority: 1

    openai:
      enabled: true
      model: gpt-4o
      priority: 2  # Fallback

    local:
      enabled: false
      model: llama-3.1-8b
      endpoint: http://localhost:11434

  routing:
    intentClassification: claude
    responseGeneration: claude
    embedding: openai  # text-embedding-3-small
```

## Consequences

### Positive

- **Flexibility**: Hotels can choose providers based on needs, cost, or compliance
- **Resilience**: Automatic fallback prevents complete outages
- **Cost optimization**: Route simple tasks to cheaper models
- **Future-proof**: New providers added without core changes
- **Testing**: Easy to mock providers for testing
- **Local deployment**: Support on-premise models for data sovereignty

### Negative

- **Complexity**: Additional abstraction layer to maintain
- **Lowest common denominator**: May not leverage provider-specific features
- **Configuration overhead**: More settings to manage
- **Testing surface**: Must test each provider integration

### Risks

- Provider-specific features underutilized - mitigate by allowing provider hints for specific operations
- Inconsistent behavior across providers - mitigate with comprehensive prompt testing

## Alternatives Considered

### Option A: Single Provider (Claude Only)

Lock in to Anthropic's Claude for all AI operations.

- **Pros**: Simpler implementation, optimized prompts for one model, consistent behavior
- **Cons**: Vendor lock-in, no fallback, can't meet all regional requirements, no cost optimization

### Option B: LangChain/LlamaIndex Abstraction

Use existing frameworks for provider abstraction.

- **Pros**: Battle-tested, community support, rich features
- **Cons**: Heavy dependencies, may not fit our specific needs, abstracts away useful details, harder to optimize

### Option C: Task-Specific Services

Separate services for each AI task (intent service, response service, etc.) each with their own provider.

- **Pros**: Maximum flexibility, independent scaling
- **Cons**: Operational complexity, more services to deploy, harder to maintain consistency

## References

- [AI Engine Component](../c4-components/ai-engine.md)
- [Claude API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
