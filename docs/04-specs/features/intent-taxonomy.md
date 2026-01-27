# Intent Classification Taxonomy

Complete hierarchical taxonomy of guest intents for Jack The Butler.

---

## Overview

Intent classification maps guest messages to actionable categories. Each intent:
- Has a **hierarchical code** (e.g., `request.service.towels`)
- Maps to a **skill** or **response type**
- Has a **confidence threshold** for autonomous handling
- Defines **expected entities** to extract
- Specifies **routing** (AI-handled, task creation, or escalation)

---

## Intent Hierarchy

```
intent/
├── inquiry/                    # Information requests (AI responds)
│   ├── amenity/
│   │   ├── hours              # Operating hours questions
│   │   ├── location           # Where is X?
│   │   ├── availability       # Is X available?
│   │   └── pricing            # How much does X cost?
│   ├── policy/
│   │   ├── cancellation       # Cancellation policy
│   │   ├── checkout           # Checkout time/process
│   │   ├── checkin            # Check-in time/process
│   │   ├── pets               # Pet policy
│   │   ├── smoking            # Smoking policy
│   │   ├── parking            # Parking info
│   │   └── wifi               # WiFi access
│   ├── dining/
│   │   ├── menu               # What's on the menu?
│   │   ├── hours              # Restaurant hours
│   │   ├── dietary            # Dietary options
│   │   └── recommendation     # What do you recommend?
│   ├── local/
│   │   ├── attraction         # Things to do nearby
│   │   ├── restaurant         # Restaurant recommendations
│   │   ├── transport          # How to get to X?
│   │   └── weather            # Weather forecast
│   └── general/
│       ├── contact            # Phone/email for departments
│       ├── directions         # How to find something in hotel
│       └── other              # General questions
│
├── request/                    # Action requests (may create tasks)
│   ├── service/
│   │   ├── towels             # Extra towels
│   │   ├── pillows            # Extra pillows
│   │   ├── blankets           # Extra blankets
│   │   ├── toiletries         # Toiletries request
│   │   ├── housekeeping       # Room cleaning
│   │   ├── turndown           # Turndown service
│   │   ├── minibar            # Minibar restock
│   │   ├── ice                # Ice bucket
│   │   ├── iron               # Iron/ironing board
│   │   ├── crib               # Baby crib
│   │   ├── rollaway           # Rollaway bed
│   │   └── other              # Other service requests
│   ├── dining/
│   │   ├── room_service       # Order food to room
│   │   ├── reservation        # Restaurant reservation
│   │   ├── breakfast          # Breakfast arrangements
│   │   └── special_meal       # Special dietary meal
│   ├── concierge/
│   │   ├── taxi               # Book taxi/car
│   │   ├── restaurant_booking # External restaurant
│   │   ├── tickets            # Event/attraction tickets
│   │   ├── tour               # Tour booking
│   │   ├── spa                # Spa appointment
│   │   ├── golf               # Golf tee time
│   │   ├── rental             # Car/equipment rental
│   │   ├── flowers            # Flower arrangement
│   │   ├── celebration        # Birthday/anniversary setup
│   │   └── other              # Other concierge requests
│   ├── room/
│   │   ├── early_checkin      # Check in before standard time
│   │   ├── late_checkout      # Check out after standard time
│   │   ├── change             # Change room
│   │   ├── upgrade            # Room upgrade request
│   │   ├── extend             # Extend stay
│   │   └── key                # Room key issue
│   ├── technical/
│   │   ├── wifi               # WiFi help
│   │   ├── tv                 # TV issues
│   │   └── phone              # Room phone issues
│   └── wake_up/
│       └── call               # Wake-up call request
│
├── complaint/                  # Issues/problems (high priority)
│   ├── noise/
│   │   ├── neighbors          # Noisy neighbors
│   │   ├── construction       # Construction noise
│   │   └── other              # Other noise
│   ├── cleanliness/
│   │   ├── room               # Room not clean
│   │   ├── bathroom           # Bathroom issues
│   │   └── linens             # Dirty linens
│   ├── maintenance/
│   │   ├── hvac               # AC/heating issues
│   │   ├── plumbing           # Water/toilet issues
│   │   ├── electrical         # Lights/outlets
│   │   ├── appliance          # Minibar/TV/safe
│   │   └── furniture          # Broken furniture
│   ├── service/
│   │   ├── slow               # Slow service
│   │   ├── rude               # Rude staff
│   │   ├── missing            # Missing item/service
│   │   └── incorrect          # Wrong order/service
│   ├── billing/
│   │   ├── charge             # Incorrect charge
│   │   └── dispute            # Billing dispute
│   ├── safety/
│   │   ├── security           # Security concern
│   │   └── health             # Health/sanitation
│   └── other/
│       └── general            # General complaint
│
├── feedback/                   # Guest feedback (logged)
│   ├── positive/
│   │   ├── staff              # Staff compliment
│   │   ├── room               # Room satisfaction
│   │   ├── dining             # Food compliment
│   │   └── general            # General positive
│   ├── neutral/
│   │   └── comment            # Neutral observation
│   └── suggestion/
│       └── improvement        # Improvement suggestion
│
├── booking/                    # Reservation changes (escalate)
│   ├── modify                 # Change existing reservation
│   ├── cancel                 # Cancel reservation
│   ├── confirm                # Confirm details
│   └── new                    # New booking inquiry
│
├── emergency/                  # Urgent situations (immediate escalate)
│   ├── medical                # Medical emergency
│   ├── fire                   # Fire emergency
│   ├── security               # Security threat
│   └── other                  # Other emergency
│
└── other/                      # Non-service intents
    ├── greeting               # Hello, hi, good morning
    ├── farewell               # Goodbye, thanks, bye
    ├── thanks                 # Thank you messages
    ├── acknowledgment         # OK, got it, sure
    ├── human_request          # Want to speak to human
    └── unclear                # Cannot determine intent
```

---

## Complete Intent Definitions

### inquiry.* (Information Requests)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `inquiry.amenity.hours` | Operating hours for amenities | 0.70 | `get_amenity_info` | AI responds |
| `inquiry.amenity.location` | Where to find amenities | 0.70 | `get_amenity_info` | AI responds |
| `inquiry.amenity.availability` | Is amenity available | 0.70 | `get_amenity_info` | AI responds |
| `inquiry.amenity.pricing` | Cost of amenities/services | 0.75 | `get_pricing` | AI responds |
| `inquiry.policy.cancellation` | Cancellation terms | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.checkout` | Checkout time/process | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.checkin` | Check-in time/process | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.pets` | Pet policy | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.smoking` | Smoking policy | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.parking` | Parking information | 0.70 | `get_policy` | AI responds |
| `inquiry.policy.wifi` | WiFi access info | 0.70 | `get_policy` | AI responds |
| `inquiry.dining.menu` | Menu questions | 0.70 | `get_menu` | AI responds |
| `inquiry.dining.hours` | Restaurant hours | 0.70 | `get_amenity_info` | AI responds |
| `inquiry.dining.dietary` | Dietary accommodations | 0.70 | `get_menu` | AI responds |
| `inquiry.dining.recommendation` | Food recommendations | 0.70 | `recommend_dining` | AI responds |
| `inquiry.local.attraction` | Local attractions | 0.70 | `get_local_info` | AI responds |
| `inquiry.local.restaurant` | Local restaurants | 0.70 | `get_local_info` | AI responds |
| `inquiry.local.transport` | Transportation info | 0.70 | `get_local_info` | AI responds |
| `inquiry.local.weather` | Weather forecast | 0.70 | `get_weather` | AI responds |
| `inquiry.general.contact` | Contact information | 0.70 | `get_contact` | AI responds |
| `inquiry.general.directions` | In-hotel directions | 0.70 | `get_amenity_info` | AI responds |
| `inquiry.general.other` | General questions | 0.65 | `knowledge_search` | AI responds |

### request.service.* (Service Requests)

| Intent | Description | Threshold | Skill | Routing | Department |
|--------|-------------|-----------|-------|---------|------------|
| `request.service.towels` | Extra towels | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.pillows` | Extra pillows | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.blankets` | Extra blankets | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.toiletries` | Toiletries request | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.housekeeping` | Room cleaning | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.turndown` | Turndown service | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.minibar` | Minibar restock | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.ice` | Ice bucket | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.iron` | Iron/board | 0.70 | `create_service_task` | Create task | Housekeeping |
| `request.service.crib` | Baby crib | 0.75 | `create_service_task` | Create task | Housekeeping |
| `request.service.rollaway` | Rollaway bed | 0.75 | `create_service_task` | Create task | Housekeeping |
| `request.service.other` | Other service | 0.65 | `create_service_task` | Create task | Housekeeping |

### request.dining.* (Dining Requests)

| Intent | Description | Threshold | Skill | Routing | Department |
|--------|-------------|-----------|-------|---------|------------|
| `request.dining.room_service` | Order food | 0.75 | `order_room_service` | Create task | F&B |
| `request.dining.reservation` | Restaurant booking | 0.75 | `book_restaurant` | Create task | F&B |
| `request.dining.breakfast` | Breakfast arrangement | 0.75 | `arrange_breakfast` | Create task | F&B |
| `request.dining.special_meal` | Special dietary meal | 0.75 | `create_service_task` | Create task | F&B |

### request.concierge.* (Concierge Requests)

| Intent | Description | Threshold | Skill | Routing | Department |
|--------|-------------|-----------|-------|---------|------------|
| `request.concierge.taxi` | Book taxi/car | 0.75 | `book_transport` | Create task | Concierge |
| `request.concierge.restaurant_booking` | External restaurant | 0.75 | `book_restaurant_external` | Create task | Concierge |
| `request.concierge.tickets` | Event tickets | 0.75 | `book_tickets` | Create task | Concierge |
| `request.concierge.tour` | Tour booking | 0.75 | `book_tour` | Create task | Concierge |
| `request.concierge.spa` | Spa appointment | 0.75 | `book_spa` | Create task | Spa |
| `request.concierge.golf` | Golf tee time | 0.75 | `book_golf` | Create task | Concierge |
| `request.concierge.rental` | Equipment rental | 0.75 | `book_rental` | Create task | Concierge |
| `request.concierge.flowers` | Flower arrangement | 0.75 | `arrange_flowers` | Create task | Concierge |
| `request.concierge.celebration` | Special occasion setup | 0.80 | `arrange_celebration` | Create task | Concierge |
| `request.concierge.other` | Other request | 0.70 | `create_concierge_task` | Create task | Concierge |

### request.room.* (Room/Reservation Requests)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `request.room.early_checkin` | Early check-in | 0.85 | `check_early_checkin` | Check availability, may escalate |
| `request.room.late_checkout` | Late checkout | 0.85 | `check_late_checkout` | Check availability, may escalate |
| `request.room.change` | Room change | 0.85 | `request_room_change` | Always escalate |
| `request.room.upgrade` | Room upgrade | 0.85 | `request_upgrade` | Always escalate |
| `request.room.extend` | Extend stay | 0.85 | `check_availability` | Check, then escalate |
| `request.room.key` | Key issue | 0.70 | `create_service_task` | Create task (Front Desk) |

### request.technical.* (Technical Support)

| Intent | Description | Threshold | Skill | Routing | Department |
|--------|-------------|-----------|-------|---------|------------|
| `request.technical.wifi` | WiFi help | 0.70 | `wifi_troubleshoot` | AI help, then task | Maintenance |
| `request.technical.tv` | TV issues | 0.70 | `create_maintenance_task` | Create task | Maintenance |
| `request.technical.phone` | Phone issues | 0.70 | `create_maintenance_task` | Create task | Maintenance |

### request.wake_up.* (Wake-up Calls)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `request.wake_up.call` | Wake-up call | 0.80 | `schedule_wakeup` | AI schedules |

### complaint.* (Complaints)

| Intent | Description | Threshold | Skill | Routing | Priority |
|--------|-------------|-----------|-------|---------|----------|
| `complaint.noise.neighbors` | Noisy neighbors | 0.80 | `report_complaint` | Create task + may escalate | High |
| `complaint.noise.construction` | Construction noise | 0.80 | `report_complaint` | Create task | Standard |
| `complaint.noise.other` | Other noise | 0.80 | `report_complaint` | Create task | Standard |
| `complaint.cleanliness.room` | Room cleanliness | 0.80 | `report_complaint` | Create task | High |
| `complaint.cleanliness.bathroom` | Bathroom issue | 0.80 | `report_complaint` | Create task | High |
| `complaint.cleanliness.linens` | Dirty linens | 0.80 | `report_complaint` | Create task | High |
| `complaint.maintenance.hvac` | AC/heating | 0.80 | `create_maintenance_task` | Create urgent task | Urgent |
| `complaint.maintenance.plumbing` | Plumbing issue | 0.80 | `create_maintenance_task` | Create urgent task | Urgent |
| `complaint.maintenance.electrical` | Electrical issue | 0.80 | `create_maintenance_task` | Create task | High |
| `complaint.maintenance.appliance` | Appliance issue | 0.80 | `create_maintenance_task` | Create task | Standard |
| `complaint.maintenance.furniture` | Furniture issue | 0.80 | `create_maintenance_task` | Create task | Standard |
| `complaint.service.slow` | Slow service | 0.80 | `report_complaint` | Log + escalate | High |
| `complaint.service.rude` | Rude staff | 0.85 | `report_complaint` | Always escalate | Critical |
| `complaint.service.missing` | Missing item | 0.80 | `report_complaint` | Create task | High |
| `complaint.service.incorrect` | Incorrect service | 0.80 | `report_complaint` | Create task | High |
| `complaint.billing.charge` | Wrong charge | 0.85 | `report_complaint` | Always escalate | High |
| `complaint.billing.dispute` | Billing dispute | N/A | `report_complaint` | Always escalate | Critical |
| `complaint.safety.security` | Security concern | 0.85 | `report_complaint` | Immediate escalate | Critical |
| `complaint.safety.health` | Health concern | 0.85 | `report_complaint` | Immediate escalate | Critical |
| `complaint.other.general` | General complaint | 0.75 | `report_complaint` | Create task | Standard |

### booking.* (Reservation Changes)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `booking.modify` | Modify reservation | N/A | — | Always escalate |
| `booking.cancel` | Cancel reservation | N/A | — | Always escalate |
| `booking.confirm` | Confirm details | 0.80 | `get_reservation` | AI responds |
| `booking.new` | New booking inquiry | 0.80 | — | Escalate or redirect to booking |

### emergency.* (Emergencies)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `emergency.medical` | Medical emergency | 0.70 | `emergency_response` | Immediate escalate + alert |
| `emergency.fire` | Fire emergency | 0.70 | `emergency_response` | Immediate escalate + alert |
| `emergency.security` | Security threat | 0.70 | `emergency_response` | Immediate escalate + alert |
| `emergency.other` | Other emergency | 0.70 | `emergency_response` | Immediate escalate + alert |

### feedback.* (Guest Feedback)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `feedback.positive.staff` | Staff compliment | 0.60 | `log_feedback` | Log + thank |
| `feedback.positive.room` | Room satisfaction | 0.60 | `log_feedback` | Log + thank |
| `feedback.positive.dining` | Food compliment | 0.60 | `log_feedback` | Log + thank |
| `feedback.positive.general` | General positive | 0.60 | `log_feedback` | Log + thank |
| `feedback.neutral.comment` | Neutral comment | 0.60 | `log_feedback` | Log |
| `feedback.suggestion.improvement` | Suggestion | 0.60 | `log_feedback` | Log + forward |

### other.* (Non-Service Intents)

| Intent | Description | Threshold | Skill | Routing |
|--------|-------------|-----------|-------|---------|
| `other.greeting` | Hello/hi | 0.50 | — | AI greets back |
| `other.farewell` | Goodbye | 0.50 | — | AI says goodbye |
| `other.thanks` | Thank you | 0.50 | — | AI acknowledges |
| `other.acknowledgment` | OK/got it | 0.50 | — | AI acknowledges |
| `other.human_request` | Speak to human | 0.60 | — | Always escalate |
| `other.unclear` | Cannot determine | N/A | — | Ask for clarification |

---

## Entity Schemas

### Common Entities

```typescript
interface EntitySchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'time' | 'datetime' | 'enum' | 'array';
  required: boolean;
  default?: unknown;
  enumValues?: string[];
  description?: string;
  extractionHint?: string;  // Guidance for LLM extraction
}

// Reusable entity definitions
const COMMON_ENTITIES = {
  room_number: {
    name: 'room_number',
    type: 'string',
    required: true,
    description: 'Guest room number',
    extractionHint: 'Extract room number if mentioned, otherwise use context from reservation'
  },
  quantity: {
    name: 'quantity',
    type: 'number',
    required: false,
    default: 1,
    description: 'Number of items requested',
    extractionHint: 'Look for numbers, "a couple", "a few", etc.'
  },
  date: {
    name: 'date',
    type: 'date',
    required: true,
    description: 'Date in YYYY-MM-DD format',
    extractionHint: 'Parse relative dates like "tomorrow", "next Monday"'
  },
  time: {
    name: 'time',
    type: 'time',
    required: true,
    description: 'Time in HH:MM format (24h)',
    extractionHint: 'Parse "3pm" as "15:00", "noon" as "12:00"'
  },
  party_size: {
    name: 'party_size',
    type: 'number',
    required: true,
    description: 'Number of people',
    extractionHint: 'Look for "for 2", "party of 4", "just me" (=1)'
  }
};
```

### Entity Schemas by Intent

```typescript
const INTENT_ENTITY_SCHEMAS: Record<string, EntitySchema[]> = {
  // Service requests
  'request.service.towels': [
    { ...COMMON_ENTITIES.room_number },
    { ...COMMON_ENTITIES.quantity, default: 2 },
    { name: 'towel_type', type: 'enum', required: false, enumValues: ['bath', 'hand', 'face', 'pool'] }
  ],
  'request.service.pillows': [
    { ...COMMON_ENTITIES.room_number },
    { ...COMMON_ENTITIES.quantity, default: 1 },
    { name: 'pillow_type', type: 'enum', required: false, enumValues: ['firm', 'soft', 'hypoallergenic'] }
  ],
  'request.service.housekeeping': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'service_type', type: 'enum', required: false, enumValues: ['full', 'turndown', 'refresh', 'towels_only'] },
    { name: 'preferred_time', type: 'time', required: false }
  ],

  // Dining requests
  'request.dining.room_service': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'items', type: 'array', required: true, description: 'Food/drink items ordered' },
    { name: 'special_instructions', type: 'string', required: false }
  ],
  'request.dining.reservation': [
    { name: 'restaurant_name', type: 'string', required: false },
    { ...COMMON_ENTITIES.date },
    { ...COMMON_ENTITIES.time },
    { ...COMMON_ENTITIES.party_size },
    { name: 'special_requests', type: 'string', required: false }
  ],

  // Room requests
  'request.room.early_checkin': [
    { name: 'requested_time', type: 'time', required: false, description: 'Desired check-in time' }
  ],
  'request.room.late_checkout': [
    { name: 'requested_time', type: 'time', required: false, description: 'Desired checkout time' }
  ],
  'request.room.extend': [
    { name: 'additional_nights', type: 'number', required: true },
    { name: 'new_departure_date', type: 'date', required: false }
  ],

  // Concierge requests
  'request.concierge.taxi': [
    { name: 'pickup_time', type: 'datetime', required: true },
    { name: 'destination', type: 'string', required: false },
    { name: 'passengers', type: 'number', required: false, default: 1 }
  ],
  'request.concierge.restaurant_booking': [
    { name: 'restaurant_name', type: 'string', required: false },
    { name: 'cuisine_type', type: 'string', required: false },
    { ...COMMON_ENTITIES.date },
    { ...COMMON_ENTITIES.time },
    { ...COMMON_ENTITIES.party_size }
  ],
  'request.concierge.spa': [
    { name: 'treatment_type', type: 'string', required: false },
    { name: 'preferred_date', type: 'date', required: false },
    { name: 'preferred_time', type: 'time', required: false },
    { name: 'therapist_preference', type: 'string', required: false }
  ],

  // Wake-up calls
  'request.wake_up.call': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'wake_time', type: 'time', required: true },
    { name: 'date', type: 'date', required: false, description: 'Date if not today' }
  ],

  // Complaints
  'complaint.maintenance.hvac': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'issue_type', type: 'enum', required: false, enumValues: ['too_hot', 'too_cold', 'not_working', 'noisy'] },
    { name: 'description', type: 'string', required: true }
  ],
  'complaint.maintenance.plumbing': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'issue_type', type: 'enum', required: false, enumValues: ['leak', 'clogged', 'no_water', 'no_hot_water'] },
    { name: 'location', type: 'enum', required: false, enumValues: ['bathroom', 'kitchen', 'other'] },
    { name: 'description', type: 'string', required: true }
  ],
  'complaint.noise.neighbors': [
    { ...COMMON_ENTITIES.room_number },
    { name: 'source_room', type: 'string', required: false, description: 'Room causing noise if known' },
    { name: 'noise_type', type: 'string', required: false }
  ],

  // Inquiries
  'inquiry.amenity.hours': [
    { name: 'amenity', type: 'string', required: true, description: 'Pool, gym, restaurant, etc.' }
  ],
  'inquiry.local.restaurant': [
    { name: 'cuisine_type', type: 'string', required: false },
    { name: 'price_range', type: 'enum', required: false, enumValues: ['budget', 'moderate', 'upscale'] },
    { name: 'distance', type: 'enum', required: false, enumValues: ['walking', 'nearby', 'any'] }
  ]
};
```

---

## Training Examples

### inquiry.amenity.hours

```yaml
examples:
  - text: "What time does the pool close?"
    entities: { amenity: "pool" }
  - text: "When is breakfast served?"
    entities: { amenity: "breakfast" }
  - text: "Is the gym open 24 hours?"
    entities: { amenity: "gym" }
  - text: "What are the spa hours?"
    entities: { amenity: "spa" }
  - text: "Until when can I use the business center?"
    entities: { amenity: "business center" }
```

### request.service.towels

```yaml
examples:
  - text: "Can I get extra towels?"
    entities: { quantity: 2 }
  - text: "We need more bath towels please"
    entities: { towel_type: "bath" }
  - text: "Could you send 4 pool towels to room 412?"
    entities: { quantity: 4, towel_type: "pool", room_number: "412" }
  - text: "Towels please"
    entities: { quantity: 2 }
  - text: "We ran out of towels"
    entities: {}
```

### request.dining.reservation

```yaml
examples:
  - text: "I'd like to book a table for dinner"
    entities: {}  # Need to ask for details
  - text: "Can you reserve a table for 2 at 7pm tonight?"
    entities: { party_size: 2, time: "19:00", date: "today" }
  - text: "Book us at the steakhouse tomorrow at 8"
    entities: { restaurant_name: "steakhouse", time: "20:00", date: "tomorrow" }
  - text: "Table for 4 on Saturday evening"
    entities: { party_size: 4, date: "Saturday" }  # Need time
  - text: "Reservation for my wife and I, somewhere romantic"
    entities: { party_size: 2, special_requests: "romantic" }
```

### complaint.maintenance.hvac

```yaml
examples:
  - text: "The AC is broken"
    entities: { issue_type: "not_working" }
  - text: "It's freezing in my room"
    entities: { issue_type: "too_cold" }
  - text: "Can't get the room to cool down"
    entities: { issue_type: "too_hot" }
  - text: "The air conditioner is making a loud noise"
    entities: { issue_type: "noisy" }
  - text: "Room 305 heating not working"
    entities: { room_number: "305", issue_type: "not_working" }
```

### complaint.noise.neighbors

```yaml
examples:
  - text: "The room next door is very loud"
    entities: {}
  - text: "There's a party happening above us"
    entities: { noise_type: "party" }
  - text: "Room 502 is being really noisy"
    entities: { source_room: "502" }
  - text: "I can't sleep because of the noise from the hallway"
    entities: { noise_type: "hallway" }
  - text: "Kids are running around screaming outside my door"
    entities: { noise_type: "children" }
```

### request.room.late_checkout

```yaml
examples:
  - text: "Can I check out late?"
    entities: {}
  - text: "Is it possible to get late checkout?"
    entities: {}
  - text: "I'd like to stay until 2pm tomorrow"
    entities: { requested_time: "14:00" }
  - text: "Can we have a noon checkout instead?"
    entities: { requested_time: "12:00" }
  - text: "Our flight isn't until 6pm, any chance of extending checkout?"
    entities: {}
```

### other.human_request

```yaml
examples:
  - text: "I want to speak to a person"
    entities: {}
  - text: "Can I talk to someone?"
    entities: {}
  - text: "Get me a human"
    entities: {}
  - text: "I need to speak with a manager"
    entities: {}
  - text: "Transfer me to the front desk"
    entities: {}
  - text: "This isn't helping, I need a real person"
    entities: {}
  - text: "Stop, let me talk to staff"
    entities: {}
```

---

## Confidence & Escalation Rules

### Confidence Threshold Behavior

```typescript
function determineAction(classification: IntentClassification): Action {
  const threshold = getThreshold(classification.intent);

  // Below minimum confidence - always clarify
  if (classification.confidence < 0.40) {
    return { type: 'clarify', reason: 'very_low_confidence' };
  }

  // Below intent threshold - clarify or escalate based on intent
  if (classification.confidence < threshold) {
    if (isSensitiveIntent(classification.intent)) {
      return { type: 'escalate', reason: 'low_confidence_sensitive' };
    }
    return { type: 'clarify', reason: 'below_threshold' };
  }

  // Above threshold - proceed with normal routing
  return { type: 'proceed' };
}
```

### Always-Escalate Intents

These intents bypass AI handling regardless of confidence:

```typescript
const ALWAYS_ESCALATE_INTENTS = [
  'booking.modify',
  'booking.cancel',
  'complaint.billing.dispute',
  'complaint.service.rude',
  'complaint.safety.*',
  'emergency.*',
  'other.human_request'
];
```

### VIP Override Rules

VIP guests get adjusted thresholds:

```typescript
function getThresholdForGuest(intent: string, guest: Guest): number {
  const baseThreshold = getThreshold(intent);

  if (guest.vipStatus || guest.loyaltyTier === 'platinum' || guest.loyaltyTier === 'diamond') {
    // 10% higher threshold for VIPs (more likely to escalate)
    return Math.min(baseThreshold + 0.10, 0.95);
  }

  return baseThreshold;
}
```

---

## Multi-Intent Handling

When a message contains multiple intents:

```typescript
interface MultiIntentResult {
  primary: IntentClassification;
  secondary: IntentClassification[];
  strategy: 'sequential' | 'prioritize' | 'clarify';
}

function handleMultiIntent(intents: IntentClassification[]): MultiIntentResult {
  // Sort by priority and confidence
  const sorted = intents.sort((a, b) => {
    const priorityDiff = getIntentPriority(b.intent) - getIntentPriority(a.intent);
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  const primary = sorted[0];
  const secondary = sorted.slice(1);

  // If intents are compatible, handle sequentially
  if (areCompatible(primary, secondary)) {
    return { primary, secondary, strategy: 'sequential' };
  }

  // If primary is clearly dominant, prioritize it
  if (primary.confidence > secondary[0]?.confidence + 0.2) {
    return { primary, secondary, strategy: 'prioritize' };
  }

  // Otherwise, clarify
  return { primary, secondary, strategy: 'clarify' };
}

// Example message: "Can I get towels and also book dinner for 7pm?"
// → primary: request.service.towels
// → secondary: [request.dining.reservation]
// → strategy: sequential (handle both)
```

---

## Custom Property Intents

Properties can extend the taxonomy:

```yaml
# config/custom-intents.yaml
custom_intents:
  - id: "request.valet.car"
    parent: "request.concierge"
    description: "Request car from valet"
    threshold: 0.75
    skill: "request_valet"
    department: "valet"
    examples:
      - "Can you bring my car around?"
      - "I need my car"
      - "Please get my vehicle"
    entities:
      - name: "eta_minutes"
        type: "number"
        required: false
        description: "How many minutes until needed"

  - id: "request.beach.cabana"
    parent: "request.concierge"
    description: "Reserve beach cabana"
    threshold: 0.75
    skill: "book_cabana"
    department: "beach_services"
    examples:
      - "Book a cabana for tomorrow"
      - "Can we get a beach cabana?"
    entities:
      - name: "date"
        type: "date"
        required: true
      - name: "duration"
        type: "enum"
        enumValues: ["half_day", "full_day"]
        required: false
```

---

## Related

- [AI Engine](../../03-architecture/c4-components/ai-engine.md)
- [Task Routing](task-routing.md)
- [ADR-002: AI Provider Abstraction](../../03-architecture/decisions/002-ai-provider-abstraction.md)
