# Use Case: Reporting & Analytics

Insights and metrics from Jack operations.

---

## Summary

| Attribute | Value |
|-----------|-------|
| ID | O-03 |
| Actor | Management |
| Interface | Dashboard |
| Priority | P2 |

---

## Description

Jack provides operational insights through dashboards and reports, helping management understand guest communication patterns, staff efficiency, and service quality.

---

## Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ JACK ANALYTICS                           Today | Week | Month | YTD │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ CONVERSATIONS                           RESPONSE METRICS            │
│ ────────────────                        ──────────────────          │
│ Total today: 127                        Avg first response: 18 sec  │
│ ████████████████░░░░ 78% AI resolved    AI resolution: 74%          │
│                                         Escalation rate: 26%        │
│ Peak hour: 3-4 PM (23 conversations)    CSAT: 4.6/5                 │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Conversation Volume (24h)                                       │ │
│ │     20│        ▄▄                                               │ │
│ │       │      ▄▄██▄▄                                             │ │
│ │     10│    ▄▄██████▄▄    ▄▄                                     │ │
│ │       │▄▄▄▄████████████▄▄██▄▄▄▄                                 │ │
│ │      0└─────────────────────────                                │ │
│ │        12AM    6AM    12PM    6PM                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ TOP REQUEST TYPES                       CHANNEL DISTRIBUTION        │
│ ──────────────────                      ────────────────────        │
│ 1. Information inquiry (34%)            WhatsApp: 52%               │
│ 2. Service request (28%)                SMS: 31%                    │
│ 3. Dining/room service (18%)            Web chat: 12%               │
│ 4. Concierge (12%)                      Email: 5%                   │
│ 5. Complaints (8%)                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Metrics

### Conversation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Total conversations | All guest interactions | — |
| AI resolution rate | % handled without human | > 70% |
| Escalation rate | % requiring human | < 30% |
| Avg response time | Time to first response | < 30 sec |
| Avg resolution time | Time to conversation close | < 5 min |

### Guest Satisfaction

| Metric | Description | Target |
|--------|-------------|--------|
| CSAT | Post-interaction rating | > 4.5/5 |
| Sentiment trend | AI-analyzed sentiment | Improving |
| Complaint rate | Complaints / total stays | < 5% |
| Resolution satisfaction | Satisfaction after complaint | > 80% |

### Operational Efficiency

| Metric | Description | Target |
|--------|-------------|--------|
| Task completion rate | Tasks completed / created | > 95% |
| Avg task completion time | Time from request to done | Varies by type |
| Staff response time | Time for human to respond | < 5 min |
| Proactive engagement | % guests who engage | > 40% |

---

## Reports

### Daily Operations Report

Generated automatically, delivered 6 AM.

```
┌─────────────────────────────────────────────────────────────────────┐
│ DAILY OPERATIONS REPORT                                             │
│ The Grand Hotel | March 17, 2024                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ SUMMARY                                                             │
│ ━━━━━━━                                                             │
│ Conversations: 127 (↑12% vs last week)                              │
│ AI resolved: 94 (74%)                                               │
│ Escalated: 33 (26%)                                                 │
│ Avg response: 18 seconds                                            │
│ CSAT: 4.6/5                                                         │
│                                                                     │
│ HIGHLIGHTS                                                          │
│ ━━━━━━━━━━                                                          │
│ ✓ Zero complaints unresolved                                        │
│ ✓ Room service orders up 15% (Jack upsell suggestions)              │
│ ⚠ 3 escalations waited >5 min for staff response                    │
│                                                                     │
│ SERVICE RECOVERY                                                    │
│ ━━━━━━━━━━━━━━━━                                                    │
│ • Room 412: Noise complaint - moved + 1 night comped                │
│   Status: Resolved, GM follow-up today                              │
│                                                                     │
│ TOP REQUESTS                                                        │
│ ━━━━━━━━━━━━                                                        │
│ 1. WiFi password (23)                                               │
│ 2. Extra towels (18)                                                │
│ 3. Restaurant hours (15)                                            │
│ 4. Late checkout (12)                                               │
│ 5. Room service orders (11)                                         │
│                                                                     │
│ STAFF PERFORMANCE                                                   │
│ ━━━━━━━━━━━━━━━━━                                                   │
│ Maria (Front Desk): 12 escalations, avg 3 min response, 4.8 CSAT    │
│ Carlos (Concierge): 8 escalations, avg 4 min response, 4.7 CSAT     │
│                                                                     │
│ ACTION ITEMS                                                        │
│ ━━━━━━━━━━━━                                                        │
│ • Review escalation response time (3 cases >5 min)                  │
│ • Update WiFi info in knowledge base (23 queries)                   │
│ • GM call to Sarah Chen re: noise complaint                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Weekly Trend Report

```
┌─────────────────────────────────────────────────────────────────────┐
│ WEEKLY TREND REPORT                                                 │
│ March 11-17, 2024                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ CONVERSATION TRENDS                                                 │
│ ━━━━━━━━━━━━━━━━━━━                                                 │
│                                                                     │
│        Mon   Tue   Wed   Thu   Fri   Sat   Sun                      │
│ Total   89   102   95    115   127   143   98                       │
│ AI %    76%  74%   75%   72%   74%   71%   78%                      │
│ CSAT   4.7   4.5   4.6   4.4   4.6   4.5   4.7                      │
│                                                                     │
│ Week over week: +8% volume, AI resolution stable                    │
│                                                                     │
│ EMERGING PATTERNS                                                   │
│ ━━━━━━━━━━━━━━━━━                                                   │
│ • Friday/Saturday: Higher escalation rate (29% vs 24% weekday)      │
│   → Consider additional staff coverage                              │
│                                                                     │
│ • "Quiet room" requests: 12 this week (↑ from 4 last week)          │
│   → Review room assignment algorithm                                │
│                                                                     │
│ • Pool hours inquiry: 34 requests                                   │
│   → Add to proactive welcome message                                │
│                                                                     │
│ KNOWLEDGE GAPS                                                      │
│ ━━━━━━━━━━━━━━━                                                     │
│ Queries Jack couldn't answer confidently:                           │
│ • "Is the restaurant kid-friendly?" (7 queries)                     │
│ • "Do you have EV charging?" (5 queries)                            │
│ • "Can I bring my emotional support animal?" (3 queries)            │
│                                                                     │
│ → Recommend updating knowledge base                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Monthly Executive Summary

High-level metrics for leadership.

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXECUTIVE SUMMARY                                                   │
│ March 2024                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ JACK IMPACT                                                         │
│ ━━━━━━━━━━━                                                         │
│                                                                     │
│ Guest Engagement                                                    │
│ • 3,412 conversations (↑18% MoM)                                    │
│ • 47% of guests engaged with Jack                                   │
│ • 4.6 avg CSAT rating                                               │
│                                                                     │
│ Operational Efficiency                                              │
│ • 2,523 requests handled by AI (74%)                                │
│ • Estimated staff hours saved: 168 hours                            │
│ • Equivalent value: $4,200                                          │
│                                                                     │
│ Revenue Attribution                                                 │
│ • Room service via Jack: $12,340 (↑22% vs non-Jack guests)          │
│ • Late checkout fees: $2,100                                        │
│ • Spa bookings via Jack: $3,800                                     │
│                                                                     │
│ Service Quality                                                     │
│ • Complaint resolution: 94% same-day                                │
│ • Online review score: 4.4 → 4.5 (TripAdvisor)                      │
│ • Repeat guest engagement: 62%                                      │
│                                                                     │
│ RECOMMENDATIONS                                                     │
│ ━━━━━━━━━━━━━━━                                                     │
│ 1. Expand Jack to phone channel (address 15% of inquiries)          │
│ 2. Add spa/restaurant booking integration                           │
│ 3. Implement predictive room preference matching                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Custom Reports

Management can request custom reports:

| Report Type | Parameters |
|-------------|------------|
| Channel analysis | Date range, channel filter |
| Request category deep-dive | Category, date range |
| Staff performance | Staff member, date range |
| Guest segment analysis | Loyalty tier, stay purpose |
| Comparison | Property A vs B (multi-property) |

---

## Data Export

Available export formats:
- PDF (formatted reports)
- CSV (raw data)
- API (integration with BI tools)

---

## Acceptance Criteria

- [ ] Dashboard loads in < 3 seconds
- [ ] Real-time metrics update every 60 seconds
- [ ] Daily report delivered by 6 AM
- [ ] Reports accurately reflect source data
- [ ] Custom date ranges supported
- [ ] Export functionality for all reports
- [ ] Role-based access to sensitive metrics

---

## Related

- [Staff: Task Management](../staff/task-management.md) - Source of efficiency data
- [Guest: Post-Stay](../guest/post-stay.md) - Source of CSAT data
- [Architecture: Data Model](../../03-architecture/data-model.md)
