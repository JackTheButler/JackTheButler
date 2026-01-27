# Vector Search Implementation

This document specifies the RAG (Retrieval-Augmented Generation) implementation using sqlite-vec for Jack The Butler.

---

## Overview

Vector search enables Jack to retrieve relevant knowledge base content when answering guest questions. This provides accurate, property-specific responses without hallucination.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Guest Query    │────▶│   Embedding     │────▶│  Vector Search  │
│  "Pool hours?"  │     │   Generation    │     │   sqlite-vec    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │  LLM Response   │◀─────────────┘
                        │  with Context   │     Top-K Results
                        └─────────────────┘
```

---

## Embedding Model Specification

### Primary Model: OpenAI text-embedding-3-small

| Property | Value |
|----------|-------|
| Model ID | `text-embedding-3-small` |
| Dimensions | 1536 (default) or 512 (reduced) |
| Max Input Tokens | 8191 |
| Cost | $0.02 / 1M tokens |
| Performance | ~3000 embeddings/minute |

### Why This Model

1. **Quality/Cost Balance**: Best performance for hospitality domain at reasonable cost
2. **Dimension Flexibility**: Can reduce to 512 dims with minimal quality loss (saves storage)
3. **Widely Supported**: Available via OpenAI API, compatible with most vector DBs
4. **Fast**: Sub-100ms latency per embedding

### Alternative Models

| Provider | Model | Dimensions | Use Case |
|----------|-------|------------|----------|
| OpenAI | `text-embedding-3-large` | 3072 | Higher accuracy needs |
| Anthropic | Via Claude API | 1024 | Unified provider |
| Local (Ollama) | `nomic-embed-text` | 768 | Offline/air-gapped |
| Local (Ollama) | `mxbai-embed-large` | 1024 | Better local quality |

### Configuration

```yaml
embeddings:
  provider: openai                    # openai | anthropic | ollama
  model: text-embedding-3-small
  dimensions: 512                     # Reduced for storage efficiency
  batchSize: 100                      # Embeddings per API call
  maxRetries: 3
  timeoutMs: 30000

  # Fallback if primary unavailable
  fallback:
    provider: ollama
    model: nomic-embed-text
    dimensions: 768
    endpoint: http://localhost:11434
```

---

## Vector Dimensions

### Chosen Dimension: 512

We use **512 dimensions** (reduced from 1536) for storage efficiency with minimal quality loss.

```typescript
// Dimension configuration
const EMBEDDING_DIMENSIONS = 512;

// Storage impact per 1000 documents
// 1536 dims: ~6MB vectors + metadata
// 512 dims:  ~2MB vectors + metadata (67% reduction)
```

### Dimension Selection Rationale

| Dimensions | Quality Score | Storage | Use Case |
|------------|---------------|---------|----------|
| 256 | 85% | 1 MB/1K docs | Very constrained storage |
| 512 | 94% | 2 MB/1K docs | **Recommended** - Good balance |
| 1024 | 98% | 4 MB/1K docs | High accuracy needs |
| 1536 | 100% | 6 MB/1K docs | Maximum quality |

---

## Content to Embed

### Knowledge Base Content (Primary)

All knowledge base files are embedded and indexed:

```typescript
interface EmbeddableContent {
  id: string;                    // Unique identifier
  type: ContentType;             // 'faq' | 'policy' | 'menu' | 'local' | 'operational'
  path: string;                  // File path in knowledge base
  title: string;                 // Document title
  content: string;               // Text content
  metadata: ContentMetadata;     // Additional context
  embedding?: number[];          // Vector representation
  chunkIndex?: number;           // If document was chunked
}

type ContentType =
  | 'faq'           // FAQs about hotel amenities, services
  | 'policy'        // Hotel policies (cancellation, checkout, etc.)
  | 'menu'          // Restaurant menus, room service
  | 'local'         // Local area information
  | 'operational';  // Internal procedures (excluded from guest queries)

interface ContentMetadata {
  category: string;              // Subcategory within type
  language: string;              // Content language
  lastUpdated: Date;
  version: number;
  tags: string[];                // Searchable tags
  seasonalValidity?: {           // For seasonal content
    startDate: string;
    endDate: string;
  };
}
```

### Content Types and Embedding Strategy

| Content Type | Chunking | Overlap | Refresh Frequency |
|--------------|----------|---------|-------------------|
| FAQs | Per Q&A pair | None | On update |
| Policies | 500 tokens | 50 tokens | On update |
| Menus | Per item | None | Daily (scheduled) |
| Local Info | 500 tokens | 50 tokens | Weekly |
| Operational | 500 tokens | 50 tokens | On update |

### What Gets Embedded

```typescript
// Included in vector index
const EMBEDDABLE_CONTENT = [
  'knowledge/faqs/**/*.md',
  'knowledge/policies/**/*.md',
  'knowledge/menus/**/*.json',
  'knowledge/local/**/*.md',
];

// Excluded from guest queries (internal only)
const INTERNAL_ONLY = [
  'knowledge/operational/**/*',
];

// Not embedded (binary, config)
const EXCLUDED = [
  '**/*.png',
  '**/*.jpg',
  '**/config.yaml',
];
```

### Past Conversations (Secondary)

Past conversations are **not** embedded by default due to:
- Privacy concerns
- Storage overhead
- Staleness of information

However, **resolved staff answers** can be promoted to the knowledge base:

```typescript
// When staff resolves an escalation, their answer can be learned
interface LearnedAnswer {
  question: string;           // Guest's original question
  answer: string;             // Staff's resolution
  occurrences: number;        // Times similar question asked
  promoted: boolean;          // Added to KB?
}
```

---

## Chunking Strategy

### Chunking Parameters

```typescript
interface ChunkingConfig {
  maxTokens: number;           // Maximum tokens per chunk
  overlapTokens: number;       // Overlap between chunks
  minTokens: number;           // Minimum chunk size
  preserveBoundaries: boolean; // Respect paragraph/section breaks
  metadata: boolean;           // Include metadata in chunk
}

const DEFAULT_CHUNKING: ChunkingConfig = {
  maxTokens: 500,
  overlapTokens: 50,
  minTokens: 100,
  preserveBoundaries: true,
  metadata: true,
};
```

### Chunking Algorithm

```typescript
function chunkDocument(
  content: string,
  config: ChunkingConfig = DEFAULT_CHUNKING
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  // Split by natural boundaries first
  const sections = splitBySections(content);

  for (const section of sections) {
    const tokens = tokenize(section);

    if (tokens.length <= config.maxTokens) {
      // Section fits in one chunk
      chunks.push({
        content: section,
        tokenCount: tokens.length,
        startOffset: getOffset(content, section),
      });
    } else {
      // Split large section with overlap
      let start = 0;
      while (start < tokens.length) {
        const end = Math.min(start + config.maxTokens, tokens.length);
        const chunkTokens = tokens.slice(start, end);

        chunks.push({
          content: detokenize(chunkTokens),
          tokenCount: chunkTokens.length,
          startOffset: start,
        });

        // Move forward with overlap
        start = end - config.overlapTokens;

        // Avoid tiny final chunks
        if (tokens.length - start < config.minTokens) {
          break;
        }
      }
    }
  }

  return chunks;
}

interface DocumentChunk {
  content: string;
  tokenCount: number;
  startOffset: number;
  chunkIndex?: number;
  parentId?: string;
}
```

### Special Handling by Content Type

```typescript
const CONTENT_TYPE_CHUNKING: Record<ContentType, Partial<ChunkingConfig>> = {
  faq: {
    // Each Q&A is one chunk
    maxTokens: 1000,
    overlapTokens: 0,
    preserveBoundaries: true,
  },
  policy: {
    // Standard chunking
    maxTokens: 500,
    overlapTokens: 50,
  },
  menu: {
    // Each menu item is one chunk
    maxTokens: 200,
    overlapTokens: 0,
  },
  local: {
    // Larger chunks for context
    maxTokens: 750,
    overlapTokens: 100,
  },
  operational: {
    maxTokens: 500,
    overlapTokens: 50,
  },
};
```

---

## Similarity Threshold

### Retrieval Thresholds

```typescript
interface RetrievalConfig {
  topK: number;                    // Maximum results to return
  similarityThreshold: number;     // Minimum similarity score (0-1)
  reranking: boolean;              // Apply reranking model
  diversityPenalty: number;        // Reduce similar results
}

const DEFAULT_RETRIEVAL: RetrievalConfig = {
  topK: 5,
  similarityThreshold: 0.72,       // Cosine similarity minimum
  reranking: false,                // Optional, adds latency
  diversityPenalty: 0.1,
};
```

### Threshold Tuning by Query Type

Different query types benefit from different thresholds:

| Query Type | Threshold | Rationale |
|------------|-----------|-----------|
| Factual (hours, prices) | 0.80 | High precision needed |
| Policy questions | 0.75 | Moderate precision |
| Recommendations | 0.65 | Allow broader matches |
| General inquiry | 0.72 | Balanced default |

```typescript
function getThreshold(intentCategory: string): number {
  const INTENT_THRESHOLDS: Record<string, number> = {
    'inquiry.amenity': 0.80,
    'inquiry.policy': 0.75,
    'inquiry.location': 0.72,
    'request.concierge.recommendation': 0.65,
    'default': 0.72,
  };

  return INTENT_THRESHOLDS[intentCategory] || INTENT_THRESHOLDS.default;
}
```

### Similarity Metrics

We use **cosine similarity** as the primary metric:

```typescript
// Cosine similarity: dot product of normalized vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Score interpretation
// 1.0: Identical
// 0.8+: Very similar, high confidence match
// 0.7-0.8: Similar, good match
// 0.5-0.7: Somewhat related
// <0.5: Weak or no relationship
```

---

## sqlite-vec Implementation

### Schema

```sql
-- Enable sqlite-vec extension
-- This is loaded at runtime via better-sqlite3

-- Vector storage table
CREATE TABLE knowledge_embeddings (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES knowledge_base(id),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content_text TEXT NOT NULL,
  content_type TEXT NOT NULL,
  metadata JSON,
  embedding BLOB NOT NULL,        -- sqlite-vec vector
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(content_id, chunk_index)
);

-- Create vector index for similarity search
CREATE VIRTUAL TABLE knowledge_embeddings_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[512]            -- Matches EMBEDDING_DIMENSIONS
);

-- Index for filtering by content type
CREATE INDEX idx_embeddings_content_type ON knowledge_embeddings(content_type);
CREATE INDEX idx_embeddings_updated ON knowledge_embeddings(updated_at);
```

### Vector Operations

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// Initialize database with sqlite-vec
function initVectorDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  sqliteVec.load(db);

  // Verify extension loaded
  const version = db.prepare("SELECT vec_version()").pluck().get();
  console.log(`sqlite-vec version: ${version}`);

  return db;
}

// Insert embedding
async function insertEmbedding(
  db: Database.Database,
  item: EmbeddingItem
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO knowledge_embeddings (id, content_id, chunk_index, content_text, content_type, metadata, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_id, chunk_index) DO UPDATE SET
      content_text = excluded.content_text,
      metadata = excluded.metadata,
      embedding = excluded.embedding,
      updated_at = datetime('now')
  `);

  // Convert float array to blob for sqlite-vec
  const embeddingBlob = new Float32Array(item.embedding).buffer;

  stmt.run(
    item.id,
    item.contentId,
    item.chunkIndex,
    item.text,
    item.contentType,
    JSON.stringify(item.metadata),
    embeddingBlob
  );

  // Update vector index
  const vecStmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_embeddings_vec (id, embedding)
    VALUES (?, ?)
  `);
  vecStmt.run(item.id, embeddingBlob);
}

interface EmbeddingItem {
  id: string;
  contentId: string;
  chunkIndex: number;
  text: string;
  contentType: ContentType;
  metadata: ContentMetadata;
  embedding: number[];
}
```

### Vector Search Query

```typescript
interface SearchResult {
  id: string;
  contentId: string;
  text: string;
  contentType: ContentType;
  metadata: ContentMetadata;
  similarity: number;
}

async function vectorSearch(
  db: Database.Database,
  queryEmbedding: number[],
  options: RetrievalConfig = DEFAULT_RETRIEVAL
): Promise<SearchResult[]> {
  const queryBlob = new Float32Array(queryEmbedding).buffer;

  // Vector similarity search with sqlite-vec
  const results = db.prepare(`
    SELECT
      e.id,
      e.content_id,
      e.content_text,
      e.content_type,
      e.metadata,
      vec_distance_cosine(v.embedding, ?) as distance
    FROM knowledge_embeddings_vec v
    JOIN knowledge_embeddings e ON e.id = v.id
    WHERE e.content_type != 'operational'  -- Exclude internal docs
    ORDER BY distance ASC
    LIMIT ?
  `).all(queryBlob, options.topK * 2);  // Fetch extra for filtering

  // Convert distance to similarity and filter
  return results
    .map(row => ({
      id: row.id,
      contentId: row.content_id,
      text: row.content_text,
      contentType: row.content_type as ContentType,
      metadata: JSON.parse(row.metadata),
      similarity: 1 - row.distance,  // Convert distance to similarity
    }))
    .filter(r => r.similarity >= options.similarityThreshold)
    .slice(0, options.topK);
}

// Filtered search (by content type)
async function vectorSearchFiltered(
  db: Database.Database,
  queryEmbedding: number[],
  contentTypes: ContentType[],
  options: RetrievalConfig = DEFAULT_RETRIEVAL
): Promise<SearchResult[]> {
  const queryBlob = new Float32Array(queryEmbedding).buffer;
  const typePlaceholders = contentTypes.map(() => '?').join(',');

  const results = db.prepare(`
    SELECT
      e.id,
      e.content_id,
      e.content_text,
      e.content_type,
      e.metadata,
      vec_distance_cosine(v.embedding, ?) as distance
    FROM knowledge_embeddings_vec v
    JOIN knowledge_embeddings e ON e.id = v.id
    WHERE e.content_type IN (${typePlaceholders})
    ORDER BY distance ASC
    LIMIT ?
  `).all(queryBlob, ...contentTypes, options.topK);

  return results
    .map(row => ({
      id: row.id,
      contentId: row.content_id,
      text: row.content_text,
      contentType: row.content_type as ContentType,
      metadata: JSON.parse(row.metadata),
      similarity: 1 - row.distance,
    }))
    .filter(r => r.similarity >= options.similarityThreshold);
}
```

---

## Index Rebuild Strategy

### When to Rebuild

| Trigger | Action | Scope |
|---------|--------|-------|
| Knowledge file updated | Incremental | Single document |
| Knowledge file deleted | Remove | Single document |
| Embedding model changed | Full rebuild | All documents |
| Dimensions changed | Full rebuild | All documents |
| Daily maintenance | Verify integrity | All documents |
| Manual request | Full rebuild | All documents |

### Incremental Update

```typescript
async function updateDocumentEmbeddings(
  path: string,
  content: string
): Promise<void> {
  // 1. Delete existing chunks for this document
  await deleteDocumentEmbeddings(path);

  // 2. Chunk the new content
  const chunks = chunkDocument(content);

  // 3. Generate embeddings for each chunk
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));

  // 4. Insert new embeddings
  for (let i = 0; i < chunks.length; i++) {
    await insertEmbedding(db, {
      id: `${path}:${i}`,
      contentId: path,
      chunkIndex: i,
      text: chunks[i].content,
      contentType: getContentType(path),
      metadata: await getDocumentMetadata(path),
      embedding: embeddings[i],
    });
  }

  // 5. Log update
  await logEmbeddingUpdate(path, chunks.length);
}

async function deleteDocumentEmbeddings(path: string): Promise<void> {
  db.prepare('DELETE FROM knowledge_embeddings WHERE content_id = ?').run(path);
  db.prepare('DELETE FROM knowledge_embeddings_vec WHERE id LIKE ?').run(`${path}:%`);
}
```

### Full Rebuild

```typescript
interface RebuildJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalDocuments: number;
  processedDocuments: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

async function rebuildAllEmbeddings(): Promise<RebuildJob> {
  const jobId = generateId('rebuild');

  // 1. Get all knowledge base files
  const files = await glob(EMBEDDABLE_CONTENT);

  // 2. Create job record
  const job: RebuildJob = {
    id: jobId,
    status: 'pending',
    totalDocuments: files.length,
    processedDocuments: 0,
  };
  await saveRebuildJob(job);

  // 3. Queue for background processing
  await jobQueue.add('rebuild_embeddings', {
    jobId,
    files,
  });

  return job;
}

// Background job processor
async function processRebuildJob(jobId: string, files: string[]): Promise<void> {
  await updateJobStatus(jobId, 'processing', { startedAt: new Date() });

  try {
    // Clear existing embeddings
    db.prepare('DELETE FROM knowledge_embeddings').run();
    db.prepare('DELETE FROM knowledge_embeddings_vec').run();

    // Process in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (file) => {
        const content = await readFile(file);
        await updateDocumentEmbeddings(file, content);
      }));

      // Update progress
      await updateJobProgress(jobId, Math.min(i + BATCH_SIZE, files.length));
    }

    await updateJobStatus(jobId, 'completed', { completedAt: new Date() });
  } catch (error) {
    await updateJobStatus(jobId, 'failed', { error: error.message });
    throw error;
  }
}
```

### Scheduled Maintenance

```yaml
# Job scheduler configuration
jobs:
  - name: embedding_integrity_check
    schedule: "0 3 * * *"         # Daily at 3 AM
    handler: checkEmbeddingIntegrity

  - name: stale_embedding_cleanup
    schedule: "0 4 * * 0"         # Weekly on Sunday at 4 AM
    handler: cleanupStaleEmbeddings
```

```typescript
async function checkEmbeddingIntegrity(): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    totalDocuments: 0,
    embeddedDocuments: 0,
    missingEmbeddings: [],
    staleEmbeddings: [],
    orphanedEmbeddings: [],
  };

  // Get all knowledge base files
  const files = await glob(EMBEDDABLE_CONTENT);
  report.totalDocuments = files.length;

  // Check each file has embeddings
  for (const file of files) {
    const embeddings = await getDocumentEmbeddings(file);

    if (embeddings.length === 0) {
      report.missingEmbeddings.push(file);
    } else {
      report.embeddedDocuments++;

      // Check if embedding is stale (file modified after embedding)
      const fileModified = await getFileModifiedTime(file);
      const embeddingUpdated = embeddings[0].updated_at;

      if (fileModified > embeddingUpdated) {
        report.staleEmbeddings.push(file);
      }
    }
  }

  // Find orphaned embeddings (no matching file)
  const allEmbeddings = await getAllEmbeddingPaths();
  for (const embPath of allEmbeddings) {
    if (!files.includes(embPath)) {
      report.orphanedEmbeddings.push(embPath);
    }
  }

  // Auto-fix issues
  if (report.missingEmbeddings.length > 0 || report.staleEmbeddings.length > 0) {
    await fixEmbeddingIssues(report);
  }

  return report;
}

interface IntegrityReport {
  totalDocuments: number;
  embeddedDocuments: number;
  missingEmbeddings: string[];
  staleEmbeddings: string[];
  orphanedEmbeddings: string[];
}
```

---

## Embedding Update Flow

### On Content Change

```
┌─────────────────┐
│ Knowledge Base  │
│    Updated      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Change Detected │────▶│ Queue Embedding │
│   (File Watch)  │     │      Job        │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Chunk Content  │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Generate      │
                        │   Embeddings    │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Update Vector   │
                        │     Index       │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Log & Notify   │
                        └─────────────────┘
```

### File Watcher Implementation

```typescript
import { watch } from 'chokidar';

function initKnowledgeWatcher(): void {
  const watcher = watch('knowledge/**/*', {
    ignored: /(^|[\/\\])\../,     // Ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', (path) => queueEmbeddingUpdate(path, 'create'))
    .on('change', (path) => queueEmbeddingUpdate(path, 'update'))
    .on('unlink', (path) => queueEmbeddingUpdate(path, 'delete'));
}

async function queueEmbeddingUpdate(
  path: string,
  action: 'create' | 'update' | 'delete'
): Promise<void> {
  // Skip non-embeddable content
  if (!isEmbeddable(path)) return;

  // Debounce rapid changes (e.g., during file save)
  await debounce(`embedding:${path}`, 1000);

  await jobQueue.add('update_embedding', {
    path,
    action,
    triggeredAt: new Date(),
  });
}
```

---

## Performance Considerations

### Embedding Generation Batching

```typescript
const EMBEDDING_BATCH_SIZE = 100;  // OpenAI limit
const EMBEDDING_RATE_LIMIT = 3000; // Per minute

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batches: string[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    batches.push(texts.slice(i, i + EMBEDDING_BATCH_SIZE));
  }

  const results: number[][] = [];

  for (const batch of batches) {
    const embeddings = await embeddingProvider.embed(batch);
    results.push(...embeddings);

    // Rate limit compliance
    if (batches.length > 1) {
      await sleep(60000 / (EMBEDDING_RATE_LIMIT / EMBEDDING_BATCH_SIZE));
    }
  }

  return results;
}
```

### Query Embedding Caching

```typescript
import { LRUCache } from 'lru-cache';

// Cache recent query embeddings (identical queries reuse embedding)
const queryEmbeddingCache = new LRUCache<string, number[]>({
  max: 1000,
  ttl: 3600000,  // 1 hour
});

async function getQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = hashString(query.toLowerCase().trim());

  let embedding = queryEmbeddingCache.get(cacheKey);
  if (!embedding) {
    embedding = await embeddingProvider.embed([query]).then(r => r[0]);
    queryEmbeddingCache.set(cacheKey, embedding);
  }

  return embedding;
}
```

### Index Performance

```typescript
// sqlite-vec performance characteristics
// - Query time: O(n) for brute force, O(log n) with HNSW index
// - Insert time: O(1) amortized
// - Memory: ~2KB per vector (512 dims * 4 bytes)

// For <100K vectors, brute force is fast enough (<100ms)
// For >100K vectors, consider HNSW index (future optimization)

const VECTOR_COUNT_THRESHOLD = 100000;

async function checkIndexStrategy(): Promise<void> {
  const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_embeddings_vec').get().count;

  if (count > VECTOR_COUNT_THRESHOLD) {
    console.warn(`Vector count (${count}) exceeds threshold. Consider HNSW index.`);
    // Log for ops team to evaluate
    await createAlert({
      type: 'performance',
      message: `Vector index has ${count} vectors. Performance may degrade.`,
      severity: 'warning',
    });
  }
}
```

---

## Configuration Summary

```yaml
vector_search:
  # Embedding model
  embeddings:
    provider: openai
    model: text-embedding-3-small
    dimensions: 512
    batchSize: 100

    fallback:
      provider: ollama
      model: nomic-embed-text
      dimensions: 768

  # Chunking
  chunking:
    maxTokens: 500
    overlapTokens: 50
    minTokens: 100
    preserveBoundaries: true

  # Retrieval
  retrieval:
    topK: 5
    similarityThreshold: 0.72
    reranking: false
    diversityPenalty: 0.1

  # Content
  content:
    includePaths:
      - "knowledge/faqs/**/*.md"
      - "knowledge/policies/**/*.md"
      - "knowledge/menus/**/*.json"
      - "knowledge/local/**/*.md"
    excludeFromGuests:
      - "knowledge/operational/**/*"

  # Maintenance
  maintenance:
    integrityCheckSchedule: "0 3 * * *"
    cleanupSchedule: "0 4 * * 0"
    watcherEnabled: true

  # Caching
  cache:
    queryEmbeddingTTL: 3600000
    maxCachedQueries: 1000
```

---

## Related

- [AI Engine Component](../../03-architecture/c4-components/ai-engine.md) - RAG integration
- [Database Schema](../database/schema.ts) - `knowledge_embeddings` table
- [ADR-003: Message Queue](../../03-architecture/decisions/003-message-queue.md) - Job queuing
- [Knowledge Base Management](../../03-architecture/c4-components/ai-engine.md#knowledge-base-management)
