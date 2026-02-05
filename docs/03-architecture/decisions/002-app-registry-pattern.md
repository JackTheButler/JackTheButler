# ADR-002: App Registry Pattern

## Status

Accepted

## Context

Jack integrates with multiple external services across four categories:

- **AI:** Anthropic, OpenAI, Ollama, Local (Transformers.js)
- **Channels:** WhatsApp, SMS, Email (4 providers)
- **PMS:** Mews, Cloudbeds, Opera (planned)
- **Tools:** Site scraper

Each category can have multiple providers. Hotels choose which providers to use based on their contracts and preferences. Adding new providers should not require changes to core business logic.

## Decision

Use a **manifest + registry** pattern:

- Each provider declares a **manifest** (`AppManifest`) with its ID, category, config schema, and factory function
- An **`AppLoader`** discovers all manifests at startup and loads saved configuration from the database
- An **`AppRegistry`** (singleton) holds all registered providers and exposes lookup methods (`getActiveAIProvider()`, `getChannelAdapter()`, etc.)
- Provider credentials are stored encrypted in the `app_configs` table, managed through the dashboard

## Consequences

### Positive

- Adding a new provider = one manifest file, no changes to core
- Runtime provider switching via dashboard (no restart needed)
- Core business logic never imports provider-specific code directly
- Configuration and credentials managed uniformly across all provider types

### Negative

- Indirection: looking up a provider goes through the registry instead of a direct import
- `any` types at the registry boundary (providers implement different interfaces per category)

### Why this is acceptable

The indirection cost is minimal and the benefit of decoupling core from providers is significant. Hotel operators can enable/disable providers without touching code or environment variables.
