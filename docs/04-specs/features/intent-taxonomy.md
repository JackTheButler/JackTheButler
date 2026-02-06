# Intent Taxonomy

Classification categories for guest messages.

---

## Overview

Guest messages are classified into intents using LLM. Each intent has:
- **Description** — What this intent represents
- **Department** — Which department handles it (or null for inquiries)
- **Priority** — Default task priority
- **Requires Action** — Whether a task should be created

---

## Intent Categories

### Service Requests

Requests that create tasks.

| Intent | Department | Priority | Description |
|--------|------------|----------|-------------|
| `request.housekeeping.towels` | housekeeping | standard | Request for additional towels |
| `request.housekeeping.cleaning` | housekeeping | standard | Request for room cleaning |
| `request.housekeeping.amenities` | housekeeping | standard | Request for room amenities |
| `request.maintenance` | maintenance | high | Something broken or needs repair |
| `request.maintenance.wifi` | maintenance | high | WiFi or internet not working |
| `request.room_service` | room_service | standard | Food or beverage order |
| `request.concierge` | concierge | standard | Bookings, arrangements |
| `request.transport` | concierge | standard | Taxi, shuttle, airport transfer |
| `request.wakeup` | front_desk | standard | Wake-up call request |
| `request.luggage` | front_desk | standard | Luggage storage or delivery |
| `request.laundry` | housekeeping | standard | Laundry, dry cleaning |
| `request.dnd` | housekeeping | low | Do not disturb |
| `request.room_change` | front_desk | high | Request to change rooms |
| `request.lost_found` | front_desk | standard | Lost item report |
| `request.security` | front_desk | high | Security concern or lockout |
| `request.noise` | front_desk | high | Noise complaint |
| `request.special_occasion` | concierge | standard | Birthday, anniversary arrangements |
| `request.reservation.cancel` | front_desk | high | Cancel reservation |
| `request.reservation.modify` | front_desk | standard | Modify reservation |
| `request.checkout.late` | front_desk | standard | Late checkout request |
| `request.checkin.early` | front_desk | standard | Early check-in request |
| `request.billing.receipt` | front_desk | standard | Request for invoice/receipt |

### Inquiries

Questions answered by AI without creating tasks.

| Intent | Description |
|--------|-------------|
| `inquiry.checkout` | Checkout time or procedure |
| `inquiry.checkin` | Check-in time or procedure |
| `inquiry.wifi` | WiFi password or connection |
| `inquiry.amenity` | Hotel amenities (pool, gym, spa) |
| `inquiry.dining` | Dining options, breakfast hours |
| `inquiry.location` | Facility locations, nearby places |
| `inquiry.billing` | Charges, bills, payments |
| `inquiry.reservation.status` | Reservation details, confirmation |
| `inquiry.parking` | Parking options, valet, fees |
| `inquiry.accessibility` | Accessibility features |
| `inquiry.pet_policy` | Pet policies and fees |
| `inquiry.transport` | Transportation options |
| `inquiry.concierge` | Recommendations, suggestions |

### Feedback

| Intent | Department | Priority | Description |
|--------|------------|----------|-------------|
| `feedback.complaint` | front_desk | high | Negative feedback |
| `feedback.compliment` | — | low | Positive feedback |

### Conversation

| Intent | Description |
|--------|-------------|
| `greeting` | Hello, hi, good morning |
| `farewell` | Goodbye, thanks, bye |

### Emergency

| Intent | Department | Priority | Description |
|--------|------------|----------|-------------|
| `emergency` | front_desk | urgent | Fire, medical, immediate help |

### Unknown

| Intent | Description |
|--------|-------------|
| `unknown` | Unable to classify |

---

## Classification Result

```typescript
interface ClassificationResult {
  intent: string;
  confidence: number;      // 0.0 to 1.0
  department: string | null;
  requiresAction: boolean;
  reasoning?: string;
}
```

---

## Confidence Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Task creation | ≥ 0.6 | Create task if `requiresAction` |
| Auto-approval | ≥ 0.7 | Allow auto-execute (per autonomy settings) |
| Urgent flag | < 0.5 | Flag for staff review |

---

## Related

- [Task Routing](task-routing.md) — Task creation from intents
- [Autonomy](autonomy.md) — Auto-execute thresholds
