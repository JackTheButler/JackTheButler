# Knowledge Base

Hotel information storage with semantic search.

---

## Overview

The Knowledge Base stores hotel information (FAQ, policies, amenities) that the AI uses to answer guest questions. Features:
- Categorized entries
- Keyword tagging
- Embedding-based semantic search
- Manual and scraped content sources

---

## Categories

| Category | Description |
|----------|-------------|
| `faq` | Frequently asked questions |
| `policy` | Hotel policies (cancellation, pets, etc.) |
| `amenity` | Hotel amenities (pool, gym, spa) |
| `service` | Available services |
| `dining` | Restaurant and food options |
| `room_type` | Room categories and features |
| `local_info` | Local attractions and tips |
| `contact` | Contact information |
| `other` | Miscellaneous |

---

## Entry Schema

```typescript
interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;       // 0-10
  status: 'active' | 'archived';
  sourceUrl?: string;     // If scraped from website
  createdAt: string;
  updatedAt: string;
}
```

---

## Semantic Search

Entries are embedded using the configured AI provider. Search uses cosine similarity to find relevant content.

**Search flow:**
1. User query → Generate embedding
2. Compare against stored embeddings
3. Return top matches above similarity threshold

**Parameters:**
- `limit` — Max results (default: 5)
- `minSimilarity` — Minimum similarity score (default: 0.3)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/knowledge` | List entries |
| GET | `/knowledge/categories` | Get categories with counts |
| GET | `/knowledge/:id` | Get entry |
| POST | `/knowledge` | Create entry |
| PUT | `/knowledge/:id` | Update entry |
| DELETE | `/knowledge/:id` | Archive entry |
| POST | `/knowledge/search` | Semantic search |
| POST | `/knowledge/ask` | Search + AI response |
| POST | `/knowledge/reindex` | Regenerate all embeddings |

### Query Parameters (list)

| Param | Description |
|-------|-------------|
| `category` | Filter by category |
| `search` | Text search in title/content |
| `source` | `manual` or `scraped` |
| `status` | `active` or `archived` |
| `limit` | Max results |
| `offset` | Pagination offset |

### Create Entry

```json
{
  "category": "amenity",
  "title": "Pool Hours",
  "content": "The outdoor pool is open daily from 7am to 10pm. Towels are available poolside.",
  "keywords": ["pool", "swimming", "hours"],
  "priority": 5
}
```

### Search

```json
{
  "query": "What time does the pool close?"
}
```

**Response:**
```json
{
  "matches": [
    {
      "id": "kb-123",
      "title": "Pool Hours",
      "category": "amenity",
      "similarity": 87
    }
  ]
}
```

### Ask (Search + AI)

Same input as search, but returns AI-generated response:

```json
{
  "response": "The outdoor pool is open daily from 7am to 10pm. Towels are provided at the pool.",
  "matches": [...]
}
```

---

## Embeddings

Embeddings are stored separately in `knowledge_embeddings` table:

| Field | Description |
|-------|-------------|
| `id` | References knowledge entry |
| `embedding` | Vector as JSON array |
| `model` | Model used for embedding |
| `dimensions` | Vector dimensions |

Reindex regenerates embeddings for all active entries.

---

## Site Scraper

The Site Scraper tool populates the knowledge base from hotel websites.

### Workflow

1. **Parse** — Fetch URLs and extract content with AI categorization
2. **Deduplicate** — Semantic deduplication against existing entries
3. **Generate Q&A** — Create FAQ entries from extracted content
4. **Import** — Save entries with embeddings to knowledge base

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tools/site-scraper/parse` | Fetch and extract from URLs |
| POST | `/tools/site-scraper/import` | Import entries with embeddings |
| POST | `/tools/site-scraper/generate-qa` | Generate Q&A pairs |
| GET | `/tools/site-scraper/sources` | List imported source URLs |

### Parse Request

```json
{
  "urls": ["https://hotel.com/amenities"],
  "options": {
    "hotelName": "Grand Hotel",
    "timeout": 15000
  }
}
```

### Parse Response

```json
{
  "entries": [
    {
      "title": "Pool Hours",
      "content": "The outdoor pool is open daily from 7am to 10pm.",
      "category": "amenity",
      "keywords": ["pool", "swimming", "hours"],
      "confidence": 0.92
    }
  ],
  "duplicates": [],
  "summary": {
    "total": 1,
    "success": 1,
    "totalEntries": 5
  }
}
```

### Usage in Setup Wizard

The Setup Wizard uses the Site Scraper to collect initial knowledge:
1. User provides website URL
2. System scrapes and extracts entries
3. User reviews and confirms entries
4. Entries are imported to knowledge base
5. Hotel profile is synced from extracted data (check-in times, contact info)

---

## Related

- [REST API](../api/rest-api.md) — Knowledge endpoints
- [Vector Search](vector-search.md) — Embedding search details (Planned)
