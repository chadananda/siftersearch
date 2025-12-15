# AI Services Configuration

This document describes the AI service abstraction layer used by SifterSearch. Services are defined by **capability tokens** rather than specific model names, allowing easy swapping of implementations.

## Service Types

| Service | Purpose | Use Cases |
|---------|---------|-----------|
| `fast` | Quick responses, simple tasks | Search planning, query classification, simple extraction |
| `balanced` | Good quality + reasonable speed | Passage analysis, re-ranking, summarization |
| `quality` | Best results, speed less critical | Complex reasoning, translation, librarian tasks |
| `creative` | More varied, expressive outputs | Welcome messages, conversational responses |
| `embedding` | Text embeddings for semantic search | Document indexing, memory storage, similarity search |

## Current Configuration

*Last updated: December 2024*

### Fast Service
**Purpose:** Quick responses for simple tasks (~1-3s response time)

| Mode | Provider | Model | Notes |
|------|----------|-------|-------|
| **Remote** | OpenAI | `gpt-3.5-turbo` | Fastest, cheapest OpenAI chat model |
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

---

### Embedding Service

**IMPORTANT:** Must use the SAME embedding model for both document indexing AND search queries. Dimensions must match for vector similarity to work correctly.

For a **classical religious library**, embedding quality matters greatly. Religious texts contain:
- Nuanced spiritual meanings ("divine love" vs "human love")
- Archaic language and terminology
- Metaphors and allegories
- Cross-traditional concepts

Remote embeddings (OpenAI) capture wider semantic facets because they're trained on massive, diverse corpora including religious and philosophical works. Higher dimensions = more nuanced meaning representation.

| Mode | Provider | Model | Dimensions | Notes |
|------|----------|-------|------------|-------|
| **Both** | OpenAI | `text-embedding-3-large` | 3072 | Best semantic quality - no local alternative |

**Used by:**
- Document indexing (building the search corpus)
- Search query embedding
- MemoryAgent (conversation search)

**Why `text-embedding-3-large` with no local option?**

Embedding quality is **foundational**. Poor initial retrieval cannot be fixed by re-ranking or analysis - garbage in, garbage out. For a classical religious library, we need maximum semantic precision to distinguish:
- Nuanced spiritual concepts ("divine love" vs "human love")
- Archaic language and terminology
- Metaphors and allegories across traditions
- Cross-traditional concepts with similar names but different meanings

Local embedding models (768-1024 dims) simply don't have the semantic resolution needed for this domain. The cost (~$0.13/1M tokens) is justified.

**Future consideration:** If better embedding models emerge (OpenAI or otherwise), we will evaluate and re-index if the quality improvement warrants it.

**Note:** Changing embedding models requires re-indexing all documents.

---

## Usage

```javascript
import { aiService, getEmbeddingDimensions } from './lib/ai-services.js';

// Chat completions by capability
const response = await aiService('fast').chat([
  { role: 'user', content: 'Classify this query...' }
]);

// Embeddings - same model for both indexing and search
const docEmbeddings = await aiService('embedding').embed([
  'paragraph 1 text...',
  'paragraph 2 text...'
]);
const queryEmbedding = await aiService('embedding').embed('what is divine love');

// Get embedding dimensions for vector storage config
const dims = getEmbeddingDimensions('embedding'); // 1536 (remote) or 768 (local)

// Force local even in dev mode
const localResponse = await aiService('fast', { forceLocal: true }).chat(messages);

// Force remote even in production
const remoteEmbedding = await aiService('embedding', { forceRemote: true }).embed(text);
```

## Mode Selection

- **Dev mode** (`DEV_MODE=true`): Uses remote APIs for development
- **Production** (`DEV_MODE=false`): Uses local Ollama models

Override with options:
- `{ forceLocal: true }` - Force local even in dev
- `{ forceRemote: true }` - Force remote even in prod

## Updating Models

When updating models, consider:

1. **Speed vs Quality tradeoff** - Test response times
2. **Cost** - Check pricing for remote APIs
3. **Context length** - Ensure model supports your prompt sizes
4. **Output format** - Test JSON output reliability
5. **Local availability** - Ensure model runs on target hardware

### Benchmarking

Run the benchmark script to compare options:

```bash
node scripts/benchmark-search.js
```

### Model Update Checklist

1. Update `SERVICE_CONFIG` in `api/lib/ai-services.js`
2. Test with representative queries
3. Run benchmark to compare speed
4. Update this documentation
5. Deploy and monitor

## Alternative Models to Consider

### Fast (alternatives)
- `gpt-4o-mini` - Slightly better quality, similar speed
- `mistral-7b` - Good local alternative
- `phi-3` - Microsoft's fast small model

### Quality (alternatives)
- `claude-3-5-sonnet` - Excellent reasoning
- `gpt-4-turbo` - Faster than gpt-4o
- `llama3:70b` - Large local model

### Embedding (alternatives)
- `text-embedding-3-large` - Higher quality, more dimensions
- `mxbai-embed-large` - Good local alternative
- `bge-large` - Popular open-source option

---

## Performance Targets

| Service | Target Response Time | Acceptable Range |
|---------|---------------------|------------------|
| fast | < 2s | 1-3s |
| balanced | < 4s | 3-6s |
| quality | < 8s | 5-12s |
| creative | < 3s | 2-5s |
| embedding | < 1s | 0.5-2s |

If response times consistently exceed acceptable range, consider:
1. Switching to a faster model
2. Reducing prompt complexity
3. Adding caching layer
