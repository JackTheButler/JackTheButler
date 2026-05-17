# Jane the Operator — Build Plan

AI support chatbot for a single business. Customers reach support via webchat,
Telegram, or WhatsApp. `@thebutler/pipeline` drives message processing (resolve
→ language → intent → RAG over the company knowledge base → AI answer). Staff
can take over a conversation; the AI pauses until staff hand it back.

> Status: **planning**. Nothing below is implemented yet except Phase 0.
> The mock UI (Phase 1) is built and reviewed before any backend work.

---

## 1. Decisions (locked)

| Area            | Decision                                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| Tenancy         | **Single business per deployment** — no tenant column anywhere.               |
| Dashboard       | Staff console = live conversations + KB management + Apps + Settings.         |
| Landing         | Separate static marketing site (`apps/landing`), no app logic.                |
| Knowledge base  | Sources: uploaded **PDF/MD**, **crawled URLs**, **manual Q&A**.               |
| Vector storage  | **SQLite + sqlite-vec** (Butler pattern), Drizzle ORM.                         |
| AI              | First provider: **Anthropic (Claude)**. Embeddings: **local** first.          |
| Channels        | **Webchat** (own widget over WebSocket) first; Telegram (Bot API) +           |
|                 | WhatsApp (Meta Cloud API) later. All are **App integrations**.                |
| Handoff         | AI **fully pauses** on staff takeover; staff hand back to AI via UI.          |
| Staff auth      | Email/password — **bcrypt + jose JWT** (Butler pattern).                       |
| Integrations    | **Manifest + registry + loader** plugin pattern (Butler `src/apps`).          |
| Principles      | Small increments, modular, minimal, clean. Each phase ships something usable. |

---

## 2. Architecture

```
apps/landing      Astro static marketing site (no backend coupling)
apps/dashboard    React SPA — staff console (Conversations, Knowledge, Apps, Settings)
apps/webchat      Embeddable customer chat widget (WebSocket client)         [Phase 6]

src/ (API, Hono)
  gateway/        HTTP routes + WebSocket server
  auth/           email/password, bcrypt, jose JWT, session middleware
  apps/           integration framework: manifest types, registry, loader, config
  pipeline/       @thebutler/pipeline wiring + contract implementations
  knowledge/      ingestion (PDF/MD/URL/QA) → chunk → embed → sqlite-vec
  conversations/  conversation/message store + handoff state machine
  db/             Drizzle schema, migrations, seed
  core/ utils/ errors/ monitoring/

packages/
  shared              shared types (manifests, wire types, DTOs)
  ai-anthropic        AIProvider app (Claude) + manifest                     [Phase 4]
  embeddings-local    local embedding provider                               [Phase 4]
  channel-webchat     webchat channel app + manifest                         [Phase 6]
  channel-telegram    Telegram Bot API channel app                           [Phase 8]
  channel-whatsapp    WhatsApp Meta Cloud API channel app                    [Phase 8]
```

**Integration pattern (per Butler).** Every channel/AI provider is a
`packages/*` package exporting an `AppManifest` (id, category, config-field
schema) plus a contract implementation. An `AppRegistry` discovers manifests at
startup; the **Apps tab** renders config forms from the manifest; saved config
activates the app. New channels/providers = new package, no core changes.

**Pipeline boundary.** The API owns a pre-pipeline gate: if a conversation is
in `human` mode, the message is routed to staff and `pipeline.process()` is
**not** called. Otherwise the pipeline runs with our contract implementations
(`Entity`, `Intent`, `Prompt`, `Conversation`, `AI`, `Knowledge`, `Logger`).

**Handoff state machine.** Conversation `mode`: `ai → human` (staff takeover,
AI pauses) and `human → ai` (staff hand back). Mode lives on the conversation
row; all channels and the staff console observe it via WebSocket.

---

## 3. Phases

Each phase: **Goal**, **Deliverables**, **Exit criteria**. Phases are ordered
so each is independently demoable.

### Phase 0 — Foundations *(done)*
- Goal: monorepo skeleton, dev/build tooling.
- Deliverables: pnpm workspace, Hono API (`/health`, `/api/ping`), dashboard +
  landing shells, shared package, vitest.
- Exit: `pnpm install && pnpm check` green; all three apps build.

### Phase 1 — Mock UI *(next — design discussion first)*
- Goal: full clickable dashboard with **mocked data, no backend**, to lock UX.
- Deliverables: app shell + nav (Conversations, Knowledge Base, Apps,
  Settings); login screen; conversation inbox + thread view with
  takeover/hand-back controls; KB list + add-source flows; Apps tab with
  manifest-style config cards; webchat widget mock. Design system chosen.
- Exit: every screen navigable against fixtures; UX signed off.

### Phase 2 — Data layer & auth
- Goal: persistence + staff login.
- Deliverables: Drizzle schema (staff, conversations, messages, knowledge
  docs/chunks, app_configs) + migrations + seed; bcrypt/jose auth; session
  middleware; login wired to real API.
- Exit: staff logs in; protected routes enforced; migrations run clean.

### Phase 3 — App integration framework
- Goal: the plugin system (no real providers yet).
- Deliverables: manifest types in `shared`; `AppRegistry` + `AppLoader`;
  encrypted-at-rest config storage; Apps API + Apps tab wired to live
  manifests/config; one stub app to prove the loop.
- Exit: a stub app appears in Apps tab, configures, and reports status.

### Phase 4 — AI app + pipeline core
- Goal: AI answers a message end-to-end via the pipeline (API-only).
- Deliverables: `ai-anthropic` + `embeddings-local` packages with manifests;
  pipeline contract impls (Entity/Intent/Prompt/Conversation/AI/Logger);
  `createPipeline` wiring; a test endpoint that runs a message through.
- Exit: `POST` a message → Claude answer persisted, no KB yet.

### Phase 5 — Knowledge base + RAG
- Goal: answers grounded in company knowledge.
- Deliverables: ingestion for **manual Q&A** → **MD/PDF upload** → **URL
  crawl** (in that order); chunk + local-embed → sqlite-vec; `KnowledgeProvider`
  enabling pipeline RAG; KB management UI wired.
- Exit: KB entry demonstrably changes the AI answer; sources manageable in UI.

### Phase 6 — Webchat channel
- Goal: a customer chats from the widget and the AI replies live.
- Deliverables: WebSocket gateway; `channel-webchat` app + manifest;
  `apps/webchat` widget; live conversation visible in staff console.
- Exit: widget ↔ AI round-trip; conversation appears in inbox in real time.

### Phase 7 — Human handoff
- Goal: staff take over and hand back; AI pauses correctly.
- Deliverables: conversation `mode` state machine; pre-pipeline gate;
  takeover/hand-back UI + staff reply path; real-time mode sync to widget +
  console.
- Exit: staff takeover stops AI; staff replies reach customer; hand-back
  resumes AI — verified on webchat.

### Phase 8 — Telegram + WhatsApp channels
- Goal: same loop on Telegram and WhatsApp.
- Deliverables: `channel-telegram` (Bot API) and `channel-whatsapp` (Meta
  Cloud API) apps — inbound webhooks, outbound send, configured via Apps tab.
- Exit: AI + handoff work identically on both channels.

### Phase 9 — Hardening
- Goal: production-readiness.
- Deliverables: error handling, structured logging/monitoring, test coverage
  on critical paths, deploy config (Docker), `.env.example` finalized.
- Exit: `pnpm check` green; documented deploy; smoke-tested.

---

## 4. Data model (first cut — refine in Phase 2)

- `staff` — id, email, password_hash, name, role, created_at
- `conversations` — id, channel, channel_id, mode (`ai`|`human`),
  assigned_staff_id?, status, created_at, updated_at
- `messages` — id, conversation_id, direction (`inbound`|`outbound`),
  author (`customer`|`ai`|`staff`), content, lang?, metadata, created_at
- `knowledge_documents` — id, source (`qa`|`upload`|`url`), title, raw_ref,
  status, created_at
- `knowledge_chunks` — id, document_id, content, embedding (sqlite-vec), ord
- `app_configs` — app_id, enabled, config (encrypted), status, updated_at

---

## 5. Open questions (non-blocking; resolve by the phase noted)

1. **Embedding model** for `embeddings-local` (which Butler model to reuse?) — Phase 4.
2. **Auto-handoff triggers** later (low confidence / "talk to a human"), or
   staff-initiated only forever? — revisit Phase 7.
3. **PDF parsing** library choice — Phase 5.
4. **URL crawl** depth/scope controls in UI — Phase 5.
5. **Webchat widget** distribution (script embed vs iframe) — Phase 6.
6. **Config encryption** key management (env-provided key) — Phase 3.

---

## 6. Next step

Discuss and design the **mock UI (Phase 1)** — screens, navigation, design
system — then build it against fixtures before any backend work.
```
