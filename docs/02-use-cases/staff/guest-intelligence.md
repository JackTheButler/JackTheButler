# Use Case: Guest Intelligence

Staff access to guest profiles, preferences, and insights.

---

## Summary

| Attribute | Value |
|-----------|-------|
| ID | S-03 |
| Actor | All staff |
| Interface | Dashboard, Mobile App |
| Priority | P1 |

---

## Description

Staff can look up any guest to view their profile, preferences, stay history, and current context. This enables personalized service even when staff haven't interacted with the guest before.

---

## User Stories

- As front desk staff, I want to see guest preferences at check-in
- As a server, I want to know dietary restrictions before taking an order
- As a manager, I want to understand a guest's history when handling a complaint
- As concierge, I want to make recommendations based on past interests

---

## Guest Profile View

```
┌─────────────────────────────────────────────────────────────────────┐
│ GUEST PROFILE                                     [Edit] [History]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Sarah Chen                                              GOLD MEMBER │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                     │
│ CURRENT STAY                                                        │
│ ─────────────                                                       │
│ Room: 612 (moved from 412 - noise complaint)                        │
│ Dates: Mar 15-18, 2024 (Night 3 of 3)                               │
│ Rate: $189/night | Booked via: Direct                               │
│ Purpose: Business                                                   │
│                                                                     │
│ ⚠️ SERVICE RECOVERY IN PROGRESS                                     │
│ Noise issue on night 1. Moved rooms + 1 night comped.               │
│ GM follow-up scheduled tomorrow.                                    │
│                                                                     │
│ PREFERENCES                                                         │
│ ───────────                                                         │
│ Room:        High floor, away from elevator, firm pillows           │
│ Dining:      Vegetarian, no mushrooms                               │
│ Newspaper:   Wall Street Journal (morning delivery)                 │
│ Temperature: Likes room cool (68°F)                                 │
│ Communication: Prefers text over calls                              │
│                                                                     │
│ STAY HISTORY (4 stays)                                              │
│ ─────────────────────                                               │
│ Mar 2024    3 nights    Business    ⚠️ Current (recovery)           │
│ Nov 2023    2 nights    Business    ⭐⭐⭐⭐⭐ "Excellent service"    │
│ Aug 2023    4 nights    Leisure     ⭐⭐⭐⭐ "Room was great"        │
│ Mar 2023    2 nights    Business    No feedback                     │
│                                                                     │
│ LIFETIME VALUE                                                      │
│ ──────────────                                                      │
│ Total stays: 4 | Total revenue: $2,847 | Avg rating: 4.5            │
│                                                                     │
│ NOTES                                                               │
│ ─────                                                               │
│ "Tech executive, travels frequently for conferences.                │
│ Appreciates efficiency and quick problem resolution.                │
│ Mentioned interest in spa services but hasn't booked."              │
│                                                                     │
│ CONVERSATION SUMMARY                                                │
│ ────────────────────                                                │
│ Last 24 hours: Noise complaint escalated, room moved, comp issued   │
│ Sentiment: Currently frustrated, was satisfied before incident      │
│                                                                     │
│                                              [View Full History]    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Lookup (Mobile)

For quick staff reference without full profile:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Search: "412"                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Room 412 - VACANT (was Sarah Chen, moved to 612)                    │
│                                                                     │
│ Showing: Room 612 - Sarah Chen                                      │
│ ────────────────────────────────────────────────────────━───────────│
│                                                                     │
│ 🏆 Gold Member                                                      │
│ 📅 Night 3 of 3                                                     │
│ ⚠️ Service recovery - handle with care                              │
│                                                                     │
│ KEY PREFERENCES                                                     │
│ • Vegetarian, no mushrooms                                          │
│ • Prefers text communication                                        │
│ • Likes room cool                                                   │
│                                                                     │
│                                    [Full Profile] [Message Guest]   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contextual Intelligence

Jack surfaces relevant guest information at key moments:

### At Check-In

```
Front Desk Screen:

┌─────────────────────────────────────────────────────────────────────┐
│ ARRIVING: Sarah Chen                                    Room 412    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 💡 SUGGESTED TALKING POINTS                                         │
│                                                                     │
│ • "Welcome back, Ms. Chen!" (4th stay)                              │
│ • Gold member - offer lounge access                                 │
│ • Pre-arranged: Early check-in confirmed for noon                   │
│ • Preference: High floor assigned ✓                                 │
│                                                                     │
│ • Last feedback mentioned enjoying the spa - offer promotion?       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### At Restaurant

```
Server Tablet:

┌─────────────────────────────────────────────────────────────────────┐
│ Table 7: Room 612 charge                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Sarah Chen - Gold Member                                            │
│                                                                     │
│ 🍽️ DIETARY: Vegetarian, no mushrooms                                │
│                                                                     │
│ ⚠️ Guest had service issue earlier - extra attentive service        │
│    recommended                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Proactive Alerts

```
Housekeeping Supervisor Alert:

┌─────────────────────────────────────────────────────────────────────┐
│ 🔔 VIP ARRIVAL IN 2 HOURS                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Room 801: James Morrison (CEO, TechCorp)                            │
│ Arriving: 2:00 PM                                                   │
│                                                                     │
│ Special requirements:                                               │
│ • Fiji water only (6 bottles)                                       │
│ • Remove minibar alcohol                                            │
│ • Extra hangers (12)                                                │
│ • Desk must be clear                                                │
│                                                                     │
│ Room 801 status: Cleaning in progress                               │
│                                                                     │
│                                         [View Checklist] [Confirm]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Ask Jack (Staff Query)

Staff can ask Jack questions about guests in natural language:

```
Staff: "What does the guest in 612 like for breakfast?"

Jack: "Sarah Chen (Room 612) is vegetarian and avoids mushrooms.
      In past stays, she's ordered:
      • Avocado toast (2x)
      • Fruit plate (1x)
      • Oatmeal with berries (1x)

      She also receives the Wall Street Journal with breakfast.

      Note: She's currently in service recovery from a noise
      complaint, so extra attention is recommended."
```

```
Staff: "Has Mr. Torres in 308 stayed with us before?"

Jack: "No, Michael Torres (Room 308) is a first-time guest.

      He's here for 2 nights on a leisure trip. His only
      preference noted so far is a tee time request for
      tomorrow (pending concierge follow-up).

      This is a great opportunity to make a strong first
      impression!"
```

---

## Privacy Controls

### Data Access Levels

| Role | Access Level |
|------|--------------|
| Front Desk | Full profile, current stay |
| Housekeeping | Preferences, room status |
| F&B | Dietary only |
| Maintenance | Room number only |
| Management | Full profile + financials |

### Audit Trail

All profile views are logged:
- Who viewed
- When
- What was accessed
- From which device/location

---

## Acceptance Criteria

- [ ] Profile lookup by room, name, phone, or email
- [ ] Response time < 2 seconds
- [ ] Current stay alerts prominently displayed
- [ ] Service recovery flags visible to all relevant staff
- [ ] Dietary information available at F&B touchpoints
- [ ] Natural language queries supported
- [ ] Access logged for audit compliance
- [ ] Role-based data visibility enforced

---

## Related

- [Spec: Guest Memory](../../04-specs/features/guest-memory.md) - Technical specification
- [Task Management](task-management.md) - Using intelligence in conversations
- [Architecture: Data Model](../../03-architecture/data-model.md)
