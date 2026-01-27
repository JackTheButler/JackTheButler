# Guest Use Cases

Use cases for guest interactions with Jack The Butler across the entire guest journey.

---

## Guest Journey Map

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│  DREAMING   │ → │   BOOKING   │ → │  PRE-STAY   │ → │   ARRIVAL    │
│             │   │             │   │             │   │              │
│ (Out of     │   │ (Out of     │   │ • Requests  │   │ • Check-in   │
│  scope)     │   │  scope)     │   │ • Questions │   │ • Orientation│
└─────────────┘   └─────────────┘   └─────────────┘   └──────────────┘
                                           │                 │
                                           ▼                 ▼
┌─────────────┐   ┌─────────────┐    ┌─────────────────────────────────┐
│  ADVOCACY   │ ← │  POST-STAY  │  ← │           DURING STAY           │
│             │   │             │    │                                 │
│ (Reviews -  │   │ • Follow-up │    │ • Service requests              │
│  partial)   │   │ • Lost item │    │ • Information inquiries         │
│             │   │ • Feedback  │    │ • Issues & complaints           │
└─────────────┘   └─────────────┘    │ • Dining & room service         │
                                     │ • Concierge services            │
                                     │ • Check-out                     │
                                     └─────────────────────────────────┘
```

---

## Use Cases by Phase

### Pre-Arrival
Guest has a confirmed reservation and is preparing for their stay.

| ID | Use Case | Description |
|----|----------|-------------|
| G-01 | [Pre-arrival messaging](pre-arrival.md) | Initial contact, requests, questions before arrival |

### During Stay
Guest is checked in and on property.

| ID | Use Case | Description |
|----|----------|-------------|
| G-02 | [Check-in assistance](during-stay.md#check-in) | Arrival support and room readiness |
| G-03 | [Service requests](during-stay.md#service-requests) | Towels, amenities, housekeeping |
| G-04 | [Information inquiries](during-stay.md#information-inquiries) | WiFi, hours, amenities, policies |
| G-05 | [Issues & complaints](during-stay.md#issues-and-complaints) | Problems requiring resolution |
| G-06 | [Dining & room service](during-stay.md#dining) | Food orders and reservations |
| G-07 | [Concierge services](during-stay.md#concierge) | Recommendations and bookings |
| G-08 | [Check-out assistance](during-stay.md#check-out) | Departure support |

### Post-Stay
Guest has departed.

| ID | Use Case | Description |
|----|----------|-------------|
| G-09 | [Post-stay follow-up](post-stay.md) | Thank you, feedback collection |
| G-10 | [Lost & found](post-stay.md#lost-and-found) | Item recovery assistance |

---

## Channel Availability

| Use Case | WhatsApp | SMS | Web Chat | Email | Voice |
|----------|:--------:|:---:|:--------:|:-----:|:-----:|
| Pre-arrival | ✓ | ✓ | ✓ | ✓ | — |
| Check-in | ✓ | ✓ | ✓ | — | P2 |
| Service requests | ✓ | ✓ | ✓ | — | P2 |
| Information | ✓ | ✓ | ✓ | ✓ | P2 |
| Issues | ✓ | ✓ | ✓ | ✓ | P2 |
| Dining | ✓ | ✓ | ✓ | — | — |
| Concierge | ✓ | ✓ | ✓ | ✓ | P2 |
| Check-out | ✓ | ✓ | ✓ | ✓ | — |
| Post-stay | ✓ | ✓ | — | ✓ | — |
| Lost & found | ✓ | ✓ | ✓ | ✓ | — |

✓ = Supported | — = Not applicable | P2 = Future phase

---

## Common Patterns

### Guest Identification
All use cases begin with guest identification:
1. Channel provides phone/email identifier
2. Jack matches to guest profile or reservation
3. If no match, Jack asks for reservation details
4. Context loaded for personalized interaction

### Escalation Triggers
Conversations escalate to human agents when:
- Guest explicitly requests human assistance
- Confidence score below threshold
- Complaint severity is high
- Request requires judgment (compensation, exceptions)
- Three failed resolution attempts

### Response Principles
- Acknowledge the request immediately
- Set expectations for timing
- Confirm completion or next steps
- Follow up if action was delegated

---

## Related

- [Staff Use Cases](../staff/) - How staff interact with guest conversations
- [Architecture: Channel Adapters](../../03-architecture/c4-components/channel-adapters.md)
- [Spec: Guest Profile](../../04-specs/features/guest-memory.md)
