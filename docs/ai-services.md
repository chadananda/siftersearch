# AI Services Configuration

This document describes the AI service abstraction layer used by SifterSearch. Services are defined by **capability tokens** rather than specific model names, allowing easy swapping of implementations.

## Service Types

| Service | Purpose | Use Cases |
|---------|---------|-----------|
| `fast` | Quick responses, simple tasks | Search planning, query classification, simple extraction |
| `balanced` | Good quality + reasonable speed | Passage analysis, re-ranking, summarization |
| `quality` | Best results, speed less critical | Complex reasoning, translation, librarian tasks |
| `creative` | More varied, expressive outputs | Welcome messages, conversational responses |
| `embedding` | Text embeddings for semantic search | Document indexing, similarity search |
| `local-llm` | Local vLLM inference | Object extraction, enrichment (prefix-cached) |

## Current Configuration

*Last updated: April 2026*

### Fast Service
**Purpose:** Quick responses for simple tasks (~1-3s response time)

| Mode | Provider | Model | Notes |
|------|----------|-------|-------|
| **Remote** | OpenAI | `gpt-4o-mini` | Fast, cheap OpenAI chat model |
| **Local** | Ollama | `qwen2.5:7b` | Fast, good for simple JSON tasks |

**Used by:**
- ResearcherAgent (search planning)
- MemoryAgent (topic extraction)
- Parallel analyzer (batch passage analysis)

---

### Balanced Service
**Purpose:** Good quality with reasonable speed (~3-5s response time)

| Mode | Provider | Model | Notes |
|------|----------|-------|-------|
| **Remote** | OpenAI | `gpt-4o-mini` | Good quality, reasonable cost |
| **Local** | Ollama | `qwen2.5:14b` | Good balance of quality/speed |

**Used by:**
- Default for BaseAgent
- General-purpose analysis

---

### Quality Service
**Purpose:** Best results when speed is less critical (~5-10s response time)

| Mode | Provider | Model | Notes |
|------|----------|-------|-------|
| **Remote** | OpenAI | `gpt-4o` | Best OpenAI model |
| **Local** | Ollama | `qwen2.5:32b` | Largest local model |

**Used by:**
- LibrarianAgent (document analysis, categorization)
- Translation service
- Complex reasoning tasks

---

### Creative Service
**Purpose:** More varied, expressive outputs

| Mode | Provider | Model | Notes |
|------|----------|-------|-------|
| **Remote** | Anthropic | `claude-3-haiku-20240307` | Natural, conversational |
| **Local** | Ollama | `qwen2.5:14b` | With higher temperature |

**Used by:**
- Session intro generation
- Conversational responses
- Chatbot chat mode (see [chatbot-personality.md](chatbot-personality.md) for personality and conversation strategy)

---

### Embedding Service

**IMPORTANT:** Must use the SAME embedding model for both document indexing AND search queries. Dimensions must match for vector similarity to work correctly.

For a **classical religious library**, embedding quality matters greatly. Religious texts contain:
- Nuanced spiritual meanings ("divine love" vs "human love")
- Archaic language and terminology
- Metaphors and allegories
- Cross-traditional concepts

| Mode | Provider | Model | Source dims | Stored dims | Notes |
|------|----------|-------|-------------|-------------|-------|
| **Both** | OpenAI | `text-embedding-3-large` | 3072 | 512 | Matryoshka truncation, L2 normalized |

**Stored in:** `embedding_cache.db` (separate database, deduplicated by normalized text hash)

**Why 512-dim instead of 3072?**

512 dimensions via Matryoshka truncation from 3072 provides excellent retrieval quality at 1/6 the storage and bandwidth cost. The truncated dimensions are L2-normalized to preserve cosine similarity. For ~2.5M paragraphs this is a critical efficiency gain with minimal quality loss — Matryoshka models are explicitly trained for this truncation pattern.

**Why `embedding_cache.db` instead of `content.embedding` column?**

1. **Deduplication**: identical paragraphs across traditions share one embedding entry (keyed by `normalized_hash`)
2. **Separation of concerns**: sifter.db stays focused on content; embedding_cache.db is a pure KV cache
3. **Rebuild capability**: drop and rebuild embedding_cache.db independently
4. **Consistency**: same normalized text always maps to the same embedding

**Used by:**
- Document indexing (pushed to Meilisearch `paragraphs` index)
- Search query embedding

---

### Local LLM Service (vLLM)

**Purpose:** Batch AI processing for layered indexing — object extraction and document enrichment.

| Provider | Host | Model | Notes |
|----------|------|-------|-------|
| vLLM | `boss` (Tailscale) | `Qwen3-32B-AWQ` | Port 8000, prefix caching enabled |

**Used by:**
- Object extraction (`api/lib/object-extraction.js`) — entity/concept extraction from paragraphs
- Enrichment runner (`api/lib/enrichment-runner.js`) — disambiguation + HyPE questions

**Why a separate local LLM service for indexing?**

The layered indexing pipeline makes thousands of LLM calls per indexing run. Using a local vLLM server:
- Eliminates per-token API costs for bulk indexing work
- Enables **prefix caching** — deterministic prompt blocks share KV cache across requests
- The `boss` server (Strix Halo + GPU) handles this workload without impacting search latency

---

## Prefix Caching Strategy

The enrichment prompts (`api/lib/enrichment-prompts.js`) are engineered for maximum vLLM KV cache hits:

```
Prompt structure (most stable → least stable):
1. Instructions block     → never changes (100% cache hit after first call)
2. Book metadata block    → same for all paragraphs in a document
3. Window of paragraphs   → changes per window position
4. Target paragraph block → changes per paragraph
```

Each block has an MD5 hash. When all hashes match a previous call, the entire prefix is served from the vLLM KV cache with near-zero compute cost.

**Window sizing** (`api/lib/window-sizer.js`): dynamically computes window N based on available KV token budget (default 8K), ensuring prompts never exceed the limit while maximizing context.

---

## Usage

```javascript
import { aiService, getEmbeddingDimensions } from './lib/ai-services.js';

// Chat completions by capability
const response = await aiService('fast').chat([
  { role: 'user', content: 'Classify this query...' }
]);

// Embeddings — same model for both indexing and search
// Returns 512-dim Float32Array via embedding_cache.db
const queryEmbedding = await aiService('embedding').embed('what is divine love');

// Get embedding dimensions for vector storage config
const dims = getEmbeddingDimensions('embedding'); // 512

// Force local even in dev mode
const localResponse = await aiService('fast', { forceLocal: true }).chat(messages);

// Force remote even in production
const remoteEmbedding = await aiService('embedding', { forceRemote: true }).embed(text);
```

## Mode Selection

- **Dev mode** (`DEV_MODE=true`): Uses remote APIs for development
- **Production** (`DEV_MODE=false`): Uses local Ollama models for chat; vLLM for indexing

Override with options:
- `{ forceLocal: true }` — Force local even in dev
- `{ forceRemote: true }` — Force remote even in prod

## Layered Indexing AI Flow

```
Object Extraction (per paragraph):
  → vLLM (Qwen3-32B-AWQ) via api/lib/object-extraction.js
  → JSON with 6 arrays: people, places, concepts, texts, events, relations
  → Stored in content_objects (sifter.db) + graph_entities/relations (graph.db)

Enrichment (per paragraph with sliding window context):
  → vLLM (Qwen3-32B-AWQ) via api/lib/enrichment-runner.js
  → Two passes per paragraph: 'context' (disambiguation) + 'hype' (hypothetical questions)
  → Prefix-cached prompt blocks for efficiency
  → Stored in content_enrichment (sifter.db)
```

## Updating Models

When updating models, consider:

1. **Speed vs Quality tradeoff** — Test response times
2. **Cost** — Check pricing for remote APIs
3. **Context length** — Ensure model supports prompt sizes (enrichment prompts can be large)
4. **Output format** — Test JSON output reliability (object extraction requires strict JSON)
5. **Prefix caching compatibility** — vLLM prefix caching requires deterministic prompts
6. **Embedding dimensions** — Changing embedding model requires re-indexing all documents AND rebuilding embedding_cache.db

### Model Update Checklist

1. Update `SERVICE_CONFIG` in `api/lib/ai-services.js`
2. Test with representative queries
3. Run benchmark to compare speed
4. For embedding changes: bump pipeline version to trigger re-embedding
5. Update this documentation
6. Deploy and monitor

## Performance Targets

| Service | Target Response Time | Acceptable Range |
|---------|---------------------|------------------|
| fast | < 2s | 1-3s |
| balanced | < 4s | 3-6s |
| quality | < 8s | 5-12s |
| creative | < 3s | 2-5s |
| embedding | < 1s | 0.5-2s |
| local-llm (enrichment) | < 5s | 2-10s |

If response times consistently exceed acceptable range, consider:
1. Switching to a faster model
2. Reducing prompt complexity
3. Tuning window-sizer KV budget
4. Verifying vLLM prefix cache hit rate (check boss server logs)
