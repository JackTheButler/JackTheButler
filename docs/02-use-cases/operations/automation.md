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

### Timing Rules

Proactive messages follow these timing rules:

| Rule | Behavior |
|------|----------|
| Timezone | **Guest timezone** if known (from phone area code or profile), otherwise **hotel timezone** |
| Do-not-disturb hours | No proactive messages between 10 PM - 8 AM guest local time |
| Active conversation | Defer proactive message until 30 minutes after conversation ends |
| Recent interaction | Skip if guest messaged within last 2 hours (they're engaged) |

```typescript
interface ProactiveTimingConfig {
  useGuestTimezone: boolean;          // Default: true
  hotelTimezone: string;              // e.g., 'America/New_York'
  quietHoursStart: number;            // Default: 22 (10 PM)
  quietHoursEnd: number;              // Default: 8 (8 AM)
  deferAfterConversationMs: number;   // Default: 1800000 (30 min)
  skipIfRecentInteractionMs: number;  // Default: 7200000 (2 hours)
}

function shouldSendProactive(
  guest: Guest,
  conversation: Conversation | null,
  config: ProactiveTimingConfig
): { canSend: boolean; reason?: string; nextAttempt?: Date } {
  const guestTz = config.useGuestTimezone && guest.timezone
    ? guest.timezone
    : config.hotelTimezone;

  const guestLocalHour = getHourInTimezone(new Date(), guestTz);

  // Check quiet hours
  if (guestLocalHour >= config.quietHoursStart || guestLocalHour < config.quietHoursEnd) {
    const nextAllowed = getNextQuietHoursEnd(guestTz, config.quietHoursEnd);
    return { canSend: false, reason: 'quiet_hours', nextAttempt: nextAllowed };
  }

  // Check active conversation
  if (conversation?.state === 'active' || conversation?.state === 'escalated') {
    return { canSend: false, reason: 'active_conversation' };
  }

  // Check recently ended conversation
  if (conversation?.endedAt) {
    const msSinceEnd = Date.now() - conversation.endedAt.getTime();
    if (msSinceEnd < config.deferAfterConversationMs) {
      const nextAttempt = new Date(conversation.endedAt.getTime() + config.deferAfterConversationMs);
      return { canSend: false, reason: 'recent_conversation', nextAttempt };
    }
  }

  // Check recent interaction
  if (guest.lastInteractionAt) {
    const msSinceInteraction = Date.now() - guest.lastInteractionAt.getTime();
    if (msSinceInteraction < config.skipIfRecentInteractionMs) {
      return { canSend: false, reason: 'recent_interaction' };
    }
  }

  return { canSend: true };
}
```

### Suppression Rules

Notifications are suppressed when:
- Guest has opted out
- Active conversation in progress
- Service recovery flag active (requires staff approval)
- Guest marked as Do Not Disturb
- Previous notification within 4 hours (configurable)
- **Quiet hours** (10 PM - 8 AM guest local time)

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

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest responds "arriving now" at 11:55 PM | **Cancel no-show timer**, keep room, notify front desk of late arrival. If guest doesn't arrive by 1 AM, alert front desk again (don't auto-process). |
| Guest responds after midnight no-show processed | If room not resold: **reverse no-show**, reinstate reservation, apologize. If room resold: escalate to duty manager for relocation. |
| Late response with cancellation request | Process cancellation per policy (may still charge first night depending on policy timing). |
| Guest unreachable (wrong number, blocked, etc.) | After 2 failed delivery attempts, try **email fallback**. If no email, proceed with staff-only decisions. |
| Multiple rooms on reservation | Process no-show for **entire reservation** unless guest specifies partial arrival. |

```typescript
interface NoShowConfig {
  initialOutreachAfterMs: number;    // Default: 7200000 (2 hours after ETA)
  defaultETAHour: number;            // Default: 18 (6 PM if no ETA provided)
  secondOutreachAfterMs: number;     // Default: 14400000 (4 hours after first)
  alertFrontDeskHour: number;        // Default: 23 (11 PM)
  processNoShowHour: number;         // Default: 0 (midnight)
  lateArrivalGracePeriodMs: number;  // Default: 3600000 (1 hour after midnight)
}

async function handleLateResponse(
  reservation: Reservation,
  response: GuestResponse,
  noShowStatus: NoShowStatus
): Promise<NoShowAction> {
  // Guest says they're coming
  if (response.intent === 'arriving' || response.intent === 'delayed') {
    // If no-show already processed
    if (noShowStatus.processed) {
      const room = await getRoomStatus(reservation.roomNumber);

      if (room.status === 'vacant' || room.assignedTo === reservation.id) {
        // Room still available - reverse no-show
        await reverseNoShow(reservation);
        await notifyGuest(reservation.guestId,
          "I've reinstated your reservation. We'll have your room ready!");
        return { action: 'reversed', requiresStaffAction: true };
      } else {
        // Room resold - escalate
        await escalateToDutyManager(reservation, 'no_show_late_arrival_room_resold');
        return { action: 'escalated', requiresStaffAction: true };
      }
    }

    // No-show not yet processed - cancel timer
    await cancelNoShowTimer(reservation.id);
    await updateReservation(reservation.id, {
      estimatedArrival: response.estimatedArrival || 'late',
      notes: `Guest confirmed late arrival at ${new Date().toISOString()}`
    });
    await notifyFrontDesk(reservation, 'late_arrival_confirmed');
    return { action: 'cancelled', requiresStaffAction: false };
  }

  // Guest wants to cancel
  if (response.intent === 'cancel') {
    return await processCancellation(reservation, noShowStatus);
  }

  return { action: 'unknown', requiresStaffAction: true };
}
```

### Who Posts the No-Show Charge?

| Scenario | Actor | Action |
|----------|-------|--------|
| Auto-processed at midnight | **System (Jack)** | Posts charge to PMS if `autoChargeNoShow: true` in config |
| Staff clicks "Process No-Show" | **Staff** | System posts charge on staff's behalf, staff ID logged |
| Staff clicks "Hold Until Morning" | **None yet** | No charge until staff decision next day |
| Guest has deposit pre-auth | **System** | Captures pre-auth amount |
| No payment method on file | **Alerts front desk** | Staff must decide (waive or collection) |

```yaml
noShow:
  autoChargeNoShow: false           # Default: false (require staff decision)
  chargeAmount: first_night         # Options: first_night, full_stay, custom
  notifyGuestOfCharge: true         # Send charge notification to guest
  requireStaffApproval: true        # Staff must click button (recommended)
```

### Room Release Timing

| Event | Room Status |
|-------|-------------|
| Midnight (no-show processed) | Marked as **releasable** (available for walk-ins) |
| 6 AM next day | Room officially **released** to inventory |
| Guest contacts after release | Check availability, may need alternate room |

The delay between "releasable" and "released" allows for:
1. Very late arrivals (flight delays, etc.)
2. Staff override before housekeeping reassigns
3. Coordination with walk-in guests

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
