# C4 Level 1: System Context

The system context diagram shows Jack The Butler and its relationships with users and external systems.

---

## Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              EXTERNAL ACTORS                                │
│                                                                             │
│    ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐         │
│    │  Guest  │      │  Staff  │      │ Manager │      │  Admin  │         │
│    └────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘         │
│         │                │                │                │               │
│         │ Messages       │ Dashboard      │ Reports        │ Config       │
│         │ Requests       │ Tasks          │ Analytics      │ Setup        │
│         │                │                │                │               │
└─────────┼────────────────┼────────────────┼────────────────┼───────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                           JACK THE BUTLER                                   │
│                                                                             │
│              AI-Powered Hospitality Assistant Platform                      │
│                                                                             │
│    • Receives and responds to guest messages across channels                │
│    • Handles routine requests autonomously                                  │
│    • Routes complex issues to appropriate staff                             │
│    • Integrates with hotel operational systems                              │
│    • Provides analytics and reporting                                       │
│                                                                             │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   MESSAGING     │   │  HOTEL SYSTEMS  │   │   AI SERVICES   │
│   PLATFORMS     │   │                 │   │                 │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • WhatsApp      │   │ • PMS (Opera,   │   │ • Anthropic     │
│ • SMS/Twilio    │   │   Mews, etc.)   │   │   (Claude)      │
│ • Email         │   │ • POS           │   │ • OpenAI (GPT)  │
│ • Web Chat      │   │ • Housekeeping  │   │ • Local models  │
│                 │   │ • Maintenance   │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## Actors

### Guest
Hotel guests who communicate with Jack before, during, and after their stay.

| Attribute | Description |
|-----------|-------------|
| Interaction | Asynchronous messaging |
| Channels | WhatsApp, SMS, Web Chat, Email |
| Goals | Quick answers, easy requests, personalized service |
| Volume | 50-500 conversations/day (varies by property) |

### Staff
Hotel employees who handle escalated conversations and fulfill service requests.

| Attribute | Description |
|-----------|-------------|
| Interaction | Dashboard and mobile app |
| Roles | Front desk, concierge, housekeeping, F&B, maintenance |
| Goals | Efficient task handling, guest context, response assistance |
| Volume | 5-50 active staff per property |

### Manager
Department heads and duty managers who oversee operations.

| Attribute | Description |
|-----------|-------------|
| Interaction | Dashboard |
| Focus | Escalations, service recovery, team performance |
| Goals | Service quality, staff efficiency, guest satisfaction |

### Admin
Technical administrators who configure and maintain Jack.

| Attribute | Description |
|-----------|-------------|
| Interaction | Configuration interface, CLI |
| Responsibilities | System setup, integrations, user management |
| Frequency | Occasional (setup and maintenance) |

---

## External Systems

### Messaging Platforms

| Platform | Integration Type | Purpose |
|----------|------------------|---------|
| WhatsApp Business | API | Primary guest messaging (international) |
| Twilio | API | SMS messaging (US/Canada focus) |
| Email (SMTP/IMAP) | Protocol | Formal communication, confirmations |
| Web Chat | Embedded widget | Website visitors |

### Hotel Systems

| System | Examples | Integration Purpose |
|--------|----------|---------------------|
| PMS | Opera, Mews, Cloudbeds, OPERA Cloud | Reservations, guest data, billing |
| POS | Micros, Toast, Square | Restaurant charges, orders |
| Housekeeping | Flexkeeping, Optii | Room status, task assignment |
| Maintenance | Flexkeeping, custom | Work orders |
| Door Locks | Assa Abloy, Salto | Mobile key (future) |

### AI Services

| Provider | Use Case | Notes |
|----------|----------|-------|
| Anthropic (Claude) | Primary AI | Response generation, intent classification |
| OpenAI (GPT) | Alternative | Backup provider |
| Local models | On-premise | Privacy-sensitive deployments |

---

## Data Flows

### Inbound (to Jack)

| Source | Data | Frequency |
|--------|------|-----------|
| Messaging platforms | Guest messages | Real-time |
| PMS | Reservations, guest profiles | Real-time sync |
| PMS | Room status | Periodic (5 min) |
| Staff interfaces | Responses, task updates | Real-time |

### Outbound (from Jack)

| Destination | Data | Frequency |
|-------------|------|-----------|
| Messaging platforms | Responses to guests | Real-time |
| PMS | Notes, preferences | Per interaction |
| Housekeeping | Tasks | Per request |
| Staff interfaces | Notifications, updates | Real-time |
| AI providers | Prompts | Per message |

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UNTRUSTED (Internet)                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                       │
│  │  Guests   │  │ Messaging │  │    AI     │                       │
│  │           │  │ Platforms │  │ Providers │                       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                       │
└────────┼──────────────┼──────────────┼──────────────────────────────┘
         │              │              │
═════════╪══════════════╪══════════════╪════════════════════════════════
         │              │              │         FIREWALL / API GATEWAY
═════════╪══════════════╪══════════════╪════════════════════════════════
         │              │              │
┌────────┼──────────────┼──────────────┼──────────────────────────────┐
│        ▼              ▼              ▼                              │
│  ┌─────────────────────────────────────────────┐                   │
│  │              JACK THE BUTLER                │   TRUSTED         │
│  │          (Hotel Infrastructure)             │   (Hotel Network) │
│  └─────────────────────┬───────────────────────┘                   │
│                        │                                            │
│                        ▼                                            │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   HOTEL SYSTEMS                                │ │
│  │    PMS          POS          Housekeeping       Maintenance    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Constraints

### Regulatory
- GDPR compliance for EU guests
- PCI-DSS for payment-adjacent data
- Local data residency requirements

### Technical
- Hotel network reliability varies
- PMS APIs often limited or legacy
- WhatsApp Business API rate limits

### Operational
- 24/7 availability required
- Multi-language support
- Graceful degradation without AI

---

## Related

- [C4 Containers](c4-containers.md) - Next level of detail
- [Vision: Overview](../01-vision/overview.md) - System purpose
- [Integration Specs](../04-specs/integrations/) - External system details
