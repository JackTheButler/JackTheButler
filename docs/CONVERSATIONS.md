# Conversations, Episodes & Events

The source-of-truth model for how a support thread lives, and the meaning behind
every state column. Read this before touching conversation lifecycle or
analytics. Living doc — expand as the analytics jobs land.

## Mental model

- **Conversation** — the durable thread per `(channel, channelExternalId)` (a
  webchat visitor, a WhatsApp number, a Telegram id). It is **continuous and
  never deleted**: a returning customer reuses the same conversation rather than
  starting a new one.
- **Episode** — one **open → close cycle** inside a conversation: a single
  "case". A conversation accumulates many episodes over its life. **This is the
  unit all support metrics attach to** (resolution time, deflection, handoffs),
  *not* the conversation.

Because the thread is continuous, the conversation row alone can't tell you the
history (which agents handled it, how many handoffs, when each case opened and
closed). That history lives in an append-only event log; episodes are derived
from it.

## Three layers

| Layer | Table | Mutability | Purpose |
|---|---|---|---|
| Current state | `conversations` (+ `messages`) | overwritten on each transition | fast reads for the inbox UI |
| History | `conversation_events` | append-only, never updated | source of truth for analytics |
| Analytics | `episodes` | write-once projection (rebuildable) | flat, queryable per-case metrics |

Rule of thumb: **the inbox reads current state; analytics read the log (or the
projection built from it).** Never reconstruct history from the mutable columns.

## `conversations` — current-state columns

| Column | Meaning |
|---|---|
| `status` | `open` \| `closed`. `closed` **is** "resolved" — the UI's "Resolve" button just closes. There is no separate resolved state. |
| `mode` | `ai` \| `human`. Whether Jane may answer (`ai`) or a human took over (`human`). Changed by takeover/handback; **independent of `status`**. |
| `assignedAgentId` | The agent who took over, or null. Cleared on handback/reopen. |
| `needsHuman` | AI→human escalation flag: Jane hit her fallback and no agent has stepped in. **Current state only** (set on escalation, cleared on takeover/close/reopen) — not a history. |
| `currentEpisodeId` | The live (or most-recent) episode id. Minted at episode open, reused on a reopen within the 24h window, replaced on a later reopen. Pairs with `status` to tag events. Null only before the first message. |

Key point: `status`, `mode`, `assignedAgentId`, `needsHuman` are **transactional
fields that get overwritten repeatedly**. They answer "what is true now", never
"what happened". That's why the event log exists.

## Definitions

- **Closed = resolved.** One end state.
- **Escalation / handoff requested** — `needsHuman` raised (AI fallback).
- **Takeover** — an agent takes a thread (`mode` → `human`). **Handoff** =
  a takeover happened in the episode.
- **Handback** — agent returns it to AI (`mode` → `ai`). Does **not** end the
  episode.
- **AI deflection** — an episode closed with **no takeover and no escalation**:
  Jane handled the whole case alone.
- **Awaiting reply** — an open conversation whose latest message is the
  customer's, **or** `needsHuman` is set (escalated, unclaimed). See
  `src/modules/analytics/service.ts`.
- **First response time** — first agent reply minus episode open.
- **Resolution time** — `closedAt − openedAt` for the episode.

## Episode lifecycle

| Trigger | State change | Event logged |
|---|---|---|
| First inbound on a new conversation | create row, mint `currentEpisodeId` | `episode_opened` |
| Inbound on a closed conversation | reopen (see window rule below) | `reopened` |
| Agent clicks **Reopen** | reopen (same rule) | `reopened` |
| Jane hits fallback (first time) | `needsHuman = true` | `escalated` |
| Agent takes over | `mode=human`, `assignedAgentId` set | `taken_over` |
| Agent hands back | `mode=ai`, unassigned | `handed_back` |
| Agent clicks **Resolve**, or inactivity job | `status=closed` | `closed` |

Events carry `actorAgentId` when an agent acted (null = customer/AI/system). On a
`closed` event: agent set ⇒ manual close; null ⇒ inactivity auto-close.

### The two windows (distinct concerns, both default 24h)

- **Reopen window** (`config.episodeReopenWindowMs`) — a reopen **within** the
  window of the last close **resumes the same episode** (same case); after it,
  a reopen starts a **new** episode. Governs case identity. A closed episode is
  only *final* once the window passes, so the projection waits it out.
- **Inactivity auto-close** (`config.inactivityAutoCloseMs`) — close an open
  conversation after this much silence. Governs when a case ends.

Defaults are **24h for both, hourly projection tick**, applied **regardless of
`NODE_ENV`** so production is always correct. For local testing, set short
values (in ms) via `EPISODE_REOPEN_WINDOW_MS` / `INACTIVITY_AUTOCLOSE_MS` /
`SCHEDULER_TICK_MS`; unset falls back to the production defaults.

## `conversation_events` — the log (source of truth)

Append-only. One row per transition; never updated or deleted.

| Column | Notes |
|---|---|
| `id`, `createdAt` | — |
| `conversationId` | FK → conversations |
| `episodeId` | logical case id (not a FK — the projection is built later) |
| `type` | `episode_opened` \| `escalated` \| `taken_over` \| `handed_back` \| `closed` \| `reopened` |
| `actorAgentId` | acting agent, or null for customer/AI/system |

Written via `appendConversationEvent` in `src/modules/analytics/log.ts`, called
from the transition points in `conversations/service.ts` and the pipeline's
escalation stage.

## `episodes` — the projection (analytics)

Built incrementally from the log by an hourly job (`refreshEpisodes`). Only
**finalized** episodes are stored: an episode is materialized once it has been
closed longer than the reopen window (so a within-window reopen can't change it).
Each row is **written once and never mutated** — the table is always rebuildable
from the log, so it can be dropped and regenerated.

| Column | Feeds metric |
|---|---|
| `openedAt`, `closedAt` | resolution time, range filtering |
| `openedVia` (`new`\|`reopen`) | reopened / recurrence rate |
| `firstResponseAt`, `firstResponseAgentId` | (my) first response time |
| `closedByAgentId` (null ⇒ inactivity) | resolved-today-by-agent |
| `handedOff` | handoff rate |
| `aiDeflected` | AI deflection rate |

Consequences of the projection model:
- Recent closes **lag** by up to the reopen window before they appear in
  analytics (more correct: a case that bounces back within 24h isn't counted as
  resolved/deflected).
- The **Live strip** does *not* read `episodes` — it reads current-state columns
  directly, so queue numbers are real-time.

## What's built vs planned

- **Built:** the three tables + `currentEpisodeId`; event emission at all six
  transition points; the reopen-window rule; the live analytics endpoint
  (`/api/app/analytics/live`, current-state based); the **24h inactivity
  auto-close** and the **hourly `episodes` projection + backfill**, both run by
  the scheduler (`src/index.ts`) on an hourly tick with a catch-up run on boot;
  the **historical KPI endpoint** (`/api/app/analytics/kpis`, reads `episodes`:
  deflection, handoff, first response, resolution, resolved, reopen rate — with
  a previous-period baseline for deltas) + its Analytics cards; the **trends
  endpoint** (`/api/app/analytics/trends`, time-bucketed volume / deflection /
  resolution) + charts; and the **breakdowns endpoint**
  (`/api/app/analytics/breakdowns`: workload-by-agent, channels, opened-at
  heatmap) + panels. The KPI/trends/breakdowns endpoints take an arbitrary
  `from`/`to` date window (inclusive `YYYY-MM-DD`); the dashboard drives it with
  a reusable `DateRangePicker` primitive and persists `from`/`to`/`agent` in the
  URL. Labels adapt to the selected scope (team / person's name / "you").
- **Planned:** CSAT (needs a ratings table + a post-chat widget prompt). Blocked
  for lack of data: top topics (tagging), detailed handoff reasons (escalation
  reason), agents-online (presence).

Note: the projection only runs in the live process (the scheduler is started
from `index.ts`, not `app.ts`), so tests and a just-migrated DB start with an
empty `episodes` table until the first tick / a manual `refreshEpisodes()`.

## Code map

- Schema: `src/db/schema/{conversations,conversation_events,episodes}.ts`
- Event writer: `src/modules/analytics/log.ts`
- Transitions: `src/modules/conversations/service.ts` (ingest, takeover,
  handback, `closeConversation`, `reopenConversation`, `resolveReopenEpisodeId`,
  `autoCloseIdleConversations`)
- Escalation: `src/core/pipeline.ts` (`flagHandoff`)
- Projection + backfill: `src/modules/analytics/projection.ts`
  (`refreshEpisodes`, `backfillEpisodeIds`)
- Scheduler: `src/core/scheduler.ts`, wired in `src/index.ts`
- Live analytics: `src/modules/analytics/service.ts`
- Config: `src/config.ts` (`episodeReopenWindowMs`, `inactivityAutoCloseMs`,
  `schedulerTickMs`)
