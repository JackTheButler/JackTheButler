# Release Roadmap

Incremental delivery plan for Jack The Butler.

---

## Overview

This roadmap defines a **phased, incremental build approach** where each release:

1. **Builds on previous releases** - No orphaned code
2. **Is independently testable** - Each phase has clear acceptance criteria
3. **Delivers visible progress** - Quick wins for stakeholders
4. **Follows dependency order** - Structure before features

---

## Release Philosophy

### Early Phases (0.1.x - 0.3.x): Foundation
- Focus on **structure and infrastructure**
- Get the skeleton working end-to-end
- Prove the architecture works
- Minimal features, maximum stability

### Middle Phases (0.4.x - 0.6.x): Core Features
- Implement **P0 (must-have) use cases**
- Single channel working (WhatsApp)
- Basic AI responses
- Staff can see and manage conversations

### Later Phases (0.7.x - 1.0.x): Production Ready
- Polish and harden
- All P0 features complete
- Performance optimization
- Documentation and deployment

### Post-Launch (1.1.x+): Progressive Autonomy
- **Kernel/Extension separation** for maintainability
- **Task Router** for automatic task creation
- **Configurable autonomy** levels per hotel
- Move from L2 (Supervised) toward L3/L4 (Autonomous)

---

## Phase Summary

| Phase | Version | Codename | Focus | Milestone |
|-------|---------|----------|-------|-----------|
| 0 | 0.1.0 | **Skeleton** | Project structure, build system | Builds and runs |
| 1 | 0.2.0 | **Foundation** | Database, config, logging | Tests pass |
| 2 | 0.3.0 | **Gateway** | HTTP server, WebSocket, auth | API responds |
| 3 | 0.4.0 | **Pipeline** | Message flow, basic AI | Echo bot works |
| 4 | 0.5.0 | **Intelligence** | RAG, intent classification | Smart responses |
| 5 | 0.6.0 | **Channels** | WhatsApp integration | Real messages |
| 6 | 0.7.0 | **Operations** | Staff dashboard, tasks | Staff can work |
| 7 | 0.8.0 | **Integration** | PMS sync, guest profiles | Hotel data flows |
| 8 | 0.9.0 | **Polish** | Multi-channel, automation engine | Feature complete |
| 8b | 0.9.5 | **Admin Console** | Integration UI, automation UI | Admin can configure |
| 9 | 1.0.0 | **Launch** | Production hardening | Go live |
| **10** | **1.1.0** | **Kernel** | Core/Extension separation, Task Router, Autonomy | **L2 Autonomy** |
| **11** | **1.2.0** | **Tools** | Built-in tools for hotel onboarding | **Self-service setup** |
| **12** | **1.3.0** | **Profiles** | Guest directory and profile management | **Know your guests** |
| **13** | **1.4.0** | **Bookings** | Reservation dashboard and management | **Booking visibility** |
| **14** | **1.5.0** | **Pulse** | Real-time WebSocket dashboard updates | **Instant updates** |
| **15** | **1.6.0** | **Clean Slate** | Orchestrator/Provider simplification | **No duplication** |
| **16** | **1.7.0** | **Easy Mail** | Gmail OAuth, Mailgun/SendGrid | **One-click email** |
| **17** | **1.8.0** | **Smart Embed** | Local embeddings, capability fallback | **Offline-first AI** |
| **18** | **1.9.0** | **Polyglot** | Dashboard internationalization (i18n) | **Multi-language UI** |
| **19** | **1.10.0** | **Sandbox** | Demo data & database reset | **Test & reset** |

---

## Quick Reference

### For Claude Code

When implementing, follow this order:

```
Phase 0 (Skeleton)     → pnpm dev works
Phase 1 (Foundation)   → pnpm test passes
Phase 2 (Gateway)      → curl localhost:3000/health works
Phase 3 (Pipeline)     → WebSocket echo works
Phase 4 (Intelligence) → AI responds to "hello"
Phase 5 (Channels)     → WhatsApp webhook received
Phase 6 (Operations)   → Dashboard shows conversations
Phase 7 (Integration)  → Guest data from PMS visible
Phase 8 (Polish)       → All P0 use cases pass
Phase 9 (Launch)       → Production deployment works
Phase 10 (Kernel)      → Tasks auto-created from requests
Phase 11 (Tools)       → Site scraper imports knowledge base
Phase 12 (Profiles)    → Guest directory searchable
Phase 13 (Bookings)    → Today's arrivals/departures visible
Phase 14 (Pulse)       → Dashboard updates instantly via WebSocket
Phase 15 (Clean Slate) → No duplicate code, clear orchestrator/provider separation
Phase 16 (Easy Mail)   → Gmail connected with one click, email works
Phase 17 (Smart Embed) → Knowledge base search works without OpenAI
Phase 18 (Polyglot)    → Dashboard displays in user's language
Phase 19 (Sandbox)     → Demo data loads, database can be reset
```

### Implementation Rules

1. **Complete each phase before moving on** - No skipping
2. **Write tests as you go** - 70% coverage target
3. **One concern per commit** - Small, focused changes
4. **Document as you build** - Update specs with learnings

---

## Detailed Phase Documents

| Document | Description |
|----------|-------------|
| [Phase 0: Skeleton](phase-0-skeleton.md) | Project setup and build system |
| [Phase 1: Foundation](phase-1-foundation.md) | Database, config, logging |
| [Phase 2: Gateway](phase-2-gateway.md) | HTTP/WebSocket server |
| [Phase 3: Pipeline](phase-3-pipeline.md) | Message processing flow |
| [Phase 4: Intelligence](phase-4-intelligence.md) | AI and RAG |
| [Phase 5: Channels](phase-5-channels.md) | WhatsApp integration |
| [Phase 6: Operations](phase-6-operations.md) | Staff dashboard |
| [Phase 7: Integration](phase-7-integration.md) | PMS and hotel systems |
| [Phase 8: Polish](phase-8-polish.md) | Multi-channel, automation |
| [Phase 9: Launch](phase-9-launch.md) | Production readiness |
| [Phase 10: Extension Architecture](phase-10-extensions.md) | Core/Extension separation |
| [Phase 11: Tools](phase-11-tools.md) | Built-in tools for onboarding |
| [Phase 12: Guest Management](phase-12-guests.md) | Guest directory and profiles |
| [Phase 13: Reservation Management](phase-13-reservations.md) | Reservation dashboard |
| [Phase 14: Real-Time Dashboard](phase-14-realtime.md) | WebSocket push updates |
| [Phase 15: Architecture Simplification](phase-15-simplification.md) | Orchestrator/Provider cleanup |
| [Phase 16: Email Providers](phase-16-email-providers.md) | Gmail OAuth, Mailgun/SendGrid |
| [Phase 17: Local Embeddings](phase-17-local-embeddings.md) | Local AI for embeddings |
| [Phase 18: Internationalization](phase-18-i18n.md) | Multi-language dashboard |
| [Phase 19: Demo Data & Reset](phase-19-demo-data.md) | Sample data and database reset |

### Phase 15 Sub-Phases

| Document | Description |
|----------|-------------|
| [Phase 15.1: AI Providers](phase-15-1-ai-providers.md) | Consolidate AI providers into extensions/ |
| [Phase 15.2: Channel Providers](phase-15-2-channel-providers.md) | Consolidate channel providers into extensions/ |
| [Phase 15.3: Orchestrators](phase-15-3-orchestrators.md) | Create orchestrator layer |
| [Phase 15.4: Cleanup](phase-15-4-cleanup.md) | Final cleanup and verification |

### Phase 10 Sub-Phases

| Document | Description |
|----------|-------------|
| [Phase 10.1: Core Structure](phase-10-1-core-structure.md) | Create `src/core/`, move kernel modules |
| [Phase 10.2: Task Router](phase-10-2-task-router.md) | Auto-create tasks from guest intents |
| [Phase 10.3: Extension Consolidation](phase-10-3-extension-consolidation.md) | Manifest-based extensions |
| [Phase 10.4: Autonomy Settings](phase-10-4-autonomy-settings.md) | Configurable autonomy levels |
| [Phase 10.5: Recovery Engine](phase-10-5-recovery-engine.md) | Post-stay review recovery |

### Phase 11 Sub-Phases

| Document | Description |
|----------|-------------|
| [Phase 11.1: Site Scraper](phase-11-1-site-scraper.md) | Auto-import knowledge base from hotel websites |

---

## Dependency Graph

```
                    ┌────────────────────────────────────────┐
                    │           Phase 0: Skeleton            │
                    │  Project structure, TypeScript, build  │
                    └─────────────────┬──────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────────┐
                    │          Phase 1: Foundation           │
                    │   SQLite, Drizzle, config, logging     │
                    └─────────────────┬──────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────────┐
                    │           Phase 2: Gateway             │
                    │    Hono HTTP, WebSocket, JWT auth      │
                    └─────────────────┬──────────────────────┘
                                      │
          ┌───────────────────────────┼──────────────────────────┐
          │                           │                          │
          ▼                           ▼                          ▼
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│ Phase 3: Pipeline│     │ Phase 4: Intelligence│     │ Phase 5: Channels│
│  Message flow    │◄───►│ AI + RAG             │     │  WhatsApp        │
└────────┬─────────┘     └───────────┬──────────┘     └──────────┬───────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │      Phase 6: Operations      │
                    │    Dashboard, tasks, staff    │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │      Phase 7: Integration     │
                    │    PMS sync, guest profiles   │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │        Phase 8: Polish        │
                    │   Multi-channel, automation   │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │       Phase 9: Launch         │
                    │    Production, documentation  │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │   Phase 10: Extension Arch    │
                    │    Kernel, Task Router, L2    │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │       Phase 11: Tools         │
                    │  Site Scraper, CSV Import     │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │      Phase 12: Profiles       │
                    │  Guest directory & profiles   │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │      Phase 13: Bookings       │
                    │   Reservation dashboard       │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │       Phase 14: Pulse         │
                    │  Real-time WebSocket updates  │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │    Phase 15: Clean Slate      │
                    │ Orchestrator/Provider cleanup │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │    Phase 16: Easy Mail        │
                    │  Gmail OAuth, Mailgun/SendGrid│
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │    Phase 17: Smart Embed      │
                    │  Local embeddings, fallback   │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │     Phase 18: Polyglot        │
                    │   Dashboard i18n support      │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │      Phase 19: Sandbox        │
                    │   Demo data & database reset  │
                    └───────────────────────────────┘
```

---

## Success Criteria Per Phase

### Stakeholder Demos

| Phase | Demo | Stakeholder Value |
|-------|------|-------------------|
| 0.1.0 | "Project runs" | Technical validation |
| 0.2.0 | "Database works" | Data architecture proven |
| 0.3.0 | "API responds" | Backend architecture proven |
| 0.4.0 | "Bot echoes messages" | **First visible demo** |
| 0.5.0 | "Bot answers questions" | **AI working** |
| 0.6.0 | "WhatsApp messages work" | **Real channel working** |
| 0.7.0 | "Staff can see conversations" | **Operations possible** |
| 0.8.0 | "Guest data from PMS" | **Hotel integration** |
| 0.9.0 | "All features working" | **Feature complete** |
| 1.0.0 | "Production ready" | **Launch ready** |
| 1.1.0 | "Tasks auto-created, autonomy configurable" | **L2 Autonomy** |
| 1.2.0 | "Scrape website to populate knowledge base" | **Self-service onboarding** |
| 1.3.0 | "Search and view guest profiles" | **Guest intelligence** |
| 1.4.0 | "See today's arrivals and reservations" | **Booking visibility** |
| 1.5.0 | "Badge counts update instantly, no refresh" | **Real-time UX** |
| 1.6.0 | "No duplicate code, clear separation" | **Clean architecture** |
| 1.7.0 | "Connect Gmail with one click, email works" | **Easy email setup** |
| 1.8.0 | "Knowledge base works without external AI" | **Self-contained AI** |
| 1.9.0 | "Dashboard displays in Spanish/French/etc" | **Global accessibility** |
| 1.10.0 | "Load sample data, reset for production" | **Easy testing & cleanup** |

---

## Use Case Mapping

### P0 Use Cases (Must Have) - Target: Phase 8

| Use Case | Phase | Notes |
|----------|-------|-------|
| G-01: Pre-arrival messaging | 8 | Requires PMS integration |
| G-02: Check-in assistance | 7 | Basic in 6, full in 7 |
| G-03: Service requests | 6 | Basic task creation |
| G-04: Information inquiries | 5 | RAG + knowledge base |
| G-05: Room issues & complaints | 6 | Task + escalation |
| G-08: Check-out assistance | 7 | Requires PMS integration |
| S-01: Conversation management | 6 | Dashboard core feature |
| S-02: Task assignment & tracking | 6 | Dashboard core feature |

### P1 Use Cases (Should Have) - Target: Phase 9

| Use Case | Phase | Notes |
|----------|-------|-------|
| G-06: Dining & room service | 9 | Enhancement to G-03 |
| G-07: Concierge services | 9 | Enhancement to G-04 |
| S-03: Guest intelligence lookup | 8 | PMS data + history |
| S-05: Response assistance | 8 | AI suggestions for staff |
| O-01: Proactive notifications | 8 | Automation rules |

---

## Related

- [Architecture Overview](../03-architecture/index.md)
- [Use Cases](../02-use-cases/index.md)
- [Tech Stack](../03-architecture/tech-stack.md)
