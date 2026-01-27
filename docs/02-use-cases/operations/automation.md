# Use Case: Automation

Scheduled and event-triggered workflows.

---

## Proactive Notifications

### Summary

| Attribute | Value |
|-----------|-------|
| ID | O-01 |
| Actor | System |
| Channels | WhatsApp, SMS, Email |
| Priority | P1 |

### Description

Jack sends automated messages at key moments in the guest journey without requiring staff action.

### Notification Schedule

| Timing | Notification | Channel |
|--------|--------------|---------|
| 3 days before arrival | Welcome + pre-arrival info | WhatsApp/SMS |
| 1 day before arrival | Arrival reminder + offers | WhatsApp/SMS |
| Check-in day AM | Room status (if ready early) | WhatsApp/SMS |
| 2 hours post check-in | Settling in check | WhatsApp/SMS |
| Day before checkout | Checkout reminder | WhatsApp/SMS |
| Checkout day AM | Departure info + late checkout offer | WhatsApp/SMS |
| 24 hours post-checkout | Thank you + feedback | WhatsApp/Email |
| 7 days post-checkout | Review request (if positive feedback) | Email |

### Configuration

Properties can customize:
- Which notifications are active
- Timing adjustments
- Channel preferences
- Message templates
- Opt-out handling

### Example: Settling In Check

**Trigger**: 2 hours after check-in timestamp

```
Jack: Hi Sarah! I hope you're settling into room 412.

      Quick reminder of what's available:
      • Room service until 11 PM (menu: [link])
      • Fitness center 24/7 (2nd floor)
      • Bar & lounge open until midnight

      Is there anything I can help you with this evening?
```

### Suppression Rules

Notifications are suppressed when:
- Guest has opted out
- Active conversation in progress
- Service recovery flag active (requires staff approval)
- Guest marked as Do Not Disturb
- Previous notification within 4 hours (configurable)

---

## Review Monitoring {#reviews}

### Summary

| Attribute | Value |
|-----------|-------|
| ID | O-02 |
| Actor | System |
| Interface | Dashboard alerts |
| Priority | P2 |

### Description

Jack monitors online reviews and alerts staff to new reviews, with AI-drafted responses for approval.

### Monitored Platforms

- Google Reviews
- TripAdvisor
- Booking.com
- Expedia
- Yelp

### Alert Flow

```
[New review detected]
        │
        ▼
┌───────────────────┐
│ Sentiment analysis│
│ + guest matching  │
└────────┬──────────┘
        │
        ├── Positive (4-5 stars) ──→ Draft thank-you response
        │
        ├── Neutral (3 stars) ──→ Draft response + flag for review
        │
        └── Negative (1-2 stars) ──→ Alert management + draft response
                                    + link to guest history
```

### Dashboard Alert

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔔 NEW REVIEW: TripAdvisor ⭐⭐ (2/5)                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ "Disappointing stay. Room wasn't ready on time and the noise        │
│ from the street made it impossible to sleep."                       │
│                                                                     │
│ Posted by: SarahC_Chicago | Mar 20, 2024                            │
│                                                                     │
│ 🔗 LIKELY GUEST MATCH                                               │
│ Sarah Chen - Stayed Mar 15-18, Room 412 → 612                       │
│ Known issue: Noise complaint (service recovery completed)           │
│                                                                     │
│ 📝 SUGGESTED RESPONSE                                               │
│ ─────────────────────                                               │
│ "Dear Sarah, thank you for taking the time to share your            │
│ feedback. We sincerely apologize that your stay didn't meet         │
│ your expectations. We understand you experienced issues with        │
│ room readiness and noise, and we appreciate you bringing this       │
│ to our attention during your stay so we could address it.           │
│ We have since [action taken]. We would welcome the opportunity      │
│ to provide you with a better experience and invite you to           │
│ contact our GM directly at [email]. - The Grand Hotel Team"         │
│                                                                     │
│ [Post Response] [Edit] [Assign to GM] [Dismiss]                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## No-Show Handling {#no-show}

### Summary

| Attribute | Value |
|-----------|-------|
| ID | O-04 |
| Actor | System |
| Priority | P2 |

### Description

Jack attempts to contact guests who haven't arrived by expected time, then processes no-shows per hotel policy.

### Flow

```
[Expected arrival time + 2 hours, guest not checked in]
        │
        ▼
┌───────────────────┐
│ Send inquiry      │
│ "Still planning   │
│ to arrive?"       │
└────────┬──────────┘
        │
        ├── Guest responds "Yes" ──→ Note estimated arrival
        │
        ├── Guest responds "Cancel" ──→ Process cancellation
        │
        └── No response (4 hours) ──→ Second attempt
                │
                └── No response (by 11 PM) ──→ Alert front desk
                        │
                        └── Midnight ──→ Process as no-show per policy
```

### Initial Outreach

**Trigger**: 2 hours past expected arrival (or 6 PM if no ETA)

```
Jack: Hi! This is Jack from The Grand Hotel.

      We have your reservation for tonight but haven't seen
      you yet. Are you still planning to arrive?

      If your plans have changed, just let me know and I
      can help with modifications.
```

### No Response Escalation

**Trigger**: 11 PM, no check-in, no response

```
Staff Alert:

┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ POTENTIAL NO-SHOW                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Reservation: Michael Torres                                         │
│ Room: 308 (Deluxe King)                                             │
│ Dates: Mar 17-19                                                    │
│ Rate: $189/night | Guarantee: Credit card                           │
│                                                                     │
│ Contact attempts:                                                   │
│ • 6:00 PM - SMS sent, no response                                   │
│ • 8:00 PM - Second SMS sent, no response                            │
│ • Phone call attempted - voicemail                                  │
│                                                                     │
│ Policy: Charge first night at midnight, release room                │
│                                                                     │
│ [Process No-Show] [Hold Until Morning] [Keep Trying]                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Inventory Alerts

### Summary

| Attribute | Value |
|-----------|-------|
| ID | O-05 |
| Actor | System |
| Interface | Staff alerts |
| Priority | P3 |

### Description

Jack monitors task patterns and alerts staff to potential inventory or capacity issues.

### Alert Types

| Alert | Trigger | Action |
|-------|---------|--------|
| High demand item | 3+ requests for same item in 2 hours | Alert housekeeping supervisor |
| Out of stock | Item marked unavailable 2+ times | Alert operations manager |
| Maintenance pattern | Same room issue reported 2+ times | Alert maintenance supervisor |
| Capacity warning | Department task queue > threshold | Alert duty manager |

### Example Alert

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📊 INVENTORY ALERT                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ITEM: Rollaway beds                                                 │
│ STATUS: High demand                                                 │
│                                                                     │
│ 4 requests in the last 3 hours:                                     │
│ • Room 308 - Delivered                                              │
│ • Room 412 - Delivered                                              │
│ • Room 515 - Delivered                                              │
│ • Room 602 - WAITING (all units in use)                             │
│                                                                     │
│ Current inventory: 4 units, all deployed                            │
│ Next available: Tomorrow 11 AM (Room 308 checkout)                  │
│                                                                     │
│ Suggested action: Notify Room 602 of wait time                      │
│                                                                     │
│ [Notify Guest] [View All Inventory]                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

### Proactive Notifications
- [ ] Notifications sent at configured times
- [ ] Opt-out preferences honored
- [ ] Suppression rules enforced
- [ ] Delivery confirmation tracked
- [ ] Failed deliveries re-attempted or escalated

### Review Monitoring
- [ ] Reviews detected within 1 hour of posting
- [ ] Guest matching attempted for all reviews
- [ ] Response drafts generated automatically
- [ ] Negative reviews alert management immediately
- [ ] Posted responses tracked

### No-Show Handling
- [ ] Outreach begins at configured time
- [ ] Multiple contact attempts made
- [ ] Staff alerted before policy action
- [ ] Policy actions logged for audit
- [ ] Guest communication maintained throughout

---

## Related

- [Guest: Pre-Arrival](../guest/pre-arrival.md) - Proactive messaging
- [Guest: Post-Stay](../guest/post-stay.md) - Follow-up automation
- [Architecture: Automation Engine](../../03-architecture/c4-components/gateway.md)
