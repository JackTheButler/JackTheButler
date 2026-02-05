# Use Case: Knowledge Base Management

Staff curate hotel-specific knowledge that grounds Jack's AI responses.

---

## Summary

| Attribute | Value |
|-----------|-------|
| ID | S-07 |
| Actor | Staff (managers, admin) |
| Interface | Dashboard |
| Priority | P0 |

---

## Description

The Knowledge Base is the source of truth for hotel-specific information — policies, FAQs, amenities, dining, procedures, and more. Jack uses semantic search (RAG) to find relevant entries and ground AI responses in accurate, property-specific content.

Staff manage knowledge through two paths:
1. **Manual entry** — Adding and editing entries directly
2. **Site Scraper** — Importing content from the hotel's website automatically

---

## User Stories

- As a manager, I want to add hotel FAQs so Jack can answer guest questions accurately
- As admin, I want to import our website content so Jack knows our policies without manual data entry
- As staff, I want to test what Jack knows by asking questions and seeing matched results
- As a manager, I want to update outdated information so Jack gives current answers

---

## Knowledge Base Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE BASE                                          [+ Add New] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ASK JACK                                                            │
│ ─────────                                                           │
│ Test what Jack knows:                                               │
│ [What are the pool hours?                              ] [Ask]      │
│                                                                     │
│ ✓ Searching... → ✓ Found 3 matches → ✓ Generating response         │
│                                                                     │
│ Jack: "The pool is open daily 7:00 AM - 10:00 PM. Towels           │
│ are provided poolside."                                             │
│                                                                     │
│ Matched entries (3):                                                │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Pool & Fitness Center (96% match)                               │ │
│ │ Parking Policy (23% match)                                      │ │
│ │ Guest Services Overview (18% match)                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [All] [Manual] [Scraped]          Category: [All ▼]   🔍 [Search]  │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🏊 Pool & Fitness Center              amenity     [Edit] [Del] │ │
│ │    Open daily 7am-10pm, towels provided poolside...             │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ 🌐 Parking Policy                      policy     [Edit] [Del] │ │
│ │    Complimentary self-parking in garage, enter from Oak St...   │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ 🌐 Breakfast Menu                      dining     [Edit] [Del] │ │
│ │    The Garden restaurant, 6:30-10:30 AM, buffet and à la...    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ 🌐 = Scraped from website                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Manual Entry

### Add/Edit Form

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADD KNOWLEDGE ENTRY                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Category:  [Amenity ▼]                                              │
│ Title:     [Pool & Fitness Center                          ]        │
│ Content:   [                                                ]       │
│            [ Our rooftop pool is heated to 82°F and open    ]       │
│            [ daily 7:00 AM - 10:00 PM. Towels provided      ]       │
│            [ poolside. Fitness center is 24/7, 2nd floor.   ]       │
│            [                                                ]       │
│ Keywords:  [pool, gym, fitness, swim, exercise              ]       │
│ Priority:  [Normal ▼]                                               │
│                                                                     │
│                                            [Cancel] [Save]          │
└─────────────────────────────────────────────────────────────────────┘
```

### Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| FAQ | Frequently asked questions | WiFi password, checkout time |
| Policy | Hotel rules and policies | Cancellation, pets, smoking |
| Amenity | Facilities and features | Pool, gym, spa, business center |
| Dining | Restaurants and menus | Hours, menus, dietary options |
| Service | Available services | Laundry, room service, concierge |
| Location | Directions and nearby | Transport, attractions, maps |
| Procedure | Internal workflows | Escalation steps, VIP handling |

---

## Site Scraper

Automatically imports content from the hotel's website into the Knowledge Base.

### Workflow

```
Step 1: Enter URLs
  → Staff enters hotel website URLs to scrape
  → Can add multiple URLs at once

Step 2: Fetching & Parsing
  → System scrapes pages and extracts content with AI
  → Progress indicator shows status

Step 3: Review Extracted Content
  → Staff reviews extracted entries in a table
  → Each entry shows: title, content, category, confidence score
  → Duplicate detection warns about similar existing entries
  → Staff can select/deselect, edit, or adjust categories

Step 4: Generate Q&A (Optional)
  → AI generates question-answer pairs from content
  → Staff can review, edit, or delete Q&A pairs

Step 5: Import
  → Selected entries imported to Knowledge Base
  → Embeddings generated automatically
  → Source URL tracked for future re-scraping
```

### Scraper Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│ SITE SCRAPER                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ● URLs → ● Fetching → ○ Review → ○ Import                          │
│                                                                     │
│ Enter website URLs to import:                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ https://grandhotel.com/amenities                          [✕]  │ │
│ │ https://grandhotel.com/dining                             [✕]  │ │
│ │ https://grandhotel.com/policies                           [✕]  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [+ Add URL]                                                         │
│                                                                     │
│ PREVIOUSLY IMPORTED                                                 │
│ ────────────────────                                                │
│ grandhotel.com/spa - 8 entries - Imported 3 days ago [Re-scrape]   │
│ grandhotel.com/rooms - 5 entries - Imported 1 week ago [Re-scrape] │
│                                                                     │
│                                                     [Start Scrape]  │
└─────────────────────────────────────────────────────────────────────┘
```

### Review Table

```
┌─────────────────────────────────────────────────────────────────────┐
│ REVIEW EXTRACTED CONTENT                          4 entries found    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ [✓] Pool & Spa                    amenity    Confidence: 95%        │
│     Heated rooftop pool open 7am-10pm, full-service spa...          │
│     ⚠️ Similar entry exists (87% match)                              │
│     Q&A: 3 pairs generated                              [▼ View]   │
│                                                                     │
│ [✓] Breakfast at The Garden       dining     Confidence: 92%        │
│     Daily 6:30-10:30am, buffet and à la carte options...            │
│     Q&A: 4 pairs generated                              [▼ View]   │
│                                                                     │
│ [ ] Cookie Policy                 other      Confidence: 31%        │
│     Website cookie consent information...                           │
│     ℹ️ Not relevant to guest service                                 │
│                                                                     │
│                                     [Generate Q&A] [Import Selected]│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Embedding & Search

When entries are added or updated, vector embeddings are generated automatically. This enables semantic search — Jack finds relevant entries even when the guest's question doesn't match exact keywords.

| Guest Asks | Matched Entry | Why It Matches |
|-----------|---------------|----------------|
| "Can I swim?" | Pool & Fitness Center | Semantic: swim → pool |
| "Where can I work out?" | Pool & Fitness Center | Semantic: work out → fitness |
| "I'm vegan, what can I eat?" | Breakfast Menu | Semantic: vegan → dietary options |

Staff can trigger a full reindex if embeddings get out of sync.

---

## Acceptance Criteria

### Manual Entry
- [ ] CRUD operations on knowledge entries
- [ ] Category assignment and filtering
- [ ] Full-text search across entries
- [ ] Embeddings generated on save

### Site Scraper
- [ ] Multi-URL scraping in one session
- [ ] AI-powered content extraction with confidence scores
- [ ] Duplicate detection against existing entries
- [ ] Q&A pair generation from scraped content
- [ ] Source tracking for re-scraping
- [ ] Staff review before import (nothing auto-imported)

### Ask Jack
- [ ] Natural language test queries
- [ ] Shows matched entries with similarity scores
- [ ] Generates AI response from matched content
- [ ] Visual progress indicator (searching → matching → generating)

---

## Related

- [Guest: Information Inquiries](../guest/during-stay.md#information-inquiries) - How knowledge is used in guest responses
- [Engine Configuration](engine-configuration.md) - AI provider setup required for embeddings
- [Operations: Automation](../operations/automation.md) - Knowledge gaps can trigger alerts
