# Roadmap

Future features and improvements planned for Jack The Butler.

## Features

| Feature | Status | Priority | Description |
|---------|--------|----------|-------------|
| [AI Assistant Framework](./001-ai-assistant-framework.md) | Released | High | Modular AI assistant for setup wizard (Phases 1-4, 7-8 complete; 5-6 deferred) |
| [Reusable Assistant System](./002-setup-architecture-refactoring.md) | Released | Medium | Reusable assistant framework with multiple render modes (Phases 8A-8D complete) |
| [Setup API Reference](./003-setup-api-cleanup.md) | Reference | Low | API catalog for Phase 1-4 implementation (for refactoring reference) |
| [User & Role Management](./004-user-role-management.md) | Released | High | Permission-based role system with configurable roles (Phases 9A-9M) |
| [Auth Backend](./005-auth-backend.md) | In Progress | High | Registration, password recovery, email verification, admin approval |
| [Web Chat Widget](./006-web-chat-widget.md) | Released | Medium | Embeddable chat widget for hotel websites with AI + form-based actions |
| [Multilingual Translation](./007-multilingual-translation.md) | Released | High | Automatic translation of guest messages, AI responses, and staff replies across all channels |
| [PMS Sync Freshness](./008-pms-sync-freshness.md) | Released | High | Staleness guards for critical paths reading cached PMS reservation data (Phases 1-3 complete) |
| [PMS Provider Adapters](./009-pms-providers.md) | Released | High | Production adapters for Mews, Cloudbeds, Oracle OPERA Cloud, Apaleo, and Protel |
| [Google Gemini AI Provider](./010-gemini-provider.md) | Planned | Medium | Gemini completion and native embeddings via text-embedding-004 |
| [PMS Adapter: Cloudbeds](./012-pms-cloudbeds.md) | Planned | High | Cloudbeds PMS adapter — Phase 2 of PMS provider rollout with OAuth 2.0 and HTTP webhooks |
| [Plugin System](./013-plugin-system.md) | Planned | Medium | Decouple integrations from core into independently versioned npm packages loadable via jack.config.ts |

## How to Propose Features

1. Create a new markdown file in this folder
2. Use the [template](./_template.md) for structure
3. Submit a PR for discussion

## Feature Status Legend

| Status | Meaning |
|--------|---------|
| **Proposed** | Idea documented, awaiting review |
| **Approved** | Accepted for development |
| **In Progress** | Currently being implemented |
| **Beta** | Available for testing |
| **Released** | Available in production |
| **Deferred** | Postponed to future release |
