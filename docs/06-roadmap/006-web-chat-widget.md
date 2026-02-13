# Web Chat Widget

> Phase: In Progress
> Status: Phase 6 Complete
> Priority: Medium

## Overview

A lightweight, embeddable chat widget that hotels place on their website so guests can message the hotel directly — before, during, or after their stay. It is the "web chat" channel, sitting alongside WhatsApp, SMS, and email in the existing multi-channel architecture.

**What makes it unique:** Unlike other channels (WhatsApp via Meta, SMS via Twilio), the hotel hosts both the client and server. No third-party API keys needed — just activate and embed. This makes it the simplest channel to set up and the richest in terms of UI capabilities.

## Key Features

### Guest-Facing (Widget)

1. **CTA trigger + expandable chat panel** — Hotel places a trigger element (button, link, or any HTML tag) on their site using the `data-butler-chat` attribute. Clicking it opens the chat panel. Hotels can use the default floating bubble preset or style the trigger however they want.

2. **Real-time messaging** — WebSocket connection to the gateway. Guest sends a message, AI responds instantly. If AI can't handle it, escalates to staff who see it in the dashboard like any other conversation.

3. **Guest identification** — Anonymous by default (session token in localStorage). Optionally asks for name + email/phone to link the conversation to a guest profile. Guests can verify their booking via a structured form (two-factor: booking reference + last name/email/phone).

4. **Pre-chat form** — Optional configurable form shown before chat starts (name, email, "what can we help with?"). Hotels toggle this on/off via dashboard settings.

5. **Rich responses** — AI can send structured content since we control the renderer:
   - Quick-reply buttons ("Yes" / "No", "Room Service" / "Housekeeping")
   - Links and images (room photos, menus)
   - Simple cards (spa services, restaurant options)

6. **Typing indicators + read receipts** — Standard chat UX so guests know something is happening.

7. **Offline mode** — When no staff is online and AI is not configured, show a customizable "away" message and offer to collect the guest's question + contact info for follow-up.

8. **Conversation persistence** — If the guest refreshes or returns later, their conversation history is still there (tied to the server-side session via the stored token). For verified guests, the session persists for their entire stay (see [Session Management](#session-management)).

9. **Mobile responsive** — Full-screen on mobile, panel on desktop.

### Staff-Facing (Dashboard)

1. **Conversations appear in existing list** — Web chat conversations show up in the dashboard conversations view tagged with channel = `webchat`, alongside WhatsApp/SMS/email.

2. **Same workflow** — Tasks, escalations, and handoff work identically. A guest asking for towels via the widget creates a task the same way a WhatsApp message would.

3. **Widget configuration** — Appearance, behavior, and embed code managed through dashboard settings (same pattern as other channel apps).

---

## Architecture

### Where It Lives

| Piece | Location | Purpose |
|-------|----------|---------|
| Channel adapter | `src/apps/channels/webchat/` | Backend — handles WebSocket connections, message routing. Follows the `ChannelAdapter` interface like WhatsApp/SMS/email. |
| Widget bundle | `apps/webchat/` | Frontend — the JavaScript bundle hotels embed on their site via a `<script>` tag. Built as a standalone bundle (not part of the dashboard). |

### It's an App

The web chat widget is a **channel app**, just like Mailgun or Twilio. It:

- Registers in the app registry with a manifest (`ChannelAppManifest`)
- Appears on the **Apps** page in the dashboard under "Channels"
- Can be activated/deactivated by admins
- Has its own configuration (colors, welcome message, pre-chat form, etc.)
- Follows the same `ChannelAdapter` interface contract

### How It Connects

```
Guest's Browser (widget)
    ↕ WebSocket (/ws/chat)
Hotel's Butler Instance (gateway)
    ↕ ChannelAdapter interface
Message Processor → AI / Staff Escalation
    ↕
Staff Dashboard (/ws + REST API)
```

- **Inbound:** Widget opens a WebSocket to the gateway at `/ws/chat`. Guest messages arrive as `InboundMessage` with `channel: 'webchat'` and `channelId` set to the session ID.
- **Outbound:** Messages reach the guest's browser through different paths depending on the sender (see below).
- **Conversations** are created and managed the same way as any other channel — the message processor doesn't know or care that this came from a widget vs WhatsApp.

### Message Delivery Paths

There are 5 cases where a message needs to reach the guest's browser. Each uses the `WebChatConnectionManager` which maps session IDs to a set of WebSocket connections (supporting multiple tabs).

| Case | Trigger | How it delivers | Persisted by |
|------|---------|----------------|--------------|
| **AI response** | Guest sends message via WebSocket | Handler calls `messageProcessor.process()`, sends response via `connectionManager.send()` to all tabs | Message processor (`addMessage`) |
| **Staff reply** | Staff sends via `POST /conversations/:id/messages` | `sendToChannel('webchat')` calls `connectionManager.send()` — same pattern as WhatsApp/SMS cases in `conversations.ts` | Conversations route (`addMessage`) |
| **Action result** | Guest submits form via `POST /webchat/actions/:id` | Action endpoint saves system message, then calls `connectionManager.send()` to broadcast + returns HTTP response | Action endpoint (`addMessage`) |
| **Guest msg echo** | Guest sends from one tab | `connectionManager.sendToOthers()` echoes to other tabs (sender already shows it locally) | Message processor (saves once) |
| **Session update** | Verification completes | `connectionManager.send()` broadcasts `session_update` to all tabs | Session service (updates session row) |

**Existing code integration:** The webchat module hooks into existing code at exactly 2 points:

1. **`src/gateway/websocket.ts`** — Add `else if (pathname === '/ws/chat')` to the upgrade handler (line 48). Existing `/ws` staff path untouched.

2. **`src/gateway/routes/conversations.ts`** — Add `case 'webchat'` to the `sendToChannel()` switch (line 194). Follows the same shape as the WhatsApp and SMS cases: check registry for active status, get the delivery mechanism, send, log. The only difference is that WhatsApp/SMS use external API providers (`provider.sendText()`, `provider.sendMessage()`), while webchat uses the in-process connection manager (`connectionManager.send()`). This is inherent to webchat being self-hosted — no external API to call.

Everything else — `message-processor.ts`, `conversationService`, event system, `websocket-bridge.ts` — is **not modified**. The message processor already correctly skips phone-based guest lookup for non-whatsapp/sms channels, and `conversationService.findOrCreate()` already accepts any `ChannelType` with optional `guestId`.

### ChannelType

The `ChannelType` union in `src/types/channel.ts` already includes `'webchat'`:

```typescript
type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';
```

No schema change needed — conversations, messages, routing, and the dashboard already recognize `webchat` as a valid channel.

### Widget Tech Stack

The widget bundle in `apps/webchat/` should be:

- **Lightweight** — Small bundle size since it loads on the hotel's website (target < 50KB gzipped)
- **Framework-agnostic** — No dependency on the host site's framework. Preact or vanilla JS + lit-html are good options for minimal size
- **Self-contained** — Renders into a shadow DOM or iframe to avoid CSS conflicts with the host site
- **Single build output** — One `widget.js` file that contains everything

### Guest Identity Flow

1. **Anonymous start** — When the guest opens the chat, the server creates a session and returns an opaque token. The widget stores this token in localStorage. All messages are tied to this server-side session. No personal data is exposed — the AI treats them as an unknown guest.
2. **Optional identification** — If pre-chat form is enabled or guest volunteers info (name, email), the session gets linked to a guest profile. This is one-way — the guest provides info, the system stores it. No existing guest data is revealed back at this stage.
3. **Verified booking link** — Guest can request to link their conversation to a reservation. This requires **two-factor verification**: booking reference + a second piece of info only the real guest knows (last name on the booking, email on file, or last 4 digits of phone). Both must match PMS data before the link is established. See [Security](#security) section for details.
4. **Cross-session** — If a verified guest returns and re-identifies (same verification check), a new session and conversation are created. Access to previous webchat conversations for the same guest is a Phase 7 feature (queried by guest ID + channel type = `'webchat'`).

---

## Widget Embed Model

Hotels add two things to their website — a script tag and a CTA element:

```html
<!-- 1. The script — loads the widget logic -->
<script src="https://their-butler-instance.com/widget.js" data-butler-key="wc_abc123"></script>

<!-- 2. The CTA — the trigger element the guest clicks to open the chat -->
<button data-butler-chat>Chat with us</button>
```

The CTA element can be any HTML tag — `<button>`, `<a>`, `<div>` — as long as it has the `data-butler-chat` attribute. This gives hotels two levels of control:

**Basic users:** Use the element as-is (`data-butler-chat` or `data-butler-chat="bubble"`). The widget script applies default floating bubble styling (primary color, fixed position, bottom corner). This is the only built-in preset in Phase 4. Additional presets (e.g., inline button) are a Phase 6 dashboard feature.

**Advanced users:** Use `data-butler-chat="custom"` to opt out of all default CTA styles. The widget only attaches the click handler and connection logic — hotels provide all styling. Hotels can make it a custom-designed button in their nav bar, a banner, a link in the footer, etc.

```html
<!-- Advanced: fully custom styled CTA -->
<a href="#" data-butler-chat="custom" class="hotel-custom-chat-btn">
  <img src="/chat-icon.svg" /> Need help? Talk to us
</a>
```

**How it works:**

1. Script loads and finds all elements with `data-butler-chat`
2. Loads the widget's default CSS (scoped with `butler-chat-` class prefix) and applies the `butler-chat-trigger` class to CTA elements that use the default preset (`data-butler-chat` or `data-butler-chat="bubble"`). Elements with `data-butler-chat="custom"` get only the click handler, no default styles.
3. Hotels override any default style using standard CSS specificity — their own rules win over the widget's defaults. Alternatively, use `data-butler-chat="custom"` to opt out of all default CTA styling.
4. Attaches click handler to open the chat panel
5. Chat panel itself is always rendered by the widget (shadow DOM) — fully isolated CSS. Only the CTA trigger lives in the host page's DOM
6. WebSocket connection is established when the guest opens the chat

The `widget.js` file is served by the Butler gateway as a static asset. The `data-butler-key` attribute is a widget configuration key — generated when the admin activates webchat in the dashboard (Phase 6). The widget uses it to fetch its configuration (colors, welcome message, allowed actions, etc.) via `GET /api/v1/webchat/config?key=wc_abc123`. For Phase 1-5, this attribute is not required — the widget stores it but uses hardcoded defaults until Phase 6 adds the config endpoint.

**Why script + CTA instead of script-only:**
- Hotels control where the trigger appears (floating, in nav, in footer, on specific pages only)
- Hotels override the trigger's default styling with standard CSS — no API or config needed
- The chat panel itself is still fully managed by the widget — no risk of hotels breaking the chat UI
- Multiple CTAs are supported — a hotel can have a floating bubble AND an inline button, both opening the same chat

---

## Widget Actions (Form-Based Interactions)

Not everything should go through the AI. Structured operations — reservation verification, extending a stay, booking a room, ordering a meal — are handled by **widget actions**: server-defined forms that the AI triggers mid-conversation.

### The Problem

If a guest says "I want to extend my stay", the AI could try to collect the new date through back-and-forth chat messages. But that's slow, error-prone (date formatting, validation), and means sensitive data (booking details) flows through the LLM context. A structured form is better for both UX and security.

### How It Works

Each action is a form definition stored on the server:

```typescript
interface WidgetAction {
  id: string;                    // 'verify-reservation', 'extend-stay', etc.
  name: string;                  // Human-readable: "Extend Your Stay"
  triggerHint: string;           // For AI: "guest wants to extend their stay"
  requiresVerification: boolean; // Must guest be verified first?
  fields: WidgetActionField[];   // Form fields
  endpoint: string;              // Backend API: POST /api/v1/webchat/actions/extend-stay
}

interface WidgetActionField {
  key: string;           // 'newCheckoutDate'
  label: string;         // 'New checkout date'
  type: 'text' | 'date' | 'number' | 'select' | 'email' | 'tel';
  required: boolean;
  options?: string[];    // For select type
  placeholder?: string;
  validation?: string;   // Regex or built-in rule
  showWhen?: {           // Conditional visibility — field only shown when
    field: string;       // another field (by key) has one of these values
    values: string[];
  };
}
```

### The Flow

```
1. Guest: "I'd like to extend my stay"

2. AI recognizes intent → responds with:
   { type: "action", actionId: "extend-stay" }
   + message: "I can help with that!"

3. Widget checks: does this action require verification?
   → YES, and session is NOT verified
   → Widget automatically shows verify-reservation form FIRST

4. Guest picks a verification method and fills out the form:
   → Method A: booking ref + last name → single submission
   → Method B: booking ref + email → single submission
   → Method C: email → server sends 4-digit code → guest enters code (two-step)
   → Direct API call to POST /api/v1/webchat/actions/verify-reservation
   → Server validates against PMS → success
   → Session is now verified (server-side)

5. Widget automatically chains to the original action
   → Shows the extend-stay form (new checkout date)

6. Guest fills out extend-stay form
   → Direct API call to POST /api/v1/webchat/actions/extend-stay
   → Server processes via PMS → returns result

7. Result displayed as a system message in the chat
   → On the guest's next message, the AI sees the result in conversation history
   → AI continues naturally: "You're welcome! Enjoy your extended stay."
```

If the guest is **already verified** (from an earlier interaction in the same session), step 3-4 is skipped entirely — the widget goes straight to the extend-stay form.

### What the AI Knows

The AI's system prompt includes action IDs and trigger hints — not form schemas or endpoints:

```
Available actions you can trigger:
- verify-reservation: when guest wants to link/verify their booking
- extend-stay: when guest wants to extend (requires verification)
- book-room: when guest wants to make a new reservation
- order-meal: when guest wants to order room service (requires verification)
- request-service: when guest wants housekeeping, maintenance, etc. (requires verification)
```

The AI only decides **when** to trigger an action. The widget handles **how** (rendering the form), and the backend handles **what** (processing the submission). The AI never sees the form data.

### Verification Chaining

Many actions require the guest to be verified first. The widget handles this automatically:

1. AI triggers an action that requires verification
2. Widget checks session verification status (server-side, not localStorage)
3. If not verified → shows verification form first → on success → shows the requested action form
4. If already verified → shows the requested action form directly

This means the AI doesn't need to think about verification flow. It just triggers "extend-stay" and the widget handles the rest.

### Action Registry

Actions are defined on the server and fetched by the widget on connect (`GET /api/v1/webchat/actions`). This means:

- **New actions can be added** without changing the widget code — just register a new action definition on the server
- **Actions can be enabled/disabled** per hotel via dashboard configuration
- **The widget renders forms dynamically** based on the field definitions it receives
- **Actions are versioned** — if the form changes, the widget always gets the latest definition

### Initial Actions (V1)

| Action | Requires Verification | Purpose |
|--------|----------------------|---------|
| `verify-reservation` | No (it IS verification) | Link session to a booking |
| `extend-stay` | Yes | Request stay extension via PMS |
| `book-room` | No | New reservation (guest provides details) |
| `order-meal` | Yes | Room service order |
| `request-service` | Yes | Housekeeping, maintenance, amenities |

More actions can be added over time without widget changes.

### Action Endpoints

Each action has a dedicated backend endpoint under `/api/v1/webchat/actions/`. These endpoints:

- Validate the form input
- Check session verification status (if required)
- Call the appropriate service (PMS adapter, task router, etc.)
- Return a structured result that the widget injects into the conversation
- Never expose raw PMS/internal data — only the fields needed for the response

---

## Session Management

### Session Token (Server-Side Authority)

Verification status and session state live on the **server**, not in browser storage. The widget holds only an opaque session token.

```
Widget connects → server creates session → returns session token
Widget stores token in localStorage (opaque string, no guest data)
Widget reconnects (refresh/return) → sends token → server validates
Server knows: session ID, verification status, linked guest ID, expiry
```

**Why server-side:**
- A client-side "verified" flag in localStorage could be faked
- The server is the only place that can reliably track verification state
- Session expiry is enforced server-side — no client-side clock manipulation

### Session Lifecycle

1. **Created** — Guest opens the chat. Server creates a session, returns an opaque token. Widget stores it in localStorage. Session has a 24-hour inactivity timeout.
2. **Active** — Guest sends messages, fills forms. Server tracks the conversation. Each interaction resets the inactivity timer.
3. **Verified** — Guest completes the verification form. Server marks the session as verified for a specific guest profile. The token doesn't change — the server updates its internal state. **The session expiry is upgraded** (see below).
4. **Reconnected** — Guest refreshes page or returns later. Widget sends the stored token. Server validates it, restores the session state (including verification status). No re-verification needed.
5. **Expired** — Session expiry depends on verification status (see below). On next connect after expiry, the old token is rejected, a new session is created.

### Session Expiry Rules

Session expiry is **stay-aware** — once a guest verifies, the session lasts for their entire stay:

| Session State | Expiry Rule | Rationale |
|---------------|-------------|-----------|
| **Anonymous** (not verified) | 24 hours of inactivity | Casual browser, no stay to anchor to |
| **Verified, pre-arrival** (before check-in) | 7 days of inactivity | Guest asking pre-arrival questions. Long enough to be useful, short enough to not persist for months if they booked far in advance. |
| **Verified, during stay** (check-in to checkout) | Checkout date + 24 hours | Guest shouldn't re-verify mid-stay. The +24h buffer covers late checkout. |
| **Verified, post-checkout** (past checkout + 24h) | Immediate expiry on next connect | Stay is over, session should not persist |
| **Verified** (no reservation dates found) | 7 days of inactivity | Fallback if PMS has no check-in/checkout dates |

**How it works:** When the `verify-reservation` action succeeds, the server fetches the check-in and checkout dates from the PMS and sets the session expiry based on where the guest is in their stay:

- **Before check-in:** Expiry = 7 days of inactivity. A guest who books for March 15-20 and verifies on February 1st gets a 7-day rolling window. If they come back on February 5th to ask another question, the timer resets. If they don't return for 7 days, the session expires and they re-verify on their next visit (quick — they've done it before).
- **On or after check-in:** Expiry upgrades to `checkoutDate + 24h`. When check-in day arrives, the server automatically extends the session on the next connect. A guest who verified pre-arrival and returns during their stay doesn't need to re-verify — the session is still valid and now anchored to checkout.
- **After checkout + 24h:** Session expires. Guest starts fresh.

**Edge cases:**
- **Pre-arrival → arrival transition:** Guest verifies a week before check-in. On check-in day, they open the widget. Server sees the session is valid and check-in has passed → upgrades expiry to checkout + 24h. Seamless.
- **Stay extension:** If the guest extends their stay (via the `extend-stay` action), the server updates the session expiry to the new checkout date + 24h.
- **Early checkout:** If the PMS reports checkout before the original date, the session expiry updates on the next server-side check.
- **Guest clears localStorage:** Token is gone, new session starts. Must re-verify. This is fine — it's the guest's own action.
- **Far-future booking:** Guest books 6 months out and verifies today. Session expires after 7 days of inactivity. When they return closer to their stay, they re-verify (takes seconds) and start a fresh session.

### What's Stored Where

| Data | Where | Why |
|------|-------|-----|
| Session token (opaque string) | localStorage | So the widget can reconnect after refresh |
| Session state (verification status, guest ID, expiry) | Server (in-memory or DB) | Source of truth — can't be faked |
| Conversation history | Server (DB) | Tied to session, loaded on reconnect |
| Form data (booking ref, personal details) | Nowhere after processing | Submitted, validated, discarded — not cached |

### Multiple Tabs / Devices

- Same browser, same device → same localStorage → same session token → same conversation
- Different browser or device → different localStorage → new session → must re-verify
- Multiple tabs → same session (they share localStorage). The server accepts multiple WebSocket connections per session — the connection manager maps each session ID to a **set** of connections. Messages (AI responses, staff replies) go to all connections for that session. When a guest sends from one tab, the server echoes the message to all other tabs to keep them in sync.

---

## Security

Guest data protection is critical — the widget is on a public website, accessible to anyone. The core principle: **never reveal guest data to someone who hasn't proven they are that guest.**

### Anonymous by Default

- A brand new chat session has zero guest data. The AI treats the guest as unknown.
- The guest can ask general questions (check-out time, restaurant hours, wifi password) without identifying themselves.
- No existing guest data from the PMS, other channels, or previous conversations is exposed until the guest completes verification via the `verify-reservation` widget action.

### Reservation Verification

Handled by the `verify-reservation` widget action (see [Widget Actions](#widget-actions-form-based-interactions)). The guest fills a structured form — never free-text through the AI. Three verification methods are supported:

**Method A: Booking Reference + Last Name**
Guest enters their booking reference (e.g., `BK-12345`) and the last name on the reservation. Both must match the PMS record. Instant verification.

**Method B: Booking Reference + Email**
Guest enters their booking reference and the email address on file. Both must match the PMS record. Instant verification.

**Method C: Email + Verification Code**
Guest enters their email address. The server looks up the email in the PMS — if a matching reservation is found, a 4-digit code is emailed to that address. Guest enters the code to complete verification. This is a two-step flow: the first submission triggers the email, the server responds with a `nextStep` containing the code input field, and the second submission completes verification. Useful for guests who booked through third parties (OTAs) and don't have their booking reference handy. Requires an email provider to be configured (Mailgun, SendGrid, etc.).

All methods require a matching PMS reservation. If verification fails, the attempt is logged and counted (max 5 per session). This prevents:
- Someone who sees a booking reference on a printed confirmation from impersonating the guest
- Random guessing of booking codes
- Brute-forcing email verification codes
- Staff accidentally leaking info to the wrong person

After successful verification, the server marks the session as verified and upgrades the session expiry based on the guest's stay phase — 7-day rolling window pre-arrival, checkout + 24h during the stay (see [Session Expiry Rules](#session-expiry-rules)). The guest stays verified without needing to re-verify — even across page refreshes and days of inactivity. The verification state is server-side, not in browser storage.

### Data Exposure Limits

Even after verification, the widget enforces strict limits on what data the AI can surface:

| Data | Exposed in Widget? | Notes |
|------|-------------------|-------|
| Check-in/out dates | Yes | After verification |
| Room type / booking status | Yes | After verification |
| Guest name | Yes | After verification (they already know it) |
| Room number | No | Security risk — never sent through widget |
| Credit card info | No | Never sent through any channel |
| Full phone number | No | Only last 4 digits if needed |
| Full email | No | Only masked (a***@example.com) |
| Other guests on booking | No | Privacy of co-travelers |
| Billing / folio details | No | Must use hotel's guest portal |

Staff see the full picture in the dashboard. The widget is a restricted view.

### Conversation Scope

- The widget only shows the **current webchat conversation**. It does NOT expose messages from other channels (WhatsApp, SMS, email) even after verification.
- Staff in the dashboard see the unified view across all channels — but that's behind authentication and role-based access.
- If a verified guest returns in a new session and re-verifies, a new conversation is started. Access to previous webchat conversations for the same guest is a Phase 7 feature (queried by guest ID + channel type).

### Rate Limiting & Abuse Prevention

- **Verification attempts:** Max 5 failed verification attempts per session. After that, verification is locked for that session — guest must start a new session (prevents brute-forcing booking references).
- **Message rate:** Max messages per minute per session to prevent spam/abuse.
- **Connection limits:** Max concurrent WebSocket connections per IP to prevent resource exhaustion.
- **Domain allowlist:** Widget only connects if the hosting page's domain is in the allowed list (configured in dashboard). Prevents someone embedding the widget on an unauthorized site.

### Form Data Handling

- Widget action form submissions go directly to backend API endpoints — never through the AI.
- Form data (booking reference, personal details) is validated and processed, then discarded. It is not cached in the session or logged.
- Each AI response that needs reservation data fetches it fresh from the PMS adapter, filtered through the exposure rules above.

---

## Hotel Admin Experience

### Configuration (Dashboard)

Managed through the Apps page when the web chat channel is activated:

**Appearance**
- Primary color (matches hotel branding — applied to chat panel and default CTA preset)
- Hotel logo (displayed in chat panel header)
- Welcome message (shown when chat panel opens)
- Default CTA preset: floating bubble (bottom-left or bottom-right) or inline button. Only applies when the hotel uses the default CTA styling — ignored when the hotel custom-styles the CTA element.

**Behavior**
- Pre-chat form: on/off
- Pre-chat form fields: name (required/optional), email (required/optional), custom message
- Auto-greeting: message sent automatically when chat opens
- Offline message: shown when unavailable
- Allowed domains: CORS whitelist for which websites can embed the widget

**Embed Code**
- Dashboard shows the full embed snippet (script + CTA element) ready to copy
- Includes the `data-butler-key` and gateway URL
- Shows examples for both floating bubble and inline button presets
- Notes that the CTA element can be restyled or repositioned by the hotel

### Setup Steps

1. Go to **Dashboard → Apps**
2. Find **"Web Chat"** in the Channels section
3. Click **Activate**
4. Configure appearance (colors, logo, welcome message)
5. Optionally enable pre-chat form
6. Copy the embed snippet (script + CTA element)
7. Paste the `<script>` tag into their website's HTML (before `</body>`)
8. Place the CTA element wherever they want the chat trigger to appear (or leave it next to the script for floating bubble mode)
9. Optionally restyle the CTA element with their own CSS
10. Widget appears on their site — guests can start chatting

To disable: deactivate the app in the dashboard. The widget shows an "unavailable" state or hides the chat panel (the CTA element remains in the hotel's HTML but becomes inert).

---

## Key Differences From Other Channels

| Aspect | WhatsApp / SMS / Email | Web Chat Widget |
|--------|----------------------|-----------------|
| Third-party dependency | Meta / Twilio / SMTP provider | None — fully self-hosted |
| API keys required | Yes | No |
| Setup complexity | Configure provider, get credentials | Activate + paste embed snippet |
| Rich UI | Limited by platform | Full control (buttons, cards, images) |
| Guest identity | Phone number / email | Anonymous by default, optional identification |
| Real-time | Webhook-based (slight delay) | WebSocket (instant) |
| Offline handling | Messages queued by provider | Must handle in widget (away message) |

---

## What's NOT in Scope (Future)

These are intentionally excluded from the initial version:

- **File/image uploads from guests** — Text-only initially
- **Video/voice calls** — Chat only
- **Co-browsing** — No screen sharing
- **Chatbot flows / decision trees** — Uses the existing AI + intent system, not a separate flow builder
- **Multi-language auto-detection** — Uses whatever language the guest types in (AI handles it naturally)
- **Analytics dashboard for widget** — Conversations are already tracked; widget-specific analytics (open rate, engagement) can come later
- **A/B testing** — Single widget configuration per hotel

---

## Implementation Phases

### Phase 1: Core Pipeline (POC)

**Goal:** A message typed in a browser reaches the AI and a response comes back through the webchat channel.

Bare minimum plumbing — no styling, no widget UI, just a raw test HTML page with a text input. Proves the entire message flow works end-to-end: browser → WebSocket → adapter → message processor → AI → response back.

#### What's Built

1. A new WebSocket path `/ws/chat` for guest connections (separate from `/ws` which is JWT-authenticated staff only)
2. A `WebChatConnectionManager` that maps session IDs to WebSocket connections
3. A webchat channel adapter (`ChannelAppManifest`) that plugs into the existing message pipeline
4. Staff reply delivery via `sendToChannel('webchat')` in the existing conversations route
5. A raw test HTML page (`apps/webchat/test.html`) that can be opened in any browser or dropped on any website

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/apps/channels/webchat/index.ts` | Create | Channel manifest + adapter + connection manager + `handleGuestConnection()` export |
| `src/gateway/websocket.ts` | Modify | Add guest WSS + `/ws/chat` upgrade path, import and call `handleGuestConnection()` |
| `src/gateway/routes/conversations.ts` | Modify | Add `case 'webchat'` to `sendToChannel()` for staff reply delivery |
| `apps/webchat/test.html` | Create | Raw test page for end-to-end testing |

#### Technical Details

**WebSocket path routing** — The existing upgrade handler in `src/gateway/websocket.ts` (line 44-56) routes `/ws` to the staff WebSocket server. Add a second `WebSocketServer` instance for `/ws/chat`:

```
server.on('upgrade')
  ├── /ws       → staff WSS (existing, JWT auth)
  └── /ws/chat  → guest WSS (new, no auth, anonymous)
```

The guest WSS has no JWT requirement. Anyone can connect. Authentication happens at the session level (Phase 2), not the connection level.

**Connection manager** — Lives in the webchat adapter module. Maps temporary IDs to WebSocket connections so that `send()` can push AI responses back to the right browser:

```typescript
// src/apps/channels/webchat/index.ts

class WebChatConnectionManager {
  private connections = new Map<string, Set<WebSocket>>();

  add(id: string, ws: WebSocket): void            // Adds to the set (supports multiple tabs)
  remove(id: string, ws: WebSocket): void          // Removes one connection from the set
  removeAll(id: string): void                      // Removes all connections for a session
  send(id: string, message: object): boolean       // Sends to ALL connections in the set
  sendToOthers(id: string, exclude: WebSocket,     // Sends to all EXCEPT the sender
               message: object): boolean           // (used for echoing guest messages to other tabs)
  getCount(id: string): number                     // Number of active connections for a session
}
```

In Phase 1, the `id` is a temporary connection ID generated on connect (`generateId('session')`). In Phase 2, this becomes the real session token.

**Channel adapter** — Follows the `ChannelAppManifest` pattern from `src/apps/channels/sms/twilio.ts`:

```typescript
export const manifest: ChannelAppManifest = {
  id: 'channel-webchat',
  name: 'Web Chat',
  category: 'channel',
  version: '0.1.0',
  description: 'Chat widget for hotel websites',
  icon: '💬',
  configSchema: [],  // No config needed for Phase 1
  features: {
    inbound: true,
    outbound: true,
    media: false,
  },
  createAdapter: () => webchatAdapter,
};
```

The adapter implements `ChannelAdapter`:
- `send(message)` — looks up the WebSocket by `channelId` (session ID) in the connection manager, sends JSON
- `parseIncoming(raw)` — converts the WebSocket message into an `InboundMessage` with `channel: 'webchat'`

**Message flow:**

```
1. Guest types "What's the wifi password?" in test.html (Tab A)
2. Browser sends: { type: "message", content: "What's the wifi password?" }
3. Gateway receives on /ws/chat → constructs InboundMessage:
     { id: generateId('message'), channel: 'webchat',
       channelId: connectionId, content: "...", contentType: 'text',
       timestamp: new Date() }
4. Echo inbound message to other tabs:
     connectionManager.sendToOthers(connectionId, senderWs,
       { type: "message", direction: "inbound", content: "..." })
   Tab A already shows its own message locally — this keeps other tabs in sync.
5. Calls messageProcessor.process(inbound)
6. Message processor:
   - Skips phone-based guest lookup (channel !== 'whatsapp'/'sms')
   - Calls conversationService.findOrCreate('webchat', connectionId)
   - Saves inbound message
   - Generates AI response via responder
   - Saves outbound message
7. Returns OutboundMessage
8. connectionManager.send(connectionId, response) → sends to ALL tabs
9. Browser receives: { type: "message", content: "The wifi password is..." }
```

**Message processor — no changes needed.** `src/core/message-processor.ts` already handles `webchat` correctly: lines 61-69 only identify guests for `whatsapp` and `sms`, so webchat is skipped (guest identification happens via verification in Phase 3). Lines 83-100 load guest context only for phone channels, so webchat gets no guest context (anonymous) — which is fine for general questions. The conversation is created with `guestId: undefined`, which `conversationService.findOrCreate()` already supports.

**Two delivery paths for outbound messages:**

There are two ways a message gets sent to the guest — synchronous (AI) and asynchronous (staff):

*Synchronous (AI response):* The WebSocket handler calls `messageProcessor.process(inbound)`, gets the `OutboundMessage` back, and sends the response directly on the same WebSocket. The adapter's `send()` is never called — the handler already has the connection. This is the primary path in Phase 1.

*Asynchronous (staff reply from dashboard):* Staff submits a reply via `POST /api/v1/conversations/:id/messages`. The existing `sendToChannel()` function in `src/gateway/routes/conversations.ts` already handles delivery per channel type (WhatsApp via Meta, SMS via Twilio). We add a `case 'webchat'` that uses the connection manager:

```typescript
// In sendToChannel() — same shape as WhatsApp/SMS cases:
case 'webchat': {
  const ext = registry.get('channel-webchat');
  if (ext?.status === 'active') {
    webchatConnectionManager.send(channelId, {
      type: 'message', direction: 'outbound',
      senderType: 'staff', content,
    });
    log.info({ channelType, channelId }, 'Message sent via WebChat');
  } else {
    log.warn({ channelType }, 'WebChat channel not active');
  }
  break;
}
```

```
1. Staff submits reply via REST API → saves outbound message
2. sendToChannel('webchat', channelId, content) is called
3. Checks registry for active status (same as WhatsApp/SMS)
4. connectionManager.send() pushes to all connected tabs
5. If guest isn't connected → message is already in DB,
   delivered on reconnect via history restoration (Phase 2)
```

This follows the exact same pattern as WhatsApp and SMS — registry check, deliver, log. The only difference is the delivery mechanism: WhatsApp calls `provider.sendText()` (external API), webchat calls `connectionManager.send()` (in-process).

The adapter's `send(outboundMessage)` method on the `ChannelAdapter` interface delegates to the same connection manager logic, so direct adapter calls also work.

**Adapter registration and WebSocket wiring:**

The webchat module and the gateway have a clear separation:

- **Gateway** (`src/gateway/websocket.ts`) owns WebSocket infrastructure — creates the guest `WebSocketServer`, handles the `/ws/chat` upgrade path, manages heartbeats and connection lifecycle.
- **Webchat module** (`src/apps/channels/webchat/index.ts`) owns business logic — exports a `handleGuestConnection(ws, req)` function that the gateway calls for each new `/ws/chat` connection. Also exports the connection manager and manifest.

Wiring in `src/gateway/websocket.ts`:
```typescript
import { handleGuestConnection } from '@/apps/channels/webchat/index.js';

// In setupWebSocket():
const guestWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (pathname === '/ws')      wss.handleUpgrade(...)      // staff (existing)
  if (pathname === '/ws/chat') guestWss.handleUpgrade(...) // guest (new)
});

guestWss.on('connection', (ws, req) => handleGuestConnection(ws, req));
```

The webchat module's `handleGuestConnection()` handles: session creation/validation (Phase 2), message processing via `messageProcessor.process()`, and sending responses back.

For Phase 1-3, the webchat module auto-activates on server start — the gateway always creates the guest WSS and routes `/ws/chat` to it. No admin activation needed (no external dependencies). In Phase 6, a check is added: if the webchat app is deactivated in the dashboard, the gateway rejects `/ws/chat` connections with a "widget unavailable" message.

The manifest is also auto-registered in the app registry on startup (called from `src/apps/channels/webchat/index.ts`'s module init or from a dedicated `loadBuiltinApps()` step). Since `configSchema: []`, `createAdapter({})` is called with empty config.

**Test page** (`apps/webchat/test.html`) — A single HTML file with:
- A text input and send button
- WebSocket connection to `ws://localhost:3000/ws/chat`
- Incoming messages displayed in a message list
- Connection status indicator (connected/disconnected)
- No styling, no framework — raw HTML + vanilla JS

This file can be opened directly in a browser (`file://`) or served from any web server. To test on a live site, copy the relevant `<script>` from the file onto any page.

**How to test Phase 1:**

```bash
# Terminal 1: Start the server (must have AI provider configured)
pnpm dev

# Terminal 2: Open the test page
open apps/webchat/test.html
# Or drop the JS on your landing page

# In the browser:
# 1. Page connects to ws://localhost:3000/ws/chat
# 2. Type a message, hit send
# 3. AI response appears in the message list
# 4. Check dashboard — conversation appears with channel = 'webchat'
```

---

### Phase 2: Session Management

**Goal:** Sessions persist across page refreshes, server-side token system works, expiry rules enforced.

Guest opens chat, gets a session token, refreshes — conversation is still there. Anonymous sessions expire after 24h inactivity. Foundation for verification later.

#### What's Built

1. `webchat_sessions` database table to persist session state
2. `WebChatSessionService` to create, validate, update, and expire sessions
3. Token-based handshake: connect → receive token → store in localStorage → reconnect with token
4. Conversation history sent on reconnect so the guest sees previous messages
5. Automatic session cleanup (expire stale sessions)

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/db/schema.ts` | Modify | Add `webchat_sessions` table |
| `src/services/webchat-session.ts` | Create | Session lifecycle service |
| `src/apps/channels/webchat/index.ts` | Modify | Use session tokens instead of temp IDs, restore sessions on reconnect |
| `src/services/scheduler.ts` | Modify | Add hourly job to call `webchatSessionService.cleanupExpired()` |
| `apps/webchat/test.html` | Modify | Store/send session token, show conversation history |
| Migration file | Generate | `pnpm db:generate` |

#### Technical Details

**Database table** — `webchat_sessions`:

```typescript
// src/db/schema.ts

export const webchatSessions = sqliteTable('webchat_sessions', {
  id: text('id').primaryKey(),                    // generateId('session') → ses_xxx
  token: text('token').notNull().unique(),        // Opaque 64-char hex string
  conversationId: text('conversation_id')         // Linked conversation
    .references(() => conversations.id),
  guestId: text('guest_id')                       // Linked after verification (Phase 3)
    .references(() => guests.id),
  reservationId: text('reservation_id')           // Linked after verification (Phase 3)
    .references(() => reservations.id),
  verificationStatus: text('verification_status') // 'anonymous' | 'verified'
    .notNull().default('anonymous'),
  verificationAttempts: integer('verification_attempts') // Failed attempt count (Phase 3)
    .notNull().default(0),
  verificationCode: text('verification_code'),     // Hashed 4-digit code (Phase 3, Method C)
  verificationCodeExpiresAt: text('verification_code_expires_at'), // ISO datetime (10-min TTL)
  expiresAt: text('expires_at').notNull(),         // ISO datetime
  lastActivityAt: text('last_activity_at').notNull(), // Reset on each interaction
  createdAt: text('created_at').notNull()
    .default(sql`(datetime('now'))`),
});
```

**Session service** — `src/services/webchat-session.ts`:

```typescript
export class WebChatSessionService {
  /** Create a new anonymous session. Returns the session with token. */
  async create(): Promise<WebChatSession>

  /** Validate a token. Returns session if valid & not expired, null otherwise. */
  async validate(token: string): Promise<WebChatSession | null>

  /** Touch session — update lastActivityAt, recalculate expiry. */
  async touch(sessionId: string): Promise<void>

  /** Link session to a conversation. */
  async linkConversation(sessionId: string, conversationId: string): Promise<void>

  /** Mark session as verified (Phase 3 — defined now, used later). */
  async verify(sessionId: string, guestId: string, reservationId: string,
               checkIn: string, checkOut: string): Promise<void>

  /** Delete expired sessions (called periodically). */
  async cleanupExpired(): Promise<number>
}

export const webchatSessionService = new WebChatSessionService();
```

Token generation: `crypto.randomBytes(32).toString('hex')` — 64 characters, opaque, no guest data.

Anonymous expiry: `lastActivityAt + 24 hours`. Each message or form submission resets `lastActivityAt`. If the guest doesn't interact for 24 hours, the session expires.

**Connection handshake:**

```
Case 1: New guest (no token)
  Browser connects to /ws/chat
  Server creates session → returns:
    { type: "session", token: "abc...", verificationStatus: "anonymous" }
  Browser stores token in localStorage

Case 2: Returning guest (has token)
  Browser connects to /ws/chat?token=abc...
  Server validates token:
    → Valid: restores session, loads conversation history,
       sends { type: "session", token: "abc...", restored: true,
               verificationStatus: "anonymous" | "verified" }
       sends { type: "history", messages: [...] }
    → Expired/invalid: creates new session,
       sends { type: "session", token: "xyz...", previousExpired: true,
               verificationStatus: "anonymous" }
  Browser updates localStorage with (possibly new) token
```

**Connection manager update** — In Phase 1, the connection manager maps temp IDs to single WebSocket connections. In Phase 2, it maps **session IDs** to a **set** of WebSocket connections (supporting multiple tabs). When a guest reconnects with a valid token, the connection manager adds the new WebSocket to the session's connection set.

```
connectionManager.add(session.id, ws)     // Adds to the set for this session
connectionManager.send(session.id, response) // Sends to ALL connections in the set
// channelId in conversations = session.id
```

This means multiple tabs sharing the same localStorage token all receive the same messages. When the guest sends a message from one tab, the server echoes the inbound message to all other connections via `sendToOthers()` (so other tabs see what the guest typed), then broadcasts the AI response to all connections via `send()`. Session state changes (e.g., verification in Phase 3) are also broadcast to all connections via `session_update` messages.

**Conversation history on reconnect** — When a returning guest connects with a valid token, the server:
1. Validates the token → gets session → gets `conversationId`
2. Calls `conversationService.getMessages(conversationId, { limit: 50 })` — last 50 messages in chronological order
3. Sends them to the browser as a `history` message

**Session cleanup** — A periodic task (added to the existing scheduler in `src/services/scheduler.ts`) runs every hour to delete expired sessions. This prevents the DB from growing indefinitely.

**How to test Phase 2:**

```
1. Open test.html → sends message → gets response → token saved
2. Refresh page → page reconnects with token → sees previous messages
3. Open DevTools → localStorage shows the session token
4. Wait 24h (or manually expire in DB) → refresh → new session starts, old messages gone
5. Open same page in incognito → different session, different conversation
```

---

### Phase 3: Verification & Action Framework

**Goal:** AI can trigger structured forms, verification works with two-factor check, stay-aware expiry kicks in after verification.

Build the action registry, form rendering (still raw/unstyled), verification endpoint against PMS, and verification chaining. Test: say "extend my stay" → verification form → extend form → result back in chat. Validates the entire dual-path architecture (chat vs. forms).

#### What's Built

1. Action registry — server-side definitions for structured forms
2. `GET /api/v1/webchat/actions` — widget fetches available actions on connect
3. `POST /api/v1/webchat/actions/:actionId` — form submissions go here (direct API, not through AI)
4. Verification action — `verify-reservation` with two-factor check against PMS
5. AI integration — action hints in system prompt so AI knows when to trigger forms
6. Verification chaining — widget auto-shows verification before protected actions
7. Stay-aware session expiry upgrade on successful verification

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/services/webchat-action.ts` | Create | Action registry + definitions |
| `src/gateway/routes/webchat.ts` | Create | REST endpoints for actions |
| `src/gateway/routes/api.ts` | Modify | Register webchat routes |
| `src/apps/channels/webchat/index.ts` | Modify | Include action hints when building AI context |
| `src/services/webchat-session.ts` | Modify | Implement `verify()` with stay-aware expiry |
| `apps/webchat/test.html` | Modify | Action form rendering, verification chaining |

#### Technical Details

**Action registry** — `src/services/webchat-action.ts`:

Each action is a static definition. The registry returns the list and handles execution:

```typescript
export interface WebChatAction {
  id: string;
  name: string;
  triggerHint: string;             // For AI system prompt
  requiresVerification: boolean;
  fields: WebChatActionField[];
  endpoint: string;                // REST path
}

export interface WebChatActionField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'email' | 'tel';
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: string;             // Regex pattern
  showWhen?: {                     // Conditional visibility
    field: string;                 // Show only when this field (by key)
    values: string[];              // has one of these values
  };
}

export class WebChatActionService {
  /** Get all registered actions (sent to widget on connect). */
  getActions(): WebChatAction[]

  /** Get a single action by ID. */
  getAction(id: string): WebChatAction | undefined

  /** Execute an action — validates input, calls the appropriate service,
      returns a result message to inject into the conversation. */
  async execute(actionId: string, sessionToken: string,
                input: Record<string, string>): Promise<ActionResult>
}

export interface ActionResult {
  success: boolean;
  message: string;           // Human-readable result shown to the guest
  data?: Record<string, unknown>;  // Structured data (e.g., new checkout date)
  error?: string;
  nextStep?: {               // For multi-step actions (e.g., email code verification)
    fields: WebChatActionField[];       // Fields to show in the next form
    context: Record<string, string>;    // Data to carry forward (e.g., email)
  };
}
```

**V1 action definitions:**

```typescript
const actions: WebChatAction[] = [
  {
    id: 'verify-reservation',
    name: 'Verify Your Booking',
    triggerHint: 'guest wants to verify or link their booking/reservation',
    requiresVerification: false,  // It IS verification
    fields: [
      { key: 'method', label: 'Verification Method', type: 'select', required: true,
        options: ['booking-name', 'booking-email', 'email-code'] },
      { key: 'confirmationNumber', label: 'Booking Reference',
        type: 'text', required: true, placeholder: 'e.g. BK-12345',
        showWhen: { field: 'method', values: ['booking-name', 'booking-email'] } },
      { key: 'lastName', label: 'Last Name on Booking',
        type: 'text', required: true, placeholder: 'As it appears on your reservation',
        showWhen: { field: 'method', values: ['booking-name'] } },
      { key: 'email', label: 'Email Address',
        type: 'email', required: true, placeholder: 'Email on your reservation',
        showWhen: { field: 'method', values: ['booking-email', 'email-code'] } },
    ],
    endpoint: '/api/v1/webchat/actions/verify-reservation',
  },
  {
    id: 'extend-stay',
    name: 'Extend Your Stay',
    triggerHint: 'guest wants to extend their stay or change checkout date',
    requiresVerification: true,
    fields: [
      { key: 'newCheckoutDate', label: 'New Checkout Date',
        type: 'date', required: true },
      { key: 'notes', label: 'Special Requests',
        type: 'text', required: false, placeholder: 'Optional' },
    ],
    endpoint: '/api/v1/webchat/actions/extend-stay',
  },
];
```

For the `email-code` method, the first submission returns an `ActionResult` with `nextStep`:
```json
{
  "success": true,
  "message": "A 4-digit code has been sent to your email.",
  "nextStep": {
    "fields": [
      { "key": "code", "label": "Verification Code", "type": "text",
        "required": true, "placeholder": "4-digit code from your email" }
    ],
    "context": { "email": "guest@example.com", "method": "email-code" }
  }
}
```
The widget renders the next form. On submit, the widget sends the `nextStep.context` fields merged with the new input back to the same endpoint. The server validates the code and completes verification.

**REST endpoints** — `src/gateway/routes/webchat.ts`:

All endpoints require a valid session token in the `Authorization` header (`Bearer <token>`). No JWT — just the raw session token validated by `webchatSessionService.validate()`.

```
GET  /api/v1/webchat/actions
  → Returns action definitions (minus endpoint URLs — widget doesn't need them)
  → No session required (widget needs this on first load)

POST /api/v1/webchat/actions/:actionId
  → Header: Authorization: Bearer <session-token>
  → Body: { field values from the form }
  → Validates session, validates input fields, executes action
  → Returns ActionResult
```

**Verification flow** — When `POST /api/v1/webchat/actions/verify-reservation` is called:

```
1. Validate session token → get session
2. Check session.verificationAttempts < 5 → if exceeded, return error
3. Read { method } from body and branch:

   Method A (booking-name):
     Extract { confirmationNumber, lastName }
     Call PMS: getReservationByConfirmation(confirmationNumber)
     → No PMS configured → return error "Verification unavailable"
     → No reservation → increment attempts, return error
     Compare lastName (case-insensitive)
     → Mismatch → increment attempts, return error
     → Match → proceed to step 4

   Method B (booking-email):
     Extract { confirmationNumber, email }
     Call PMS: getReservationByConfirmation(confirmationNumber)
     → Same PMS checks as Method A
     Compare email (case-insensitive)
     → Mismatch → increment attempts, return error
     → Match → proceed to step 4

   Method C (email-code), step 1 — request code:
     Extract { email }
     Call PMS: searchReservations({ guestEmail: email })
     → No matching reservation → increment attempts, return error
     → Multiple reservations → pick the most relevant one:
       1. Active (currently checked in)
       2. Upcoming (earliest future arrival date)
       3. Most recent past reservation
     Generate 4-digit code
     Hash with SHA-256 and store in session fields:
       verificationCode = hash, verificationCodeExpiresAt = now + 10 minutes
     Send plaintext code via transactional email (uses configured email provider)
     → No email provider → return error "Email verification unavailable"
     Return { success: true, message: "Code sent", nextStep: { fields: [code], context: { email } } }
     (Stop here — guest needs to submit the code)

   Method C (email-code), step 2 — verify code:
     Extract { email, code } (email from nextStep.context)
     Hash submitted code with SHA-256, compare against stored hash (constant-time)
     Check verificationCodeExpiresAt has not passed
     → Mismatch or expired → increment attempts, return error
     → Match → proceed to step 4

4. Verification success! Call webchatSessionService.verify():
   - Set verificationStatus = 'verified'
   - Set guestId (find or create guest from PMS data)
   - Set reservationId
   - Clear verificationCode and verificationCodeExpiresAt
   - Calculate expiry based on stay phase:
     → Before check-in: lastActivityAt + 7 days
     → During stay: checkoutDate + 24h
     → After checkout + 24h: immediate expiry (edge case)
   - Link conversation to guest
   - Reset verificationAttempts to 0
5. Broadcast session update to all connections for this session:
     connectionManager.send(sessionId, { type: "session_update",
       verificationStatus: "verified" })
   This ensures other tabs (e.g., Tab B) update their cached verification
   status without requiring a re-handshake.
6. Return { success: true, message: "Booking verified! ..." }
```

**AI integration** — When the webchat adapter builds context for the AI, it includes action hints in the system prompt:

```
You are chatting with a guest via the hotel website widget.

Available actions you can trigger (respond with action metadata):
- verify-reservation: when guest wants to verify or link their booking
- extend-stay: when guest wants to extend their stay (requires verification)

To trigger an action, include in your response metadata:
{ "action": { "id": "extend-stay" } }
Then tell the guest you're pulling up the form.
```

The AI's response `metadata.action.id` is passed back to the widget, which renders the form. The form submission goes directly to the REST endpoint — not back through the AI.

**Verification chaining in the widget** — Client-side logic in the test page:

```
1. AI response arrives with metadata: { action: { id: "extend-stay" } }
2. Widget looks up action definition: extend-stay.requiresVerification = true
3. Widget checks session: verificationStatus (from session handshake or session_update)
4. If NOT verified:
   a. Store pendingActionId = "extend-stay"
   b. Show verify-reservation form instead
   c. On successful verification → server broadcasts { type: "session_update",
      verificationStatus: "verified" } to all connections
   d. Widget receives session_update → updates cached status
   e. Widget auto-shows the extend-stay form (the original request)
5. If already verified:
   a. Show extend-stay form directly
6. On form submit → POST to action endpoint → result displayed in chat
   (server saves result as system message and broadcasts to all tabs)
```

The widget tracks `verificationStatus` from two sources: the initial session handshake response, and `session_update` messages received via WebSocket. This ensures all tabs stay in sync when one tab completes verification.

**Action result injection** — The action REST endpoint owns the full lifecycle — process, persist, broadcast, respond:

```
1. Widget POSTs form data to action endpoint
2. Server processes action (calls PMS, task router, etc.)
3. Server saves ActionResult.message as a system message in the conversation
     conversationService.addMessage(conversationId, {
       direction: 'outbound', senderType: 'system',
       content: result.message, contentType: 'text' })
4. Server broadcasts the system message to all WebSocket connections for this session
     connectionManager.send(sessionId, { type: "message", direction: "outbound",
       senderType: "system", content: result.message })
5. Server returns ActionResult via HTTP response
6. Widget displays ActionResult.message (already persisted and broadcast)
7. On the guest's next message, the AI sees the system message in conversation
   history and can reference the result naturally
```

The server persists the result before returning the HTTP response. No WebSocket relay from the widget needed — if the WebSocket drops, the result is still saved and appears in history on reconnect. Other tabs receive the system message via the broadcast in step 4.

The AI does not generate an immediate follow-up to the action result. Instead, the `ActionResult.message` itself is written to be **conversational and self-closing** — the action service (not the AI) is responsible for a complete response:

- Good: *"Your stay has been extended to March 15th! Is there anything else I can help with?"*
- Bad: *"Stay extended to 2024-03-15"* (feels like a dead-end, guest doesn't know what to do next)

This avoids the need for a "system event → AI response" pipeline in Phase 3. The AI naturally picks up context on the next guest message because it sees the system message in conversation history. A richer Phase 7 improvement would be: after the action result, the server automatically triggers an AI response that wraps the result into a more natural conversational follow-up.

**How to test Phase 3:**

Verification requires a PMS to be configured. For Phase 3 testing, use the mock PMS adapter (`src/apps/pms/mock.ts`) which provides seeded test reservations with known booking references, guest names, and emails. The email-code method additionally requires an email provider — test with Mailgun or use the mock PMS + booking-name/booking-email methods first.

```
1. Configure mock PMS with test reservation data (seed script)
2. Open test.html → connect → type "I'd like to extend my stay"
3. AI responds with action trigger → extend-stay form appears
4. Since not verified → verify-reservation form auto-shows first
5. Pick a method:
   → Method A: enter test booking ref + test last name
   → Method B: enter test booking ref + test email
   → Method C: enter test email → check inbox for code → enter code
6. Verification succeeds → extend-stay form auto-shows (chaining)
7. Enter new checkout date → POST to extend endpoint
   → Result appears in chat as system message
8. Type "Thanks!" → AI responds with context from the extension result
9. Refresh page → session still verified, conversation persists with history
10. Type another question requiring verification → no re-verification needed
```

#### Test Page at End of Phase 3

At the end of Phase 3, `apps/webchat/test.html` is a functional but unstyled test client. It can be dropped onto any website as a `<script>` block for testing. It provides:

- WebSocket connection with session token persistence (localStorage)
- Message send/receive with conversation history on reconnect
- Dynamic form rendering when AI triggers an action
- Verification chaining (auto-verify before protected actions)
- Session status display (anonymous / verified / expired)

The page connects to the Butler instance at a configurable URL (defaults to `localhost:3000`). To test on a live site, change the URL to the hotel's Butler instance address.

### Phase 4: Widget Bundle & Embed System

**Goal:** Standalone `widget.js` bundle that hotels can embed with a script + CTA element on any site without conflicts.

Build pipeline (`apps/webchat/`), shadow DOM isolation, CTA element detection (`data-butler-chat`), stub components for all UI pieces. The widget is **functional but minimally styled** — enough for usability and end-to-end testing, but visual polish comes in Phase 5. Test: paste snippet on a random HTML page → default CTA appears → opens a working chat panel with basic styling.

#### Key Decisions

**Framework:** Vanilla TypeScript (no Preact/React/lit). The widget has ~7 component types — too small to justify a framework. `test.html` already proves the full feature set in vanilla JS. Bundle target: < 50KB gzipped (likely 15-25KB).

**CSS:** Template literal strings in `*.css.ts` files, injected into shadow DOM via a single `<style>` element. Zero external CSS files — everything in one `widget.js`.

**Build:** Vite lib mode → single IIFE `widget.js`. Self-executing on load.

**Shadow DOM:** Chat panel in a shadow root on a host `<div>` appended to `document.body`. CTA triggers stay in host page DOM. `position: fixed` on the host element for reliable viewport positioning.

**Connection:** Lazy — WS connects only when guest first opens the panel.

#### Project Structure

```
apps/webchat/
├── package.json          # @jack/webchat, zero runtime deps
├── vite.config.ts        # Vite lib mode → IIFE widget.js
├── tsconfig.json         # DOM + ES2022, bundler moduleResolution
├── index.html            # Dev harness (simulates hotel page)
├── test.html             # Existing test page (kept, not built)
└── src/
    ├── main.ts           # Entry: auto-init, CTA detection, derive gateway origin
    ├── widget.ts          # ButlerChatWidget class: shadow DOM, instant show/hide
    ├── connection.ts      # WS connect/reconnect/heartbeat
    ├── session.ts         # localStorage token management
    ├── actions.ts         # Action registry, form submission, verification chaining
    ├── types.ts
    ├── constants.ts
    ├── utils.ts
    ├── components/        # Stubs in Phase 4, polished in Phase 5
    │   ├── chat-panel.ts       # Panel container (stub: basic flex layout)
    │   ├── chat-header.ts      # Header (stub: title text + close button)
    │   ├── message-list.ts     # Message area (stub: scrollable div)
    │   ├── message-bubble.ts   # Bubbles (stub: 4 variants, basic alignment)
    │   ├── input-bar.ts        # Input (stub: text input + send button)
    │   ├── action-form.ts      # Forms (stub: native form elements)
    │   └── typing-indicator.ts # Typing (stub: static "...", animated in Phase 5)
    └── styles/            # Stubs/empty in Phase 4, polished in Phase 5
        ├── theme.ts            # CSS custom properties + defaults
        ├── base.ts             # Shadow DOM reset
        ├── panel.css.ts        # (stub: basic dimensions)
        ├── header.css.ts       # (stub: basic layout)
        ├── messages.css.ts     # (stub: basic alignment)
        ├── input.css.ts        # (stub: basic layout)
        ├── forms.css.ts        # (stub: basic layout)
        ├── animations.css.ts   # (empty: animations added in Phase 5)
        └── responsive.css.ts   # (empty: responsive added in Phase 5)
```

All component and style files are created as **stubs** in Phase 4 — functional but minimally styled (basic layout, plain borders, native form elements). Phase 5 replaces them with production-quality, polished versions.

#### What's Built

1. Vite workspace package (`@jack/webchat`) with lib mode build → single IIFE `widget.js`
2. Self-executing entry point: reads `data-butler-key` from `<script>` tag (stored for Phase 6 config fetch, unused until then), derives gateway origin from `src` attribute
3. `ButlerChatWidget` class: shadow DOM host, instant show/hide toggle (animated in Phase 5), lazy WS connection
4. CTA detection: `querySelectorAll('[data-butler-chat]')` → click handlers, attribute-based preset (`data-butler-chat="bubble"` vs `"custom"`)
5. Connection logic ported from `test.html`: WS connect/reconnect/heartbeat, session token management
6. Stub components for all UI pieces: chat panel, header, message list, bubbles, input bar, action forms, typing indicator — functional with basic layout and minimal styling
7. Stub style files: shadow DOM reset, basic layout, simple colors — enough for usability, not visual polish
8. Action/verification logic ported from `test.html`: fetch actions, verification chaining, form submission
9. Gateway serves `/widget.js` from `./widget/` directory with CORS headers
10. CORS middleware on `/api/v1/webchat/*` routes — the widget runs cross-origin (hotel website ≠ Butler instance), so REST calls need CORS headers and OPTIONS preflight handling
11. Docker build integration: webchat build step + copy dist to `./widget`
12. Dev harness (`index.html`) for testing with Vite hot reload

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `apps/webchat/package.json` | Create | Workspace package, zero runtime deps |
| `apps/webchat/vite.config.ts` | Create | Lib mode build config |
| `apps/webchat/tsconfig.json` | Create | DOM + ES2022, bundler resolution |
| `apps/webchat/index.html` | Create | Dev harness simulating a hotel page |
| `apps/webchat/src/main.ts` | Create | Entry: auto-init, CTA detection |
| `apps/webchat/src/widget.ts` | Create | Shadow DOM host, instant show/hide toggle |
| `apps/webchat/src/connection.ts` | Create | WS connect/reconnect (ported from test.html) |
| `apps/webchat/src/session.ts` | Create | localStorage token management |
| `apps/webchat/src/actions.ts` | Create | Action registry, verification chaining |
| `apps/webchat/src/types.ts` | Create | Widget type definitions |
| `apps/webchat/src/constants.ts` | Create | Configuration constants |
| `apps/webchat/src/utils.ts` | Create | Shared utilities |
| `apps/webchat/src/components/chat-panel.ts` | Create (stub) | Panel container with basic flex layout |
| `apps/webchat/src/components/chat-header.ts` | Create (stub) | Title text + close button |
| `apps/webchat/src/components/message-list.ts` | Create (stub) | Scrollable div with overflow-y |
| `apps/webchat/src/components/message-bubble.ts` | Create (stub) | 4 variants with basic alignment |
| `apps/webchat/src/components/input-bar.ts` | Create (stub) | Text input + send button |
| `apps/webchat/src/components/action-form.ts` | Create (stub) | Dynamic form with native elements |
| `apps/webchat/src/components/typing-indicator.ts` | Create (stub) | Static "..." text indicator |
| `apps/webchat/src/styles/theme.ts` | Create | CSS custom properties with defaults |
| `apps/webchat/src/styles/base.ts` | Create | Shadow DOM reset |
| `apps/webchat/src/styles/panel.css.ts` | Create (stub) | Basic panel dimensions and positioning |
| `apps/webchat/src/styles/header.css.ts` | Create (stub) | Basic header layout |
| `apps/webchat/src/styles/messages.css.ts` | Create (stub) | Basic bubble alignment and spacing |
| `apps/webchat/src/styles/input.css.ts` | Create (stub) | Basic input layout |
| `apps/webchat/src/styles/forms.css.ts` | Create (stub) | Basic form layout |
| `apps/webchat/src/styles/animations.css.ts` | Create (empty) | Placeholder — animations added in Phase 5 |
| `apps/webchat/src/styles/responsive.css.ts` | Create (empty) | Placeholder — responsive added in Phase 5 |
| `package.json` (root) | Modify | Add `dev:webchat`, `build:webchat` scripts |
| `src/gateway/server.ts` | Modify | Add `/widget.js` route |
| `Dockerfile` | Modify | Add webchat build + copy dist |

> **Note:** The global CORS middleware in `src/gateway/server.ts` (line 26-35) already applies `origin: '*'` to all routes, including `/api/v1/webchat/*`. No additional CORS configuration is needed for Phase 4.

#### Technical Details

**Entry point** (`src/main.ts`) — Self-executing IIFE:
1. Read `data-butler-key` from own `<script>` tag via `document.currentScript` (stored for Phase 6 config fetch, unused until then)
2. Derive gateway origin from script `src` attribute (e.g., `https://hotel-butler.com/widget.js` → `https://hotel-butler.com`)
3. Create `ButlerChatWidget`, call `init()`
4. Find all `[data-butler-chat]` elements, attach click handlers (see CTA detection below)
5. Expose as `window.ButlerChat`

**Shadow DOM setup** — In `widget.ts`:
- Append `<div id="butler-chat-root">` to `document.body` with `position: fixed`, max z-index
- Create shadow root (`mode: 'open'`)
- Inject concatenated styles from stub `*.css.ts` files as single `<style>` (basic layout — polished styles replace these in Phase 5)
- Render stub panel container inside shadow root (functional but plain)
- Toggle: instant `display: flex` / `display: none` (slide animation replaces this in Phase 5)

**CTA detection and default styling:**
- `querySelectorAll('[data-butler-chat]')` → attach click → `widget.toggle()`
- Attribute-based preset detection (no computed style sniffing — explicit and reliable):
  - `data-butler-chat` or `data-butler-chat="bubble"` → add `butler-chat-trigger` class (default floating bubble)
  - `data-butler-chat="custom"` → no default styles applied, hotel provides all styling
- Inject `<style id="butler-chat-cta-styles">` in document head for default floating bubble (circle, primary color, bottom-right fixed, inline SVG chat icon)
- Hotels using the default preset can override with normal CSS specificity, or use `"custom"` to opt out entirely

**Gateway serving** — Add before SPA fallback in `src/gateway/server.ts`:
```typescript
app.get('/widget.js', async (c) => {
  const content = await fs.readFile('./widget/widget.js', 'utf-8');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(content, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
});
```

Widget dist served from `./widget/widget.js` (parallel to `./dashboard/`).

**CORS** — The global CORS middleware in `src/gateway/server.ts` already applies `origin: '*'` to all routes. No additional CORS middleware needed for webchat. Phase 8 tightens this to the configured domain allowlist.

**Docker integration** — Build stage adds webchat package copy and build, production stage copies `apps/webchat/dist` to `./widget`.

#### How to Test Phase 4

```
1. pnpm install → workspace registered
2. pnpm build:webchat → apps/webchat/dist/widget.js exists
3. pnpm typecheck → no errors
4. pnpm test → existing tests pass
5. pnpm dev + pnpm dev:webchat → dev harness works with hot reload
6. Copy dist to ./widget/ → curl localhost:3000/widget.js returns bundle
7. External HTML with <script src="http://localhost:3000/widget.js">
   + <button data-butler-chat> → floating bubble appears → click opens chat panel
8. Send message → guest message right-aligned, AI response left-aligned (basic styling)
9. Trigger action → form renders inline (native form elements, functional)
10. Shadow DOM isolation → no CSS conflicts with host page
11. Bundle < 50KB gzipped
12. docker build succeeds, container serves /widget.js
```

Note: The widget is functional but minimally styled at this point — basic layout, plain borders, no animations. Visual polish is added in Phase 5.

---

### Phase 5: Widget UI & Theming

**Goal:** Upgrade Phase 4's functional stubs into a production-quality chat interface — polished message bubbles, styled chat header, refined input area, mobile responsive layout, open/close slide animation, animated typing indicator, and a CSS custom property theming system for Phase 6 configuration.

#### What's Built

1. Chat panel layout upgrade: refined spacing, `max-height` constraints, box shadow, border radius
2. Chat header upgrade: logo image support (or name fallback), styled title, animated close button
3. Message bubbles upgrade: 4 polished variants (guest/ai/staff/system) with distinct colors, rounded corners, sender labels
4. Message list upgrade: smooth auto-scroll on new messages, scroll-to-bottom affordance
5. Input bar upgrade: pill-shaped input + styled send button, focus rings, disabled state styling, auto-focus on panel open
6. Action forms upgrade: styled form elements replacing native inputs, spinner loading state, improved validation feedback
7. Open/close panel animation: `translateY(100%) → translateY(0)` slide with cubic bezier easing (replaces Phase 4's instant toggle)
8. Mobile responsive: full screen below 640px with safe area insets (new — Phase 4 stubs have no responsive handling)
9. Typing indicator upgrade: three-dot bounce animation (replaces Phase 4's static "..." text), 30s timeout failsafe
10. CSS custom property theming system for Phase 6 configuration override

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `apps/webchat/src/components/chat-panel.ts` | Replace | Polished panel with refined spacing and layout |
| `apps/webchat/src/components/chat-header.ts` | Replace | Logo image support, styled close button |
| `apps/webchat/src/components/message-list.ts` | Replace | Smooth auto-scroll, scroll-to-bottom affordance |
| `apps/webchat/src/components/message-bubble.ts` | Replace | Polished 4-variant bubbles with colors and labels |
| `apps/webchat/src/components/input-bar.ts` | Replace | Pill-shaped input, styled send button, focus states |
| `apps/webchat/src/components/action-form.ts` | Replace | Styled form elements, spinner loading state |
| `apps/webchat/src/components/typing-indicator.ts` | Replace | Three-dot bounce animation |
| `apps/webchat/src/styles/theme.ts` | Modify | Expand CSS custom properties for full theming |
| `apps/webchat/src/styles/base.ts` | Modify | Refined shadow DOM reset |
| `apps/webchat/src/styles/panel.css.ts` | Replace | Polished panel: border radius, shadow, transitions |
| `apps/webchat/src/styles/header.css.ts` | Replace | Styled header with gradient, logo sizing |
| `apps/webchat/src/styles/messages.css.ts` | Replace | Polished bubble styles, colors, rounded corners |
| `apps/webchat/src/styles/input.css.ts` | Replace | Pill input, styled button, focus rings |
| `apps/webchat/src/styles/forms.css.ts` | Replace | Custom form elements, validation states |
| `apps/webchat/src/styles/animations.css.ts` | Replace | Slide animation, typing dot bounce, transitions |
| `apps/webchat/src/styles/responsive.css.ts` | Replace | Full-screen mobile with safe area insets |

#### Technical Details

**Chat panel layout** — Panel container: flex column with header, scrollable message area, typing indicator, and input bar. Desktop: 380×600px, fixed bottom-right, 16px margin, 16px radius, box shadow. `max-height: calc(100vh - 32px)`.

**Message bubbles** — 4 variants:

| Type | Align | Background | Detail |
|------|-------|------------|--------|
| guest | right | primary color | sharp bottom-right corner |
| ai | left | white + border | "AI" label, sharp bottom-left |
| staff | left | warm yellow | "Staff" label |
| system | center | transparent | italic, small |

Content via `textContent` (not `innerHTML`) to prevent XSS.

**Input bar** — Pill-shaped input + send button. Enter to send, disabled when disconnected, auto-focus on open.

**Action forms** — Styled upgrade of Phase 4 stub forms. Inline in message list. Conditional field visibility (`showWhen`), styled validation feedback, spinner loading state. Replaces native form elements with custom-styled inputs.

**Open/close animation:**
- `translateY(100%) → translateY(0)`, `cubic-bezier(0.16, 1, 0.3, 1)`, 300ms
- Open: `display: flex` → next frame add `.open` class
- Close: remove `.open` → on `transitionend` set `display: none`

**Mobile responsive:**
- `@media (max-width: 639px)` → full screen (`100vw × 100dvh`), no radius, no shadow
- `env(safe-area-inset-bottom)` for notched devices

**Typing indicator** — Three dots, staggered bounce animation:
- Show when guest sends a message
- Hide when AI response arrives
- 30s timeout failsafe

**Theming system** — All components use CSS custom properties from `theme.ts`:
```css
:host {
  --butler-color-primary: #0084ff;
  --butler-bg-panel: #ffffff;
  --butler-bg-header: #1a1a2e;
  --butler-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --butler-radius-panel: 16px;
  --butler-radius-bubble: 12px;
  --butler-z-index: 2147483647;
  --butler-panel-width: 380px;
  --butler-panel-height: 600px;
}
```

Phase 6 will override these via config endpoint. CSS custom properties inherit into shadow DOM when set on the host element.

#### How to Test Phase 5

```
1. Build → open dev harness → panel slides up smoothly on CTA click
2. Send message → guest bubble right-aligned, AI bubble left-aligned
3. Staff replies from dashboard → yellow staff bubble appears
4. Action triggered → styled form appears inline in message list
5. Mobile viewport (< 640px) → panel goes full screen
6. Load page with Bootstrap/Tailwind → no CSS conflicts (shadow DOM isolation)
7. Bundle size still < 50KB gzipped
8. Test Chrome, Safari, Firefox, mobile Safari
```

### Phase 6: Dashboard Configuration ✅

**Goal:** Admins configure, preview, and deploy the widget entirely from the dashboard.

**Status:** Complete

#### What's Built

1. **Config schema** — 8 fields on manifest: theme (light/dark select), primary color (color picker), header background (color picker), button icon (visual card selector with 4 SVG options), bot name, logo URL, welcome message, allowed domains
2. **Widget key** — auto-generated `wc_xxx` on first save via `PUT /api/v1/apps/channel-webchat`, persists across saves
3. **Public config endpoint** — `GET /api/v1/webchat/config?key=wc_xxx` returns theme + appearance settings (no auth); 503 if disabled; 403 on key mismatch; defaults if no config
4. **Dark/light theme** — `theme` select swaps all surface, text, border, and shadow CSS variables; primary color and header background apply on top of either theme
5. **Color derivation** — Two admin-set colors drive the entire palette: primary color derives hover, light, and guest bubble colors; header background derives messages area background at 4% opacity
6. **Contrast-aware text** — `contrastText()` utility computes luminance (ITU-R BT.709) and returns white or dark text for guest bubbles and CTA icon based on primary color brightness
7. **Button icon picker** — 4 options (chat bubble, bell, message dots, headset) rendered as square SVG cards in dashboard; selected icon applied to CTA `::after` pseudo-element
8. **Welcome message** — server sends as first AI message on new sessions, persisted in conversation, visible in history on reconnect
9. **Embed code section** — dashboard shows copy-pasteable `<script>` + CTA snippet with widget key + gateway URL (handles Vite dev port vs production)
10. **Action toggles** — `getEnabledActions()` filters actions across 3 sync points (widget list, AI hints, execution guard); auto-includes `verify-reservation` when any `requiresVerification` action is enabled
11. **Activation gate** — disabled webchat rejects WS connections with "unavailable"; config endpoint returns 503; server restart respects enabled flag
12. **CORS fix** — `crossOriginResourcePolicy: false` in security middleware so widget.js loads cross-origin
13. **Color picker** — added `'color'` to `ConfigFieldType`; dashboard renders native `<input type="color">` + hex text input combo
14. **Typing dots** — follow primary color via `var(--butler-color-primary)`
15. **Form styles** — all hardcoded hex colors replaced with CSS variables for theme compatibility

#### Files Modified

| File | Purpose |
|------|---------|
| `src/apps/channels/webchat/index.ts` | 8-field configSchema, activation gate, welcome message, async buildChannelActions |
| `src/apps/types.ts` | Added `'color'` to ConfigFieldType |
| `src/gateway/routes/apps.ts` | Widget key auto-gen (`wc_` + randomBytes) in PUT handler |
| `src/gateway/routes/webchat.ts` | `GET /config` public endpoint, `GET /actions` uses getEnabledActions |
| `src/gateway/middleware/security.ts` | crossOriginResourcePolicy: false |
| `src/services/webchat-action.ts` | getEnabledActions(), isActionEnabled(), execution guard |
| `src/index.ts` | Webchat auto-activation respects enabled flag |
| `apps/webchat/src/types.ts` | WidgetRemoteConfig (theme, buttonIcon), ButtonIcon type |
| `apps/webchat/src/utils.ts` | darkenHex(), hexToRgba(), contrastText() |
| `apps/webchat/src/widget.ts` | fetchAndApplyConfig(), applyRemoteConfig() with dark theme + color derivation |
| `apps/webchat/src/main.ts` | ICON_SVGS map, contrastText for CTA icon, buttonIcon/primaryColor usage |
| `apps/webchat/src/components/chat-header.ts` | setTitle(), setLogo(), SVG chat icon |
| `apps/webchat/src/styles/animations.css.ts` | Typing dots use --butler-color-primary |
| `apps/webchat/src/styles/messages.css.ts` | Scroll button collapses when hidden, hover uses variable |
| `apps/webchat/src/styles/forms.css.ts` | All colors via CSS variables (theme-compatible) |
| `apps/dashboard/src/pages/engine/apps/AppEdit.tsx` | Icon card selector, color picker, EmbedCode component |

### Phase 7: Feature Expansion

**Goal:** Rich chat experience — each feature is independent and can be implemented in any order.

| # | Feature | Status |
|---|---------|--------|
| 7A | Quick Reply Buttons | Pending |
| 7B | New Service Actions | Pending |
| 7C | Pre-Chat Form | Future |
| 7D | Offline / Away Mode | Pending |
| 7E | Conversation Persistence | Pending |
| 7F | Rich Responses (Cards & Images) | Future |
| 7G | Read Receipts | Future |

---

#### 7A: Quick Reply Buttons

AI includes 2-4 clickable pill buttons below its message. Guest clicks one → sends that text as their message. Buttons disable after selection.

**Server changes:**

1. **`src/ai/responder.ts`** — Add `QUICK_REPLY_RE` regex after `ACTION_TAG_RE` (line 59). Extract `[QUICK_REPLIES:opt1|opt2|opt3]` from AI output the same way `[ACTION:xxx]` is extracted (lines 204-212). Include `quickReplies: string[]` in returned metadata (line 241-253). Add instructions to system prompt after channel actions block (line 423):
   ```
   QUICK REPLIES: When it would help the guest to offer 2-4 clickable options,
   end your response with [QUICK_REPLIES:option1|option2|option3].
   Only use when options are genuinely useful. Do NOT use for open-ended questions.
   ```

2. **`src/apps/channels/webchat/index.ts`** — In `handleGuestMessage()` (lines 390-399), extract `response.metadata?.quickReplies` and include in the WS message object sent to the guest.

**Widget changes:**

3. **`apps/webchat/src/types.ts`** — Add `quickReplies?: string[]` to `ChatMessage` interface.

4. **`apps/webchat/src/components/message-bubble.ts`** — Extend `createMessageBubble()` to accept optional `quickReplies: string[]` and `onQuickReply: (text: string) => void`. After the text element, render a flex-wrap container of pill buttons. On click: call `onQuickReply(text)`, disable all buttons, highlight selected.

5. **`apps/webchat/src/components/message-list.ts`** — Update `addMessage()` signature to accept optional `quickReplies` and `onQuickReply` callback, forward to `createMessageBubble()`.

6. **`apps/webchat/src/widget.ts`** — In `onMessage` (line 137-138), when AI message has `msg.quickReplies`, pass them and `(text) => this.handleSend(text)` to `addMessage()`.

7. **`apps/webchat/src/styles/messages.css.ts`** — Add styles for `.butler-quick-replies` (flex-wrap, gap) and `.butler-quick-reply` (pill buttons: primary color border, hover fills, `:disabled` faded, `--selected` filled).

---

#### 7B: New Service Actions

Add 3 new actions to the registry. Same pattern as `extend-stay`. No widget changes — widget fetches action definitions dynamically from `GET /api/v1/webchat/actions`.

**File:** `src/services/webchat-action.ts`

1. **Add 3 action definitions** to the `actions` array (after line 129):

   - **`request-service`** — Guest requests hotel services. Fields: `serviceType` (select: housekeeping, extra-towels, extra-pillows, amenities, maintenance, other), `details` (text, optional), `urgency` (select: normal, urgent). `requiresVerification: true`.

   - **`order-room-service`** — Guest orders food/drink. Fields: `items` (text, required — what they want), `specialInstructions` (text, optional). `requiresVerification: true`.

   - **`book-spa`** — Guest books a spa treatment. Fields: `treatment` (select: massage, facial, body-wrap, manicure-pedicure, other), `preferredDate` (date), `preferredTime` (select: morning, midday, afternoon, evening), `notes` (text, optional). `requiresVerification: true`.

2. **Add 3 handler methods** after `handleExtendStay()` — follow the same pattern: validate inputs, get session for reservationId, log the request, return a conversational success message. These are stubs (log + respond) — PMS integration is future.

3. **Add 3 cases** to the `execute()` switch statement (lines 229-238).

---

#### 7D: Offline / Away Mode

When WS can't connect after multiple retries, show a customizable away message and optional contact form in the widget.

**Server changes:**

1. **`src/apps/channels/webchat/index.ts`** — Add 2 fields to `configSchema`:
   - `offlineMessage` (text, placeholder: "We're currently unavailable. Please leave a message...")
   - `offlineFormEnabled` (select: off/on, default off)

2. **`src/gateway/routes/webchat.ts`** — Add `offlineMessage` and `offlineFormEnabled` to config defaults + response.

3. **`src/gateway/routes/webchat.ts`** — New `POST /api/v1/webchat/offline-message` endpoint (no session required). Accepts `{ name, email, message }`. Creates a conversation + inbound message for staff follow-up. Returns `{ success: true }`.

**Widget changes:**

4. **`apps/webchat/src/types.ts`** — Add `offlineMessage` and `offlineFormEnabled` to `WidgetRemoteConfig`.

5. **`apps/webchat/src/connection.ts`** — Add `reconnectAttempts` counter. Increment on each reconnect attempt, reset to 0 on successful connection. Add `onReconnectFailed` callback that fires when attempts exceed a threshold (e.g., 3).

6. **New file: `apps/webchat/src/components/offline-overlay.ts`** — Overlay shown over the message area. Contains: away message text, optional contact form (name, email, message + submit button). On submit: POST to `/api/v1/webchat/offline-message`, show thank-you message.

7. **`apps/webchat/src/widget.ts`** — In `onDisconnected`: if reconnect failures >= 3 and offline config exists, show offline overlay. In `onConnected`: remove overlay. In `fetchAndApplyConfig()`: if fetch fails with network error/503, flag as offline immediately.

8. **`apps/webchat/src/styles/messages.css.ts`** — Add `.butler-offline-overlay` styles (absolute positioned over messages area, centered content, semi-transparent background).

---

#### 7E: Conversation Persistence for Verified Guests

When a verified guest returns after session expiry and re-verifies, restore their previous webchat conversation history instead of starting blank.

**Server changes:**

1. **`src/services/conversation.ts`** — New method `findByGuestAndChannel(guestId, channelType)`. Query conversations table filtered by `guestId` + `channelType`, order by `updatedAt` desc, limit 1. Returns the most recent conversation or null.

2. **`src/services/webchat-action.ts`** — In `completeVerification()` (lines 572-580), after guest lookup and session verification, before broadcasting `session_update`:
   - Call `conversationService.findByGuestAndChannel(guest.id, 'webchat')`
   - If found and current session has no conversation yet (or has a different one), link session to the existing conversation via `webchatSessionService.linkConversation()`
   - After broadcasting `session_update`, also send `history` message with the restored conversation's messages

**Widget changes:**

3. **`apps/webchat/src/components/message-list.ts`** — Add `clear()` method that removes all child elements except the sentinel and scroll button.

4. **`apps/webchat/src/widget.ts`** — In `onHistory` callback (lines 117-131): if messages are already displayed (mid-session history from verification), call `clear()` first before rendering the restored history.

### Phase 8: Security Hardening

**Goal:** Production-ready security for a public-facing widget.

Rate limiting (verification attempts, message rate, connections per IP), data exposure rule enforcement in AI responses, domain allowlist enforcement, abuse prevention, cross-browser testing.

---

## Related Documents

- [AI Assistant Framework](./001-ai-assistant-framework.md) — Message processing pipeline
- [User & Role Management](./004-user-role-management.md) — Staff who handle escalated conversations
- [Auth Backend](./005-auth-backend.md) — Authentication system
