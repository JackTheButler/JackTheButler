# Glossary

Common terminology used throughout Jack The Butler documentation.

---

## Terminology Standards

To ensure consistency across all documentation and code, use these preferred terms:

| Preferred Term | Avoid | Reasoning |
|----------------|-------|-----------|
| **Property** | Hotel, Resort, Venue | Generic term covering all accommodation types |
| **Guest** | Customer, User, Client | Hospitality-specific terminology |
| **Staff** | Employee, Agent, Worker | Clear distinction from AI agents |
| **Conversation** | Thread, Chat, Session | Single term for communication sessions |
| **Message** | Text, Chat message | Single unit of communication |
| **Butler / Jack** | Bot, AI, Assistant | Guest-facing, service-oriented |
| **Escalation** | Handoff, Transfer | Moving to human staff |
| **Resolution** | Completion, Closure | Successfully finishing a request |
| **Task** | Ticket, Request, Job | Unit of work for staff |
| **Channel** | Platform, Medium | Communication pathway |
| **App** | Extension, Integration, Connector | External-facing term for AI providers, channels, and PMS connectors |

---

## Core Concepts

### Jack
**J**oint **A**I **C**ontrol **K**ernel - The central orchestration layer that connects communication channels, hotel systems, and AI capabilities.

### Gateway
The WebSocket-based control plane that manages connections between channels, the AI engine, and hotel system integrations. The heart of Jack's architecture.

### Channel
A communication medium through which guests or staff interact with Jack. Examples: WhatsApp, SMS, web chat, voice, email.

### Channel Adapter
A component that translates between a specific channel's protocol/API and Jack's internal message format.

### Conversation
A communication session between a guest and Jack/staff. Contains multiple messages and has states (active, escalated, resolved, closed). **Preferred term** over "thread" or "chat."

### Message
A single unit of communication within a conversation. Can be text, image, audio, or document. Has direction (inbound/outbound) and sender.

---

## Guest Domain

### Guest Profile
The persistent record of a guest including identity, contact information, preferences, and interaction history.

### Preference
A learned or stated guest attribute that informs personalization. Examples: room temperature, pillow type, dietary restrictions.

### Stay
A single visit to a property, from check-in to check-out. A guest may have multiple stays over time.

### Reservation
A booking record in the PMS, associated with a future or current stay.

### Request
A guest ask that requires action. Classified by type (service, information, complaint, etc.) and urgency.

---

## Staff Domain

### Staff / Staff Member
A hotel employee who uses Jack's dashboard to handle guest requests. **Preferred term** over "agent" or "employee" to avoid confusion with AI agents.

### Role
A staff member's job function determining permissions and routing. Examples: front_desk, concierge, housekeeping, maintenance, manager, admin.

### Department
An organizational unit within the property. Examples: Front Office, Housekeeping, Maintenance, Food & Beverage, Concierge.

### Assignment
The routing of a task or conversation to a specific staff member or department.

### Escalation
The transfer of a conversation from autonomous AI handling to human staff involvement. **Preferred term** over "handoff."

### Transfer
Moving a conversation between staff members while preserving context. Different from escalation (AI to human).

### Queue
A prioritized list of conversations or tasks awaiting staff attention.

### Workload
A measure of a staff member's current capacity based on active conversations and tasks.

---

## Hotel Systems

### PMS (Property Management System)
The core hotel software managing reservations, room inventory, guest records, and billing. Examples: Opera, Mews, Cloudbeds.

### POS (Point of Sale)
Systems handling transactions for restaurants, bars, spa, and other hotel outlets.

### CRS (Central Reservation System)
System managing room inventory and rates across distribution channels.

### Housekeeping System
Software tracking room cleaning status, task assignments, and inventory.

### Maintenance System
Work order management for repairs and preventive maintenance.

---

## AI & Automation

### Intent
The classified purpose of a guest message. Examples: `request.service.towels`, `inquiry.amenity.pool`, `complaint.room.noise`.

### Entity
A specific piece of information extracted from a message. Examples: room number, date, quantity.

### Skill
A defined capability Jack can execute, potentially involving multiple steps and system integrations.

### Autonomy Level
A configurable setting that controls how much Jack can do without staff approval. Higher levels allow more autonomous actions.

### Review Center
The staff-facing queue where actions that exceed Jack's current autonomy level await approval or rejection before being executed.

### Knowledge Base
The stored collection of hotel-specific information (policies, FAQs, amenities, procedures) used by RAG to ground AI responses in accurate, property-specific content.

### Automation Rule
A configured trigger-action pair that executes without AI reasoning. Example: "If checkout tomorrow, send reminder at 8am."

### Confidence Score
A measure (0-1) of how certain Jack is about intent classification or response appropriateness.

### Escalation Threshold
The confidence level below which Jack routes to human staff rather than responding autonomously.

---

## Technical Terms

### Webhook
An HTTP callback that notifies Jack of events from external systems.

### Message Broker
The internal EventEmitter system that queues and routes messages between components.

### State Machine
The model tracking conversation state and valid transitions.

### RAG (Retrieval-Augmented Generation)
The technique of enhancing AI responses with retrieved hotel-specific knowledge (policies, FAQs, etc.).

### Embedding
A vector representation of text used for semantic search and similarity matching.

---

## Metrics

### TTFR (Time to First Response)
Duration from guest message receipt to Jack's first reply.

### Resolution Rate
Percentage of requests fully handled without human intervention.

### Escalation Rate
Percentage of conversations that require human agent involvement.

### CSAT (Customer Satisfaction)
Guest rating of their interaction with Jack.

### NPS (Net Promoter Score)
Likelihood of guest recommending the hotel, potentially influenced by Jack interactions.

---

## Abbreviations

| Abbreviation | Meaning |
|--------------|---------|
| ADR | Architecture Decision Record |
| AI | Artificial Intelligence |
| API | Application Programming Interface |
| CCPA | California Consumer Privacy Act |
| CORS | Cross-Origin Resource Sharing |
| CRM | Customer Relationship Management |
| CRUD | Create, Read, Update, Delete |
| CSP | Content Security Policy |
| DLQ | Dead Letter Queue |
| DST | Daylight Saving Time |
| ETA | Estimated Time of Arrival |
| FAQ | Frequently Asked Questions |
| GDPR | General Data Protection Regulation |
| HTTP | Hypertext Transfer Protocol |
| IANA | Internet Assigned Numbers Authority |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| LLM | Large Language Model |
| LRU | Least Recently Used |
| MFA | Multi-Factor Authentication |
| MJML | Mailjet Markup Language |
| MSW | Mock Service Worker |
| MVP | Minimum Viable Product |
| NLP | Natural Language Processing |
| NPS | Net Promoter Score |
| ORM | Object-Relational Mapping |
| OTA | Online Travel Agency |
| PCI | Payment Card Industry |
| PII | Personally Identifiable Information |
| PMS | Property Management System |
| POS | Point of Sale |
| RAG | Retrieval-Augmented Generation |
| REST | Representational State Transfer |
| SDK | Software Development Kit |
| SLA | Service Level Agreement |
| SMS | Short Message Service |
| SQL | Structured Query Language |
| SSE | Server-Sent Events |
| SSO | Single Sign-On |
| TLS | Transport Layer Security |
| TTS | Text-to-Speech |
| UI | User Interface |
| URL | Uniform Resource Locator |
| UTC | Coordinated Universal Time |
| UUID | Universally Unique Identifier |
| UX | User Experience |
| VIP | Very Important Person |
| WAL | Write-Ahead Logging |
| WS | WebSocket |

---

## Related

- [Overview](overview.md)
- [Architecture](../03-architecture/)
