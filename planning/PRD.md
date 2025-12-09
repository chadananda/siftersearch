# Sifter Search PRD
**AI-Powered Interfaith Library Search System**

Version: 1.0
Owner: Chad
Domain: siftersearch.com
Repository: https://github.com/chadananda/siftersearch
Status: Pre-Development

---

## Overview

Personal semantic search system for a multilingual interfaith library (1,000+ documents, growing 200+/month). Provides intelligent search orchestrated by AI ("Sifter") across books, papers, and websites in multiple religions and languages.

**Key Architectural Decision: Local-First AI with Tier-Based Providers**
- **Regular users**: Ollama (qwen2.5:32b) - free, local, private
- **Patron supporters** ($80/month): Claude Sonnet 4 for orchestration, Ollama for re-ranking
- **Institutional** ($120/month): Same as Patron tier (libraries, universities, research centers)
- **Admin**: Claude Sonnet 4 for all operations (best quality)
- **Flexibility**: Easy to switch providers if Ollama quality insufficient
- **Hardware**: Framework Desktop with AMD Ryzen 365+ and 96GB VRAM - runs Ollama efficiently
- Only embeddings use OpenAI API (text-embedding-3-large) - no cost-effective local alternative
- Translation uses OpenAI GPT-4 with Shoghi Effendi style prompt for classical religious texts
- Complete privacy for regular users: library content never leaves your infrastructure

**Access:** Small trusted community (50-100 users max)
**Scope:** Not built to scale, optimized for quality over quantity

---

## About

**Individual Initiative:** Sifter Search is an individual initiative by Chad Jones for individual and personal research only. This is not an institutional project or commercial service.

**Personal Research Use:** The library and search system are provided for personal scholarly research and educational purposes. Users are expected to respect copyright and use materials appropriately.

**Community-Supported:** Operating costs are supported by voluntary contributions from users who find value in the service. All access remains free regardless of contribution status.

---

## Core Principles

1. **Files on disk = source of truth** - Everything rebuildable from `/storage/sources/`
2. **AI orchestration** - Sifter understands queries, executes searches, re-ranks, analyzes
3. **Paragraph-level indexing** - Semantic units, not arbitrary chunks
4. **Mobile-first** - Excellent experience on phone and desktop
5. **Privacy-first** - Data never leaves your infrastructure, optional supporter transparency
6. **Collaborative curation** - Users contribute documents with AI-assisted metadata

---

## AI Provider Strategy

### Tiered Intelligence System

**Why tiered providers?**
- Ollama qwen2.5:32b (local, free) is very good but not quite Claude Sonnet 4 quality
- Admin needs best possible results for complex interfaith queries
- Patron supporters ($80/month) deserve premium quality as thank-you
- Regular users get excellent free service
- Easy to switch if Ollama proves insufficient

**User Tier Mapping:**

```
Admin (Chad)
  ├─ Single active session (logout other devices)
  ├─ No rate limits
  └─ Full API access

Patron ($80/month supporters)
  ├─ Single active session
  ├─ Rate limit: 100/hour
  └─ Premium AI models

Institutional ($120/month - libraries, universities)
  ├─ Single active session
  ├─ Rate limit: 100/hour
  └─ Premium AI models (same as Patron)

Approved (regular users)
  ├─ Single active session
  ├─ Rate limit: 60/hour
  └─ Local AI models

Verified (pending approval)
  ├─ Single active session
  ├─ Rate limit: 10/hour (total 10 searches)
  └─ Limited features
```

**Session Enforcement:**
- Each login invalidates previous sessions
- Prevents account sharing
- Avoids conversation conflicts
- User warned before logout: "Login from new device detected"

**Rate Limiting by Tier:**
- Verified: 10 searches total, 1 per 6 minutes
- Approved: 60/hour
- Patron: 100/hour
- Institutional: 100/hour
- Admin: Unlimited

**Sifter Internet Access:**
- Web search for current information
- Fetch book covers from Open Library, Google Books
- Download referenced resources
- Research mode can cite external sources
  ├─ Orchestration: Claude Sonnet 4 (best reasoning)
  ├─ Re-ranking: Claude Sonnet 4 (nuanced relevance)
  ├─ Analysis: Claude Sonnet 4 (deep synthesis)
  ├─ Cost: ~$0.50 per research query
  └─ Fallback: Ollama if API unavailable

Patron ($80/month supporters)
  ├─ Orchestration: Claude Sonnet 4 (premium search strategy)
  ├─ Re-ranking: Ollama qwen2.5:32b (still excellent)
  ├─ Analysis: Ollama qwen2.5:32b (good quality)
  ├─ Cost: ~$0.15 per query (70% savings)
  └─ Fallback: Full Ollama stack

Approved (regular users)
  ├─ All operations: Ollama qwen2.5:32b
  ├─ Cost: $0 marginal cost
  ├─ Quality: 85-90% of Claude for most queries
  └─ Hardware: Runs fast on 96GB VRAM

Verified (pending approval)
  ├─ All operations: Ollama qwen2.5:14b (smaller, faster)
  ├─ Limited to 10 searches
  └─ Incentive to complete approval
```

**Shared services (all tiers):**
- Embeddings: OpenAI text-embedding-3-large (no good local alternative)
- Translation: OpenAI GPT-4 (best for classical Arabic/Farsi)
- Moderation: Ollama qwen2.5:14b (fast, local)

### Switching Providers

**Configuration-driven (no code changes):**

In `config.yaml`:
```json
{
  "sifter": {
    "dev_mode": false,  // true = use API for orchestration (laptop dev)

    "models": {
      "tiers": {
        "admin": {
          "orchestration": "anthropic:claude-sonnet-4",
          "reranking": "anthropic:claude-sonnet-4",
          "analysis": "anthropic:claude-sonnet-4"
        },
        "patron": {
          "orchestration": "anthropic:claude-sonnet-4",
          "reranking": "local:qwen2.5:32b",
          "analysis": "local:qwen2.5:32b"
        },
        "approved": {
          "orchestration": "local:qwen2.5:32b",
          "reranking": "local:qwen2.5:32b",
          "analysis": "local:qwen2.5:32b"
        }
      }
    },
    "providers": {
      "ollama": {...},
      "anthropic": {"api_key": "${ANTHROPIC_API_KEY}"},
      "openai": {"api_key": "${OPENAI_API_KEY}"}
    }
  }
}
```

**To switch providers:**

```bash
# Test Ollama quality for admin tier
nano config.yaml  # Change admin orchestration to "local:qwen2.5:32b"
pm2 restart sifter-api

# Run test queries
# If quality acceptable → Keep Ollama (huge cost savings!)
# If not satisfactory → Revert to Claude

# Or switch to OpenAI GPT-4
nano config.yaml  # Change to "openai:gpt-4o"
pm2 restart sifter-api
```

**No code changes required** - just update config, restart.

### Provider Selection Logic

```javascript
// lib/ai.js - Automatic provider selection
export const getProvider = (user, operation) => {
  const tier = user.tier  // 'admin', 'patron', 'approved', 'verified'
  const config = sifter.models.tiers[tier]
  const [provider, model] = config[operation].split(':')

  return {
    provider,  // 'anthropic', 'openai', or 'ollama'
    model,     // 'claude-sonnet-4', 'gpt-4o', 'qwen2.5:32b'
    fallback: (tier === 'admin' || tier === 'patron')
      ? {provider: 'ollama', model: 'qwen2.5:32b'}
      : null
  }
}

// Usage in services/sifter.js
export const analyzeQuery = async (query, history, user) => {
  const {provider, model, fallback} = getProvider(user, 'orchestration')

  try {
    return await ai[provider].generate({model, prompt: buildPrompt(query)})
  } catch (error) {
    if (fallback) {
      logger.warn('Primary AI failed, using fallback', {provider, error})
      return await ai[fallback.provider].generate({
        model: fallback.model,
        prompt: buildPrompt(query)
      })
    }
    throw error
  }
}
```

### Hardware Optimization

**Framework Desktop (AMD Ryzen 365+ with 96GB VRAM):**

Current plan: qwen2.5:32b
```
- Optimized for AMD GPU architecture
- ~1-2s per query
- Handles concurrent requests
- Quality: 85-90% of Claude
```

Optional upgrade: qwen2.5:70b or llama3.1:70b
```
- Near Claude-quality
- ~2-3s per query (still fast with 96GB VRAM)
- Quality: 92-95% of Claude
- Worth testing if 32b insufficient
```

**Testing strategy:**
1. Start with qwen2.5:32b for all users
2. Monitor search quality (user feedback, admin review)
3. If quality issues:
   - Admin/patrons: Switch to Claude (can afford with donations)
   - Regular users: Upgrade to qwen2.5:70b (still free, better quality)
4. Adjust based on results and budget

### Cost Analysis

**Scenario A: All Ollama (if quality acceptable)**
```
Monthly costs:
- Embeddings: $140
- Translation: $15
Total: $155/month

Revenue:
- 5 patrons × $80 = $400

Net: +$245/month surplus
```

**Scenario B: Tiered (current plan)**
```
Assumptions:
- 1 admin, 5 patrons, 44 regular users
- 40 searches/user/month = 2000 total
- Admin: 40 searches, Patrons: 200 searches with Claude orchestration

Monthly costs:
- Embeddings: $140
- Claude orchestration (240 searches × $0.20): $48
- Claude re-ranking (40 searches × $0.10): $4
- Translation: $15
Total: $207/month

Revenue:
- 5 patrons × $80 = $400

Net: +$193/month surplus
```

**Scenario C: All Claude (if Ollama fails)**
```
Monthly costs:
- Embeddings: $140
- Claude all operations (2000 searches × $0.30): $600
- Translation: $15
Total: $755/month

Revenue needed:
- $755 ÷ 80 = 9.4 patrons minimum
- Or charge all users $15/month

Feasible but expensive
```

**Recommendation:** Start with Scenario B (tiered). If Ollama quality is excellent, move to Scenario A. Only resort to Scenario C if Ollama proves insufficient.

### Provider Comparison

| Provider | Quality | Speed | Cost/Query | Best For |
|----------|---------|-------|------------|----------|
| Claude Sonnet 4 | 100% | ~2s | $0.30 | Admin, complex queries |
| GPT-4o | 95% | ~1.5s | $0.20 | Alternative to Claude |
| Ollama 70b | 92% | ~2.5s | $0 | High quality, local |
| Ollama 32b | 88% | ~1.5s | $0 | Good quality, fast |
| Ollama 14b | 80% | ~0.8s | $0 | Pending users, moderation |

*Quality percentages relative to Claude Sonnet 4 for interfaith research queries

### Pluggable Local AI Engines

**Supported engines:**
- Ollama (default, easiest)
- LM Studio (GUI, easy testing)
- llama.cpp (lightweight, fast)
- vLLM (production, fastest)

**Switch engines in config:**
```json
{"providers": {"local": {"engine": "lmstudio", "host": "http://localhost:1234"}}}
```

**Adapter pattern:** `lib/ai.js` abstracts engine differences. Add new engines by implementing `generate()` interface.

---

## Architecture

### Technology Stack

**Frontend:**
- Astro (static generation)
- Svelte (interactive components)
- WebGL (organic flowing liquid background animation)
- Tailwind CSS + Headless UI
- CSS Variables (theming)

**Backend:**
- Node.js + Fastify (API)
- Meilisearch (hybrid keyword + vector search)
- Turso/libsql (user data, forum, analytics - auto-backed up)
- Cloudflare Tunnel (secure exposure)
- Cloudflare Pages (frontend hosting)

**AI/Processing:**
- **Local AI Engine** (Ollama/LMStudio/llama.cpp/vLLM) - Orchestration, re-ranking, analysis
  - Model: `qwen2.5:32b` or `llama3.1:70b` (high quality, runs locally)
  - Fallback: `qwen2.5:14b` if RAM constrained
  - Pluggable: Easy to switch engines via config
- OpenAI text-embedding-3-large (3072-dim vectors)
  - Only for embeddings (can't run large embedding models locally efficiently)
- **OpenAI GPT-4** (translation)
  - Best for classical Arabic/Farsi with proper context understanding
  - Handles literary/religious register better than alternatives
  - Cost: ~$0.01 per 1K tokens (acceptable for occasional translation)
  - Alternative: Local `aya-expanse:32b` via Ollama (free but lower quality)
- @mozilla/readability (HTML extraction)
- Mammoth (DOCX → MD)
- pdf-parse (PDF extraction)
- unified/remark (HTML → MD)

**Infrastructure:**
- Framework Desktop with AMD Ryzen 365+ processor
- 96GB dedicated VRAM (GPU memory for local AI models)
- System RAM separate from VRAM allocation
- Local compute for all processing
- Library files in Dropbox (auto-backed up)

### System Components

```
┌─────────────────────────────────────────┐
│  Cloudflare Pages (siftersearch.com)    │
│  Astro + Svelte UI                      │
└───────────────┬─────────────────────────┘
                │ HTTPS
                ↓
┌─────────────────────────────────────────┐
│  Cloudflare Tunnel                      │
└───────────────┬─────────────────────────┘
                │
                ↓
┌─────────────────────────────────────────┐
│  Framework Desktop (Local)              │
│  ┌───────────────────────────────────┐  │
│  │ Fastify API Server (Port 3000)    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Sifter (AI Orchestration)         │  │
│  │ - Query analysis                  │  │
│  │ - Search strategy                 │  │
│  │ - Re-ranking                      │  │
│  │ - Analysis & synthesis            │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Meilisearch (Port 7700)           │  │
│  │ - Hybrid search (keyword+vector)  │  │
│  │ - Paragraph-level index           │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Turso/libsql                      │  │
│  │ - User data                       │  │
│  │ - Forum posts                     │  │
│  │ - Analytics                       │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Processing Pipeline               │  │
│  │ - Document conversion             │  │
│  │ - Embedding generation            │  │
│  │ - Indexing queue                  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Website Spider                    │  │
│  │ - Polite scraping                 │  │
│  │ - Asset downloads                 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Storage Architecture

### Directory Structure

```
/storage/
├── sources/                    # Source of truth (in Dropbox)
│   ├── library/                # Approved library
│   │   └── [Religion]/[Collection]/
│   │       ├── document.pdf
│   │       ├── document.yaml   # Metadata
│   │       └── cover.jpg
│   ├── staging/                # User contributions pending approval
│   │   └── [user_id]/[upload_id]/
│   │       ├── original.pdf
│   │       ├── metadata.json
│   │       └── preview.md
│   └── scraped/                # Website mirrors
│       └── [domain]/
│           ├── page.html
│           ├── page.yaml
│           └── assets/
├── processed/                  # Intermediate documents (rebuildable)
│   └── [mirrors library structure]
│       └── document.md         # Markdown + YAML frontmatter
├── embeddings/                 # Cached vectors (rebuildable)
│   └── [doc_id].json
└── temp/                       # Temporary processing
```

### File Flow

**User Upload:**
```
original.pdf → /staging/user_123/upload_456/
  ↓ AI analysis
metadata.json (extracted/confirmed)
  ↓ conversion
preview.md
  ↓ admin approval
/library/Islam/Doctrinal/quran-yusuf-ali.pdf
  ↓ processing
/processed/Islam/Doctrinal/quran-yusuf-ali.md
  ↓ indexing
Meilisearch (paragraph-level entries)
```

**Website Scraping:**
```
Download HTML → /scraped/bahai.org/page-123.html
Download assets → /scraped/bahai.org/assets/
  ↓ Readability extraction
Clean HTML
  ↓ conversion
/processed/[Religion]/Websites/[site]/page-123.md
  ↓ localize asset paths in markdown
  ↓ indexing
Meilisearch
```

---

## Library Organization

### Hierarchical Structure

Filesystem defines taxonomy:

```
/library/
├── Bahá'í Faith/
│   ├── Doctrinal/
│   ├── Eyewitness Accounts/
│   ├── Thesis and Papers/
│   ├── Newspapers/
│   ├── Lectures/
│   └── Websites/
├── Islam/
│   ├── Doctrinal/
│   ├── Eyewitness Accounts/
│   └── ...
├── Christianity/
├── Judaism/
├── Sikhism/
└── Interfaith/
```

**Folder = Metadata:**
- Religion derived from parent folder
- Collection derived from subfolder
- No redundant metadata in YAML

### Document Metadata (YAML)

**Minimal YAML (only what can't be inferred):**

```yaml
---
# Core
title: "The Book of Certitude"
original_title: "کتاب ایقان"
author: "Bahá'u'lláh"
year: 1862
language: "en"
original_language: "fa"

# Optional enrichment
isbn: "0877431612"
translator: "Shoghi Effendi"
publisher: "Bahá'í Publishing Trust"
edition: "1985"

# Processing hints
ocr_required: false
segmentation_required: false  # For classical Arabic/Farsi

# Relationships
related_documents:
  - id: "doc_789"
    relation: "translation"
    language: "ar"
  - id: "doc_456"
    relation: "commentary"

# Categorization
tags: ["theology", "prophecy"]
---
```

**Not in YAML:** religion, collection, file_path, cover_image (auto-discovered)

### Website Configuration

One YAML per website/section in collection folder:

```yaml
# /library/Bahá'í Faith/Websites/Reference Library.yaml
---
name: "Bahá'í Reference Library"
base_url: "https://www.bahai.org/library/"
update_frequency: "weekly"
crawl_delay: 1.0
max_concurrent: 3

sections:
  - path: "/writings-bahaullah/"
    include_selectors:
      - "article.main-content"
    exclude_selectors:
      - "nav"
      - "footer"
---
```

**Website splitting:** Same site can appear in multiple religions/collections by creating separate YAML files pointing to different sections.

---

## Document Processing

### Document Metadata Structure

Based on existing library format:

```yaml
---
id: author__title__isbn__lang
title: The Prince of Martyrs
author: Abu'l-Qásim Faizi
year: 1977
language: en
originalLanguage: English
publisher: George Ronald
access: encumbered  # or 'public'
priority: 10  # Display ranking
wordsCount: 15473

abstract: Historical account description...

topics:
  - Imam Husayn
  - Islamic History
  - Martyrdom

documentType: Bahai_Books  # or Islamic_Text, Christian_Text, etc
classification:
  weight: 2
  confidence: High
  reasoning: Brief explanation...
---
```

**Required fields:** id, title, author, year, language
**Auto-generated:** wordsCount, id (if missing)
**AI-enhanced:** abstract, topics, classification
**Legacy fields removed:** _conversionOpts, ocnmd_version, _convertedFrom

### Paragraph-Based Indexing

Documents split by semantic units (paragraphs), not arbitrary chunks. Minimum 50 chars per paragraph. Index includes heading context, section, and page estimates.

### Classical Text Segmentation

For unpunctuated Arabic/Farsi texts:
1. Auto-detect need (punctuation ratio <1%)
2. AI segments into logical paragraphs
3. Store in `/processed/`
4. Never modify original
5. Cache segmentation (reuse if prompt unchanged)

### Cover Image Management

**Automatic Cover Fetching:**
- Runs during idle periods (no active queries)
- Searches Open Library, Google Books by ISBN/title/author
- Downloads and resizes to standard dimensions
- Stores alongside document YAML
- Logs missing covers for manual review
- Respects API rate limits (100/day per service)

**Priority Order:**
1. ISBN match (most reliable)
2. Title + author match
3. Title match (manual verification needed)
4. Leave blank if no confident match

### Meilisearch Document Structure

Each paragraph indexed separately:

```javascript
{
  // IDs
  id: "doc_123_para_5",
  document_id: "doc_123",
  paragraph_id: 5,

  // Content
  text: "The concept of divine unity...",

  // Metadata (inherited from document)
  title: "Islamic Theology Introduction",
  author: "Scholar Name",
  religion: "Islam",
  collection: "Doctrinal",
  language: "en",
  year: 2015,

  // Context
  section: "Chapter 2: Divine Attributes",
  heading: "Unity and Oneness",
  page_number: 45,

  // Vectors (Meilisearch manages)
  _vectors: {
    default: [0.123, 0.456, ...]  // 3072-dim
  },

  // Source
  source_type: "pdf",
  source_path: "/storage/sources/library/Islam/Doctrinal/theology.pdf",
  processed_path: "/storage/processed/Islam/Doctrinal/theology.md",

  // Relationships
  related_documents: ["doc_789", "doc_456"]
}
```

### Translation Methodology

**Style:** Classical religious texts translated in the dignified, precise style of Shoghi Effendi's translations.

**Prompt template:**
"Translate this classical [Arabic/Farsi/etc] religious text to [target_language] in the style of Shoghi Effendi's translations of Bahá'í scripture. Maintain dignity, precision, and reverence. Text: [...]"

**Dynamic Translation:**
- Target language from user.preferred_language (default: 'en')
- Translate search results if document.language ≠ user.preferred_language
- Translate Sifter's responses to user's preferred language
- User can switch language mid-conversation: "Respond in Spanish"

**Search Results Display:**

When search hit is in different language than user prefers, display as side-by-side table broken by sentence:

```
┌─────────────────────┬─────────────────────┐
│ Original (Arabic)   │ English             │
├─────────────────────┼─────────────────────┤
│ إن الله واحد.       │ Verily, God is One. │
├─────────────────────┼─────────────────────┤
│ لا شريك له.         │ He has no partner.  │
└─────────────────────┴─────────────────────┘
```

**Process:**
1. Check if hit.language ≠ user.preferred_language
2. Extract relevant passages only (not full documents)
3. Split by sentences
4. Translate each sentence with GPT-4
5. Check cache by content hash per sentence
6. Display as side-by-side table
7. Cache all translations

**Quality priorities:**
- Accuracy over poetry
- Dignity and reverence
- Consistency with established translations
- Preserve original structure when possible

### Processing Pipeline

**Concurrent, non-blocking:**

```
Discovery
  ↓ (file watcher or scheduled scan)
Changed Files Detected
  ↓
Job Queue
  ↓
┌──────────────────┐
│ Priority Queue   │
│ 1. User uploads  │
│ 2. Changed files │
│ 3. Websites      │
│ 4. Background    │
└──────────────────┘
  ↓
Parallel Processing (worker threads)
  ├─ Extract text (PDF/DOCX/HTML)
  ├─ Detect language
  ├─ Segment if needed (classical texts)
  ├─ Convert to markdown
  ├─ Extract paragraphs
  ├─ Generate embeddings (batch)
  ├─ Index to Meilisearch
  └─ Update stats
  ↓
Search immediately available (no blocking)
```

---

## Sifter: AI Search Orchestrator

Sifter is the intelligent conductor, not just a search interface.

### Tier-Based AI Provider Selection

**Automatic provider selection based on user tier:**

```javascript
// Get appropriate AI provider for user
const getAIProvider = user => {
  const tier = user.tier  // 'admin', 'patron', 'approved'
  const config = sifter.models.tiers[tier]

  return {
    orchestration: createProvider(config.orchestration),
    reranking: createProvider(config.reranking),
    analysis: createProvider(config.analysis)
  }
}

// Usage in search pipeline
const ai = getAIProvider(user)
const strategy = await ai.orchestration.analyze(query)
const ranked = await ai.reranking.rerank(results, query)
```

**Provider Tiers:**

| User Tier | Orchestration | Re-ranking | Analysis | Cost/Search |
|-----------|---------------|------------|----------|-------------|
| Admin | Claude Sonnet 4 | Claude Sonnet 4 | Claude Sonnet 4 | ~$0.15 |
| Patron ($80/mo) | Claude Sonnet 4 | Ollama local | Ollama local | ~$0.05 |
| Approved (free) | Ollama local | Ollama local | Ollama local | ~$0.02 |

**Benefits:**
- Easy to switch providers if Ollama quality insufficient
- Admin gets best quality for testing/validation
- Patrons get premium experience as supporter perk
- Most users get free local AI (cost-efficient)
- Can A/B test quality differences between tiers

**Provider Factory:**

```javascript
const createProvider = spec => {
  const [provider, model] = spec.split(':')

  const providers = {
    ollama: () => new OllamaProvider({
      host: config.ollama.host,
      model,
      temperature: 0.1
    }),

    anthropic: () => new AnthropicProvider({
      apiKey: config.anthropic.api_key,
      model: config.anthropic.model
    }),

    openai: () => new OpenAIProvider({
      apiKey: config.openai.api_key,
      model
    })
  }

  return providers[provider]?.() ?? providers.ollama()
}
```

### Search Pipeline

```
User Query
  ↓
┌─────────────────────────────────┐
│ 1. Query Analysis (Sifter)     │
│ - Detect intent                 │
│ - Identify concepts             │
│ - Determine mode (fast/research)│
│ - Generate search strategies    │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ 2. Search Execution             │
│ Fast: 1 query, top 20           │
│ Research: 3-5 queries, top 100  │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ 3. Re-ranking (Sifter)          │
│ - AI scores each result 0-1     │
│ - Filters out irrelevant (<0.3) │
│ - Extracts key 1-3 sentences    │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ 4. Translation (if needed)      │
│ - Detect non-English            │
│ - Translate extracts            │
│ - Cache translations            │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ 5. Analysis (if requested)      │
│ - Synthesize themes             │
│ - Compare perspectives          │
│ - Generate summary              │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ 6. Response Formatting          │
│ - Summary                       │
│ - Top 5-10 results with extracts│
│ - "Show more" option            │
└─────────────────────────────────┘
```

### Search Modes

**Fast Mode (default):**
- Single hybrid search query
- Top 20 results
- Re-rank all 20
- No synthesis
- ~1-2 seconds, ~$0.05

**Research Mode (triggered by keywords like "research", "compare", "find everything"):**
- 3-5 search queries with variations
- Top 100 results combined
- Re-rank in batches
- Synthesis with themes and patterns
- ~2-4 seconds, ~$0.25

### Query Analysis

```javascript
// Sifter analyzes query first
const strategy = await claude.analyze(`
Query: "${userQuery}"
History: ${conversationHistory}

Determine:
1. Mode: "fast" or "research"
2. Concepts: Key search terms and synonyms
3. Search queries: 1-5 queries to execute
4. Filters: religions, collections, languages?
5. Analysis needed: synthesis or just results?

Return JSON.
`)

// Example output
{
  mode: "research",
  intent: "comparative",
  concepts: ["pilgrimage", "hajj", "sacred journey"],
  search_queries: [
    {query: "pilgrimage sacred journey", filters: {religion: ["Islam", "Christianity"]}},
    {query: "hajj Mecca", filters: {religion: "Islam"}},
    {query: "Jerusalem pilgrimage", filters: {religion: ["Christianity", "Judaism"]}}
  ],
  needs_analysis: true,
  expected_results: 15
}
```

### Re-ranking & Extract Generation

**AI scores each result AND extracts relevant sentences:**

```javascript
// Send results to AI for re-ranking
const prompt = `
Query: "${query}"

Score each passage 0.0-1.0 for relevance.
Extract the most relevant 1-3 sentences.
Return only passages with score >= 0.3.

Passages: [...]

Return JSON: [
  {
    index: number,
    relevance_score: 0.0-1.0,
    reason: "why relevant",
    extract: "verbatim 1-3 sentences",
    extract_indices: [start, end]
  }
]
`

// AI returns scored results with extracts
// Users see only the extracted sentences, not full paragraphs
```

### Conversation Memory

**Sifter maintains context across sessions and learns user metadata:**

Conversation storage includes:
- Full message history for context
- Search results for reference
- Extracted metadata (first name, interests, research areas)
- Language preference changes
- User's typical query patterns

**Metadata Extraction:**
During conversation, Sifter notices and stores:
- First name (from "I'm Sarah" or "My name is...")
- Research interests (from query topics)
- Language preference (from query language or explicit request)
- Expertise level (inferred from query complexity)
- Religious tradition background (inferred from focus areas)

**Storage:**
- Conversation: Turso database per session
- User metadata: user.metadata JSON field
- Updated after each meaningful exchange
- Never explicitly asks for information (learns naturally)

**Privacy:**
- User can view/edit stored metadata in settings
- Can request deletion of specific metadata
- Metadata used only to personalize experience

---

## User Contribution System

### Upload Workflow

```
1. User uploads document
   ↓
2. Saved to /staging/user_id/upload_id/original.pdf
   ↓
3. AI analyzes document
   - Extract metadata
   - Detect language
   - Check for duplicates
   - Generate preview
   ↓
4. AI asks user for clarification (if needed)
   - Low confidence fields
   - Duplicate detection
   - Collection categorization
   ↓
5. User confirms/edits metadata
   ↓
6. Status: Pending admin approval
   ↓
7. Admin reviews
   - View preview (markdown)
   - Edit metadata/destination
   - Approve/reject/ask contributor
   ↓
8. If approved:
   - Move to /library/[religion]/[collection]/
   - Create YAML file
   - Process to markdown
   - Generate embeddings
   - Index to Meilisearch
   - Notify contributor
```

### Duplicate Detection

**Two-layer check:**

1. **Hash check** - Exact file match
2. **Metadata fuzzy match** - Similar title/author/year

**User flow:**
```
⚠️ Possible duplicate detected:
Similar to "The Holy Quran" by Abdullah Yusuf Ali (1934)

Is this a different edition?
○ Yes, different: [explain difference]
○ No, same (cancel upload)
● Not sure (let admin decide)
```

### AI-Assisted Metadata Extraction

```javascript
// AI analyzes uploaded document
const analysis = await claude.analyze(firstPages)

{
  title: "The Quran - Modern Translation",
  author: "Abdullah Yusuf Ali",
  year: 1934,
  religion: "Islam",
  collection: "Doctrinal",
  language: "en",

  confidence: {
    title: 0.95,
    author: 0.90,
    religion: 0.99,
    collection: 0.75  // Low - ask user
  },

  duplicate_check: {
    possible_duplicates: [{
      id: "doc_789",
      similarity: 0.82
    }]
  }
}
```

### Admin Contribution Approval

```
Pending Contributions (3)

[Thumbnail] The Quran - Modern Translation
Contributed by: Sarah Johnson
Size: 12.3 MB (458 pages)

Proposed Location:
/library/Islam/Doctrinal/quran-yusuf-ali-1934.pdf

⚠️ Possible duplicate: "The Holy Quran" (doc_789)
User says: "Different edition - 1989 revised"

[View PDF] [View Markdown Preview] [Edit Metadata]

[✓ Approve & Process]
[Keep Both Versions]
[✗ Reject] [💬 Ask Contributor]
```

### Batch Upload (ZIP)

**User can upload ZIP of multiple documents:**

1. Extract ZIP to staging
2. AI analyzes each file
3. User reviews proposed metadata for each
4. Options:
   - Review all individually
   - Accept high confidence (≥4 stars)
   - Bulk edit (apply same religion/collection to all)
5. Submit batch for admin approval

**Folder structure in ZIP preserved as hint for categorization.**

---

## User Quality Feedback

### Metadata Corrections

**Users can suggest corrections to existing documents:**

```
Suggest Metadata Correction

Document: The Hidden Words
Current: Year 1858

What needs correction?
☑ Year is incorrect

Correct year: [1857]

Explanation:
[The Hidden Words was revealed in Baghdad in 1857,
not 1858. Source: Taherzadeh, The Revelation of
Bahá'u'lláh, vol. 1, p. 89]

☐ Include supporting references
[Upload screenshot or citation]

[Submit Correction]
```

**Admin reviews suggestion with confidence scoring:**
- High-quality contributors (proven accuracy) → auto-approve eventually
- Academic email domains → green flag
- Citations provided → higher confidence

### OCR Quality Rating

**Users can flag poor OCR to prioritize re-processing:**

```
Document: Ancient Sikh Text (1892)

[View Document]

Quality Issues:
☑ OCR errors frequent
☐ Missing pages
☐ Poor image quality
☐ Incorrect language detection

Examples of errors:
["rhe" instead of "the", missing diacritics]

[Report OCR Issues]
```

**Admin sees:**
- Documents with most OCR complaints
- Prioritize for re-processing with better tools
- Track improvement over time

---

## Website Scraping

### Polite Scraping Rules

**Global limits:**
- 50 concurrent jobs max
- 3 concurrent per domain max
- 1-2 second delay between requests to same domain

**Per-site configuration:**
```yaml
crawl_delay: 1.0        # seconds between requests
max_concurrent: 3       # parallel requests to domain
user_agent: "xSwarm-Sifter/1.0 (Research Library; +https://siftersearch.com/about)"
```

### Job Queue

```
Discovery → Generate jobs for each URL

Job Queue (prioritized):
  1. New/changed pages
  2. Scheduled updates
  3. Failed retries
  4. Asset downloads (lower priority)

Scheduler:
  - Check domain rate limits
  - Round-robin between domains
  - Exponential backoff for failures
  - Adaptive backoff: no changes in 6 months → quarterly checks
```

### Asset Management

**Download and localize:**

1. Download HTML page
2. Parse for assets (images, PDFs, videos)
3. Download assets to `/scraped/[domain]/assets/`
4. Deduplicate by hash
5. Rewrite markdown links to local paths:
   ```markdown
   ![Tablet](https://bahai.org/images/tablet.jpg)
   → ![Tablet](/storage/sources/scraped/bahai.org/assets/images/tablet-abc123.jpg)
   ```

**Benefits:**
- Survives site changes
- Can index/OCR images locally
- Portable markdown

### Update Detection

**ETag/Last-Modified headers:**
```javascript
// Before downloading
const response = await fetch(url, {method: 'HEAD'})
const etag = response.headers.get('etag')

// Check cache
if (cache[url].etag === etag) {
  return cache[url].content  // No need to re-download
}

// Download and update cache
```

**Adaptive frequency:**
- No changes in 3 months → monthly checks
- No changes in 6 months → quarterly checks
- Admin can see backoff status and override

---

## User Access & Authentication

### Chat Welcome Experience

**New visitor (no session):**
```
Sifter: Hello! I'm Sifter, your guide to exploring
centuries of interfaith wisdom across [N] religions
and [N] sacred texts.

Do you have an account?
[Yes, log in] [No, create account] [Try as guest (5 searches)]
```

**Returning user:**
```
Sifter: Welcome back, [FirstName]! Ready to explore?

You have [N] searches today. [N] new documents added this week.
```
*Responds in user's preferred language*

**Guest → signup nudge (after 3 searches):**
```
Sifter: You've used 3 of 5 guest searches. Create a free
account for unlimited access and more features!
[Create account] [Continue as guest]
```

**Metadata Learning:**
- Extracts first name from conversation naturally
- Detects preferred language from queries
- Learns research interests from search patterns
- Updates user metadata JSON continuously
- Never explicitly asks for metadata (infers from context)

**Language Switching:**
- User can request: "Please respond in [language]"
- Sifter immediately switches for all responses
- Updates user.preferred_language in database
- Persists across sessions

### Authentication Strategy

**JWT Token System:**

Long-lasting tokens for persistent sessions:

```javascript
// Access token (short-lived)
{
  user_id: "user_123",
  email: "sarah@example.com",
  tier: "approved",
  exp: now + 15 minutes
}

// Refresh token (long-lived)
{
  user_id: "user_123",
  token_id: "refresh_456",
  exp: now + 90 days
}
```

**Token Flow:**

1. **Login/Signup** → Issue both tokens
2. **Access token expires** → Use refresh token to get new access token
3. **Refresh token expires** → User must re-login (90 days)
4. **Logout** → Revoke refresh token

**Storage:**
- Access token: Memory (Svelte store) + httpOnly cookie
- Refresh token: httpOnly cookie only (secure, not accessible to JS)

**Security:**
- Tokens signed with secret key
- Refresh tokens stored in database (can revoke)
- Automatic refresh before expiry
- Ban/logout immediately revokes all tokens

**Implementation:**

```javascript
// Token service
class TokenService {
  generateTokens(user) {
    const accessToken = jwt.sign(
      {user_id: user.id, tier: user.tier},
      ACCESS_SECRET,
      {expiresIn: '15m'}
    )

    const refreshToken = jwt.sign(
      {user_id: user.id, token_id: generateId()},
      REFRESH_SECRET,
      {expiresIn: '90d'}
    )

    // Store refresh token in database
    db.insert('refresh_tokens', {
      id: tokenId,
      user_id: user.id,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      created_at: new Date()
    })

    return {accessToken, refreshToken}
  }

  async refreshAccessToken(refreshToken) {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET)

    // Check if token still valid in database
    const stored = await db.get('refresh_tokens', decoded.token_id)
    if (!stored || stored.revoked) {
      throw new Error('Invalid refresh token')
    }

    // Generate new access token
    const user = await db.get('users', decoded.user_id)
    return this.generateAccessToken(user)
  }

  async revokeAllTokens(userId) {
    await db.update('refresh_tokens',
      {user_id: userId},
      {revoked: true}
    )
  }
}
```

**Client-side automatic refresh:**

```javascript
// Svelte store with auto-refresh
let accessToken = writable(null)
let refreshTimeout = null

async function refreshAccessToken() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include'  // Send httpOnly cookies
  })

  if (response.ok) {
    const {accessToken: newToken, expiresIn} = await response.json()
    accessToken.set(newToken)

    // Schedule next refresh (1 minute before expiry)
    refreshTimeout = setTimeout(
      refreshAccessToken,
      (expiresIn - 60) * 1000
    )
  } else {
    // Refresh failed, redirect to login
    goto('/login')
  }
}

// Start refresh cycle on app load
onMount(() => {
  if (hasRefreshToken()) {
    refreshAccessToken()
  }
})
```

### Access Tiers

```
Anonymous (0)
  ├─ 5 searches per IP
  ├─ Fast mode only
  └─ Rate limit: 1/10s

Email Verified (1)
  ├─ 10 total searches
  ├─ Fast mode only
  ├─ Pending approval
  ├─ 90-day sessions (JWT refresh)
  └─ Can edit profile

Approved (2)
  ├─ Unlimited searches
  ├─ Fast + research modes
  ├─ 90-day sessions (JWT refresh)
  ├─ Can contribute documents
  ├─ Forum access
  └─ Rate limit: 60/hour

Banned (shadow)
  ├─ Looks like normal access
  ├─ Gets Google Custom Search results
  ├─ All tokens revoked
  └─ No library access (reduce costs)
```

### Simplified Signup

**Single-page signup:**

```
┌─────────────────────────────────┐
│ Join Sifter Research Library    │
├─────────────────────────────────┤
│ Email: ________________         │
│ [Send Verification Code]        │
│                                 │
│ Code: ______                    │
│                                 │
│ Full Name: _______________      │
│                                 │
│ Profile Picture:                │
│ [Upload] [Gravatar] [Skip]      │
│                                 │
│ Background:                     │
│ ☐ Academic ☐ Scholar ☐ Student  │
│ ☐ Practitioner ☐ Other          │
│                                 │
│ How will you use Sifter?        │
│ (min 50 words)                  │
│ [________________________]      │
│                                 │
│ ☐ Agree to research use only    │
│                                 │
│ [Submit Application]            │
└─────────────────────────────────┘
```

**Email verification:** 6-digit code sent, validates immediately

### Referral System

**QR code sharing:**

```
Share Sifter

Your referral link:
https://siftersearch.com?ref=sarah_j47
[Copy Link]

     ┌─────────────────┐
     │   █▀▀▀▀▀█ ▀ █   │  QR code
     │   █ ███ █ ▄█▄   │
     │   █▄▄▄▄▄█ █ ▀   │
     └─────────────────┘

Your Referrals (3)
├─ Michael Chen • Approved
├─ Ahmed Hassan • Pending
└─ Jane Smith • Verified (8/10)
```

**Trust signals for admin:**
- Referred by trusted user → higher approval priority
- Referrer with good track record → fast-track
- Referrer with multiple bans → review carefully

### Admin Approval

```
Pending Approvals (3) 🔔

[Profile] Sarah Johnson
Joined: 2 days ago • Searches: 7/10

✓ Referred by: Michael Chen (trusted user)

Background: Academic Researcher

Usage description:
"PhD candidate at UC Berkeley studying
comparative mysticism in Abrahamic traditions..."

Email: sarah.j@berkeley.edu
Trust Score: ⭐⭐⭐⭐⭐

[✓ Quick Approve] [Standard Review]
```

---

## User Profile & Settings

**Profile Page:**
- Email (read-only)
- Full name (editable)
- Preferred language (dropdown: en, ar, fa, es, fr, etc)
- Profile picture (upload or Gravatar)

**Learned Metadata (view/edit):**
- First name: [editable]
- Research interests: [tag list, editable]
- Expertise areas: [tag list, editable]
- Religious tradition background: [optional, editable]

**Privacy Controls:**
- Clear specific metadata fields
- Clear all learned metadata
- Export my data
- Delete account

**Conversation History:**
- List of past conversations with titles
- Search within conversations
- Delete specific conversations
- Export conversation history

---

## Forum & Messaging

### Private Messaging (User ↔ Admin)

**One-on-one only:**
- Users message admin directly
- Admin inbox shows all conversations
- No user-to-user messaging

### Community Forum

**Threaded discussions:**

```
🗣️ Research Forum

[+ New Discussion]

Filter: [All Topics ▾] [Recent ▾]

┌───────────────────────────────┐
│ 🔥 Comparing Unity Concepts   │
│                               │
│ [Sarah's pic] Sarah Johnson   │
│ 2 hours ago • 8 replies       │
│                               │
│ "I'm researching how different│
│  traditions conceptualize..." │
│                               │
│ Latest: Ahmed Hassan, 30m ago │
│ [View Discussion]             │
└───────────────────────────────┘
```

**Threaded view:**
```
Sarah Johnson • 2 hours ago
[Original post]
  [Reply] [Share] [Report]

  Ahmed Hassan • 1 hour ago
  [Response]
    [Reply]

    Sarah Johnson • 45m ago
    [Follow-up]

  Michael Chen • 30m ago
  [Response]
```

### AI-Assisted Moderation

**All posts analyzed in real-time:**

```javascript
// Sifter monitors every post
const analysis = await claude.analyze({
  content: post.text,
  user_history: user.posts,

  check_for: [
    'spam',
    'hate_speech',
    'off_topic',
    'promotional'
  ]
})

if (!analysis.is_safe && analysis.confidence > 0.7) {
  pauseForReview(post)  // Admin reviews before publishing
}
```

**User sees:**
```
"Your post is being reviewed and will appear shortly."
```

**Admin sees:**
```
🚨 Content Paused (3)

[Profile] John Smith
Posted: 10 minutes ago
AI Confidence: 85%
Flags: Promotional, Off-topic

Post: "Great discussion! By the way, check out
my new book on interfaith dialogue..."

AI Analysis: "Contains promotional link and
self-promotion. User has made 2 similar posts."

[✓ Approve] [✗ Delete] [⚠️ Warn User] [🚫 Ban from Forum]
```

**Forum-only bans:**
- User keeps search access
- Cannot post in forum
- 3 warnings → automatic ban

---

## Infrastructure Support

### Private Donation System

**No public financial details:**

```
Help Upgrade the Infrastructure

Monthly Support:
○ $5/month - Coffee tier
○ $15/month - Regular user
○ $80/month - Patron tier
○ $120/month - Institutional seat (libraries, universities, research centers)
○ Custom: $__/month

Infrastructure Grants:
○ $100 - Component upgrade
○ $500 - System enhancement
○ $2,000 - Major upgrade
○ $4,000 - Sponsor AI server
○ Custom: $______

💡 All contributions optional, never required.
   Access remains free regardless.

Recent Infrastructure Updates:
• Dec 2025: Capacity expansion
• Nov 2025: Processing improvements
```

**No supporter lists, no amounts disclosed publicly.**

### Thank You System

**Private emails only:**
- Immediate thank you after contribution
- Monthly updates to active supporters only
- No public recognition (unless opt-in)

**Stripe integration:**
- Monthly subscriptions
- One-time grants
- Webhook handling for lifecycle events

---

## Analytics & Cost Tracking

### Admin Settings Panel

**AI Provider Configuration:**
- Dropdown selectors for each user tier (admin/patron/approved/verified)
- Available providers auto-discovered on startup (Ollama, LM Studio, etc.)
- Test button to verify each provider works
- Switch between providers instantly, no restart required
- Shows current cost per query for each configuration

**Local Engine Selection:**
- Auto-discovers available engines (Ollama, LM Studio, llama.cpp, vLLM)
- Lists available models from each engine
- Shows model stats (size, speed, quality estimate)
- One-click model switching

**Library Settings:**
- Enable/disable cover fetching
- Set scraping schedules per site
- Adjust rate limits by tier
- Configure translation style preferences

**Real-time Testing:**
- Send test query through each provider
- Compare response quality side-by-side
- Shows response time and cost
- Easy A/B testing of configurations

### Admin Analytics Dashboard

```
📊 Analytics & Financials

Time Range: [Last 30 Days ▾]

━━ Usage Stats ━━━━━━━━━━━━━━

Search Activity
├─ Total searches: 3,421
├─ Fast: 2,890 (84%)
├─ Research: 531 (16%)
└─ Avg response time: 1.2s

Active Users
├─ Daily active: 8-12
├─ Monthly active: 28
└─ Total registered: 47

Popular Topics
1. Interfaith dialogue (234)
2. Sufism (189)
3. Bahá'í history (156)

━━ API Costs ━━━━━━━━━━━━━━━

OpenAI API
├─ Embeddings: $142.34
├─ Translations: $28.90
├─ Moderation: $4.20
└─ Total: $175.44

Cost by Activity
├─ Document indexing: $89.20
├─ Search queries: $52.34
├─ Contributions: $18.50
└─ Forum moderation: $4.20

━━ Financial Summary ━━━━━━━

This Month
├─ Operating costs: $175.44
├─ Monthly support: $245.00
└─ Net: +$69.56

Year to Date
├─ Costs: $2,341.23
├─ Support: $10,340.00
└─ Net: +$7,998.77

━━ Processing Activity ━━━━━

Documents Indexed
├─ New: 234
├─ From users: 12
├─ From websites: 187
└─ Paragraphs: 45,230
```

### Event Tracking

```javascript
// Track every operation
await analytics.log({
  timestamp: new Date(),
  event_type: 'search',
  user_id: 'user_123',
  details: {
    query: "divine unity",
    mode: "research",
    result_count: 15
  },
  duration_ms: 2340,

  // Costs
  api_calls: {
    embeddings: {tokens: 45, cost: 0.0023},
    reranking: {tokens: 8900, cost: 0.0890},
    analysis: {tokens: 3200, cost: 0.0320}
  },
  total_cost: 0.1233
})
```

**Analytics database (Turso/libsql):**

```sql
-- User authentication
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  tier TEXT DEFAULT 'verified',  -- verified, approved, patron, institutional, banned
  created_at DATETIME,
  approved_at DATETIME,

  -- Learned metadata
  preferred_language TEXT DEFAULT 'en',
  metadata JSON  -- {first_name, interests, research_areas, etc}
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at);

-- Analytics
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME,
  event_type TEXT,
  user_id INTEGER,
  details JSON,

  -- API costs
  api_provider TEXT,
  api_endpoint TEXT,
  tokens_used INTEGER,
  cost_usd REAL,

  -- Performance
  duration_ms INTEGER,
  success BOOLEAN
);

-- Financial
CREATE TABLE financial_transactions (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME,
  type TEXT,
  user_id INTEGER,
  amount_usd REAL,
  stripe_transaction_id TEXT
);
```

---

## Activity Monitoring

### Real-Time Updates (Long-Polling)

**Two state endpoints:**

**1. Library State (`/api/library/state`)**
```javascript
{
  timestamp: "2025-12-09T14:35:22Z",
  totals: {
    documents: 1247,
    words: 42300000,
    paragraphs: 1800000
  },
  by_religion: {...},
  by_collection: {...},
  recent_additions: [...]
}
```

**2. Activity State (`/api/activity/state`)**
```javascript
{
  timestamp: "2025-12-09T14:35:23Z",
  indexing_active: true,

  queue: {
    pending: 347,
    active: 50,
    completed: 1203,
    failed: 12
  },

  current_jobs: [
    {
      id: "job_12345",
      type: "website_scrape",
      site: "Bahá'í Reference Library",
      status: "fetching",
      progress: "12/45 pages"
    }
  ],

  stats: {
    pages_indexed_today: 1203,
    embedding_cost_today: 12.34,
    eta_completion: "2025-12-09T16:45:00Z"
  },

  recent_events: [...]
}
```

**UI long-polls both endpoints** → updates within 1-2 seconds without websockets

### Admin Activity Monitor

```
📊 Indexing Activity

Queue Status
├─ Pending: 347 jobs
├─ Active: 50 jobs
└─ Completed: 1,203 jobs

Current Activity
├─ Fetching: bahai.org/writings/...
├─ Processing: islamicity.org/quran...
├─ Downloading: image.jpg (2/8)
└─ Embedding: 450/1000 chunks

By Site
├─ Bahá'í Ref Library: 12 active
├─ Islamicity: 3 active
└─ Pluralism Project: 1 active

Stats
├─ Pages indexed: 1,203
├─ Assets downloaded: 456
├─ Embedding cost: $12.34
└─ ETA: ~45 minutes

[⏸ Pause] [▶️ Resume] [⏹ Stop]
Concurrency: [━━━━━━○━━━] 50
```

---

## Mobile-First Design

### Responsive Interface

**Mobile priorities:**
1. Fast search input
2. Clean result cards
3. Easy navigation
4. Drag-n-drop document upload
5. Forum participation
6. Profile management

**Desktop enhancements:**
1. Multi-column layout
2. Persistent sidebar
3. Keyboard shortcuts
4. Expanded admin controls
5. Detailed analytics

### Chat Interface

**Visual Design:**
- Organic WebGL flowing liquid animation in background
- Subtle, calming movement (low distraction)
- Adapts to viewport size
- Performant on mobile and desktop

**Conversational search:**

```
┌─────────────────────────────┐
│ 💬 Chat with Sifter         │
├─────────────────────────────┤
│ [Chat history]              │
│                             │
│ You: What is Tawhid?        │
│                             │
│ Sifter: Tawhid is the       │
│ fundamental Islamic concept │
│ of divine unity...          │
│ [3 sources]                 │
│                             │
│ You: How does it compare to │
│ Christian Trinity?          │
│                             │
│ Sifter: [searching...]      │
│                             │
├─────────────────────────────┤
│ [Type your question...]     │
│ [Send]                      │
└─────────────────────────────┘
```

**Desktop drag-n-drop:**
- Drag PDF/DOCX → Upload area
- Automatic processing starts
- Real-time progress feedback
- Metadata confirmation inline

### Conversation Persistence

```javascript
// Save conversation per user
{
  user_id: "user_123",
  conversations: [
    {
      id: "conv_456",
      title: "Pilgrimage in Abrahamic Faiths",  // Auto-generated
      messages: [...],
      created_at: "2025-12-09T10:00:00Z",
      updated_at: "2025-12-09T10:15:00Z"
    }
  ]
}

// Load on next session
// Sifter uses context for follow-up questions
```

---

---

## Code Architecture & Development Principles

### Core Philosophy

**Minimal, Reliable, Self-Documenting**

1. **Brevity**: Every function does one thing, as concisely as possible
2. **Reuse**: DRY - never duplicate logic
3. **Clarity**: Code reads like documentation
4. **Resilience**: Never crash - graceful degradation everywhere
5. **Maintainability**: Easy to understand after months away

### ES6+ Modern JavaScript

**Code Style:**
```javascript
// ❌ Avoid
function processDocument(doc) {
  if (doc.type === 'pdf') {
    return extractPDF(doc)
  } else {
    return extractMarkdown(doc)
  }
}

// ✅ Prefer
const processDocument = doc =>
  doc.type === 'pdf' ? extractPDF(doc) : extractMarkdown(doc)

// ✅ Or destructure
const processDocument = ({type, ...doc}) =>
  processors[type]?.(doc) ?? defaultProcessor(doc)
```

**Modern Features Required:**
- Arrow functions everywhere
- Destructuring (object, array)
- Template literals
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- Async/await (no callbacks)
- Array methods (`map`, `filter`, `reduce`)
- Object spread (`{...obj}`)
- Default parameters
- Rest parameters

**Forbidden Patterns:**
- `var` (use `const`/`let`)
- Callbacks (use async/await)
- Long functions (max 20 lines)
- Deep nesting (max 3 levels)
- Mutable state without reason

### Project Structure

```
siftersearch/
├── README.md                   # Installation, quick start
├── package.json
├── .env.example               # Template with all required keys
├── pm2.config.js              # Daemon configuration
│
├── src/
│   ├── index.js               # Main entry point
│   ├── server.js              # Fastify server setup
│   ├── README.md              # Architecture overview
│   │
│   ├── api/                   # API routes (one file per domain)
│   │   ├── README.md
│   │   ├── search.js          # POST /api/search
│   │   ├── auth.js            # Auth endpoints
│   │   ├── library.js         # Library state
│   │   ├── contribute.js      # Document uploads
│   │   ├── forum.js           # Forum endpoints
│   │   ├── admin.js           # Admin endpoints
│   │   └── support.js         # Stripe integration
│   │
│   ├── services/              # Business logic (one per domain)
│   │   ├── README.md
│   │   ├── sifter.js          # AI orchestration
│   │   ├── search.js          # Meilisearch wrapper
│   │   ├── processor.js       # Document processing
│   │   ├── spider.js          # Website scraping
│   │   ├── embeddings.js      # Vector generation
│   │   ├── translator.js      # Translation service
│   │   └── moderator.js       # Forum moderation
│   │
│   ├── lib/                   # Utilities (tiny, reusable)
│   │   ├── README.md
│   │   ├── db.js              # Turso client wrapper
│   │   ├── ai.js              # Ollama + OpenAI clients
│   │   ├── auth.js            # JWT helpers
│   │   ├── queue.js           # Job queue
│   │   ├── cache.js           # Simple cache
│   │   ├── logger.js          # Structured logging
│   │   └── errors.js          # Error handling
│   │
│   ├── workers/               # Background jobs
│   │   ├── README.md
│   │   ├── indexer.js         # Document indexing
│   │   ├── spider.js          # Web scraping
│   │   ├── cover-fetcher.js   # Fetch missing covers when idle
│   │   └── cleanup.js         # Token cleanup
│   │
│   └── config.js              # Config loader with validation
│
├── scripts/                   # Deployment scripts
│   ├── README.md
│   ├── install.js             # Setup wizard
│   ├── migrate.js             # Database migrations
│   └── health-check.js        # System health
│
└── ui/                        # Astro + Svelte frontend
    ├── README.md
    ├── src/
    │   ├── components/
    │   │   ├── ChatBackground.svelte  # WebGL flowing liquid animation
    │   │   └── ...
    │   └── pages/
    └── public/
```

### File Size Limits

**Enforce brevity:**
- API routes: <150 lines
- Services: <300 lines
- Utilities: <100 lines
- If larger, split into smaller modules

### Error Handling Strategy

**Never crash - wrap everything:**

```javascript
// Utility wrapper
const safe = (fn, fallback) => async (...args) => {
  try {
    return await fn(...args)
  } catch (error) {
    logger.error('Function failed', {fn: fn.name, error, args})
    return fallback?.(...args) ?? null
  }
}

// Usage
const searchDocuments = safe(
  async query => meiliIndex.search(query),
  () => ({hits: [], error: 'Search unavailable'})
)

// In routes - always return valid response
app.post('/api/search', async (req, reply) => {
  const result = await searchDocuments(req.body.query)
  return reply.send(result)  // Never throws
})
```

**Graceful Degradation:**
- AI unavailable? → Fall back to keyword search
- Translation fails? → Show original text
- Embedding fails? → Skip that document, continue
- Database timeout? → Return cached data if available

**Error Response Format:**
```javascript
{
  success: false,
  error: 'user_friendly_message',
  code: 'ERROR_CODE',
  fallback: {...}  // Partial data if available
}
```

### Service Health & Monitoring

**Health Check Endpoint:**
```javascript
// GET /health
{
  status: 'healthy',
  services: {
    meilisearch: 'up',
    ollama: 'up',
    database: 'up',
    storage: 'writable'
  },
  uptime: 86400,
  memory: {used: '8GB', total: '32GB'}
}
```

**PM2 Daemon Configuration:**
```javascript
// pm2.config.js
module.exports = {
  apps: [{
    name: 'sifter-api',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '8G',

    // Restart if unhealthy
    health_check_grace_period: 10000,
    health_check_interval: 30000,
    health_check_url: 'http://localhost:3000/health',

    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',

    // Auto-start on boot
    startup: true,

    env: {
      NODE_ENV: 'production'
    }
  }, {
    name: 'sifter-worker',
    script: './src/workers/indexer.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '4G'
  }],

  // Auto-update daemon
  watch: [{
    name: 'sifter-autoupdate',
    script: './scripts/autoupdate.js',
    cron_restart: '0 * * * *',  // Check hourly
    autorestart: true
  }]
}
```

### Installation & Setup

**Prerequisites:**

Before installing Sifter, ensure these services are running:

1. **Ollama** (v0.1.0+)
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.com/install.sh | sh

   # Pull required models
   ollama pull qwen2.5:32b
   ollama pull qwen2.5:14b  # For moderation
   ```

2. **Meilisearch** (v1.5+)
   ```bash
   # Install Meilisearch
   curl -L https://install.meilisearch.com | sh

   # Start Meilisearch
   meilisearch --master-key="YOUR_MASTER_KEY"
   ```

3. **Node.js** (v20+)
   ```bash
   node --version  # Should be v20 or higher
   ```

4. **PM2** (for daemon management)
   ```bash
   npm install -g pm2
   ```

**Zero-config installation:**

```bash
# One command install
npx siftersearch init

# Or global install
npm install -g siftersearch
sifter init
```

**What `sifter init` does:**
1. Checks prerequisites (Node, Ollama, Meilisearch)
2. Pulls Ollama models (qwen2.5:32b, qwen2.5:14b)
3. Interactive setup wizard for configuration
4. Generates .env with all required keys
5. Creates directory structure
6. Initializes database (Turso)
7. Starts services with PM2
8. Sets up auto-start on boot

**Optional: Enable premium AI providers**

If you want to use Claude or GPT-4 for admin/patron tiers:

```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...

# Config will use these automatically for admin/patron tiers
# Regular users still use Ollama (no additional cost)
```

**Setup Wizard (`scripts/install.js`):**

```javascript
#!/usr/bin/env node

import inquirer from 'inquirer'
import {writeFile} from 'fs/promises'

const install = async () => {
  console.log('🔍 Sifter Search Setup\n')

  // Check prerequisites
  await checkNode()
  await checkOllama()
  await checkMeilisearch()

  // Gather configuration
  const config = await inquirer.prompt([
    {
      type: 'input',
      name: 'libraryPath',
      message: 'Library folder path:',
      default: './library'
    },
    {
      type: 'password',
      name: 'openaiKey',
      message: 'OpenAI API key (for embeddings):',
      validate: v => v.length > 0
    },
    {
      type: 'input',
      name: 'tursoUrl',
      message: 'Turso database URL:',
      validate: v => v.startsWith('libsql://')
    },
    // ... more prompts
  ])

  // Generate .env
  const env = `
OPENAI_API_KEY=${config.openaiKey}
TURSO_DATABASE_URL=${config.tursoUrl}
TURSO_AUTH_TOKEN=${config.tursoToken}
JWT_ACCESS_SECRET=${generateSecret()}
JWT_REFRESH_SECRET=${generateSecret()}
MEILI_MASTER_KEY=${generateSecret()}
LIBRARY_PATH=${config.libraryPath}
`.trim()

  await writeFile('.env', env)

  // Pull Ollama models
  console.log('\n📦 Pulling Ollama models...')
  await exec('ollama pull qwen2.5:32b')
  await exec('ollama pull qwen2.5:14b')

  // Initialize database
  console.log('\n🗄️  Setting up database...')
  await exec('npm run migrate')

  // Start services
  console.log('\n🚀 Starting services...')
  await exec('pm2 start pm2.config.js')
  await exec('pm2 save')
  await exec('pm2 startup')

  console.log('\n✅ Installation complete!')
  console.log('Access Sifter at: http://localhost:3000')
}

install().catch(error => {
  console.error('❌ Installation failed:', error.message)
  process.exit(1)
})
```

**Auto-Update Script (`scripts/autoupdate.js`):**

```javascript
#!/usr/bin/env node
import {exec} from 'child_process'
import {promisify} from 'util'

const execAsync = promisify(exec)

const checkAndUpdate = async () => {
  try {
    // Check npm for latest version
    const {stdout} = await execAsync('npm view siftersearch version')
    const latest = stdout.trim()
    const current = process.env.npm_package_version

    if (latest !== current) {
      console.log(`📦 Update available: ${current} → ${latest}`)

      // Update globally
      await execAsync('npm update -g siftersearch')

      // Restart services
      await execAsync('pm2 restart all')

      console.log('✅ Updated and restarted')
    }
  } catch (error) {
    console.error('Auto-update check failed:', error.message)
  }
}

checkAndUpdate()
```

**Chat Welcome Flow:**

```javascript
// services/sifter.js
export const handleNewSession = async user => {
  if (!user) {
    return {
      message: `Hello! I'm Sifter, your guide to exploring centuries of interfaith wisdom across ${stats.religions} traditions and ${stats.documents} sacred texts.

Do you have an account?`,
      actions: [
        {label: 'Yes, log in', action: 'login'},
        {label: 'No, create account', action: 'signup'},
        {label: 'Try as guest (5 searches)', action: 'guest'}
      ]
    }
  }

  return {
    message: `Welcome back, ${user.name}! Ready to explore the library?`,
    stats: {
      searches_today: user.searches_today,
      new_documents: stats.added_this_week
    }
  }
}
```

**Dev Mode:**

```bash
# .env
DEV_MODE=true  # Uses API orchestration (no local AI needed)
ANTHROPIC_API_KEY=sk-ant-...  # Required in dev mode

# Start in dev mode (laptop)
npm run dev

# Production mode (server)
npm start
```

**Startup Validation (`src/config.js`):**

```javascript
import {config} from 'dotenv'
import {existsSync} from 'fs'

config()

const required = [
  'OPENAI_API_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MEILI_MASTER_KEY'
]

const missing = required.filter(key => !process.env[key])

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:\n')
  missing.forEach(key => console.error(`  - ${key}`))
  console.error('\nCopy .env.example to .env and fill in values.')
  console.error('Run: npx siftersearch init')
  process.exit(1)
}

// Validate paths
const paths = {
  library: process.env.LIBRARY_PATH || '~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library',
  processed: process.env.PROCESSED_PATH || './storage/processed',
  embeddings: process.env.EMBEDDINGS_PATH || './storage/embeddings'
}

Object.entries(paths).forEach(([name, path]) => {
  if (!existsSync(path)) {
    console.error(`❌ ${name} path does not exist: ${path}`)
    process.exit(1)
  }
})

export default {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',

  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },

  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434'
  },

  database: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET
  },

  meilisearch: {
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    masterKey: process.env.MEILI_MASTER_KEY
  },

  paths
}
```

### Documentation Standards

**Every folder has README.md:**

```markdown
# /src/services/

Business logic layer - pure functions, no HTTP concerns.

## Files

### sifter.js
AI orchestration service. Coordinates query analysis, search execution,
re-ranking, and response formatting.

Key functions:
- `analyzeQuery(query, history)` → strategy
- `executeSearch(strategy)` → results
- `rerankResults(query, results)` → scored results

Dependencies: Ollama (local), search service

### search.js
Meilisearch wrapper. Handles hybrid search, indexing, and index management.

Key functions:
- `hybridSearch(query, filters)` → hits
- `indexDocuments(docs)` → void
- `deleteDocument(id)` → void

Dependencies: Meilisearch

## Adding New Services

1. Create single-purpose file
2. Export pure functions (input → output)
3. Handle errors internally (return null/default)
4. Document in README
5. Keep under 300 lines
```

**Inline Documentation:**

```javascript
/**
 * Analyzes user query to determine search strategy
 *
 * @param {string} query - User's search query
 * @param {Array} history - Previous messages for context
 * @returns {Promise<Strategy>} Search strategy object
 *
 * Strategy: {
 *   mode: 'fast' | 'research',
 *   queries: [{query, filters}],
 *   needsAnalysis: boolean
 * }
 */
export const analyzeQuery = async (query, history) => {
  const prompt = buildPrompt(query, history)
  const response = await ollama.generate(prompt)
  return parseStrategy(response)
}
```

### Code Review Checklist

Before committing, every file must:
- [ ] Uses ES6+ features (arrow functions, destructuring, etc.)
- [ ] Functions are brief (<20 lines)
- [ ] No deep nesting (max 3 levels)
- [ ] Error handling with fallbacks
- [ ] Documented (inline + README)
- [ ] No magic numbers (use constants)
- [ ] No console.log (use logger)
- [ ] Passes linter (ESLint + Prettier)

---

## Startup & Auto-Discovery

**First run:**
1. Check for required .env keys
2. Scan for available local AI engines (Ollama, LM Studio, llama.cpp, vLLM)
3. Test connectivity to each engine
4. Select best available if `local_engine: auto` in config
5. List available models from selected engine
6. Auto-select best model (prefer qwen2.5:32b or llama3.1:70b)
7. Verify API keys work (OpenAI for embeddings, optional Anthropic)
8. Initialize database schema if needed
9. Start services

**Subsequent runs:**
- Use cached selections from config
- Re-validate engines and models still available
- Warn if preferred models missing
- Fall back to available alternatives

**Zero-configuration goal:**
Install Ollama, run `npx siftersearch init`, answer prompts. Everything else auto-configured.

---

## Deployment & Operations

### NPM Package

**NPM Package:**
- Package name: `siftersearch`
- Repository: https://github.com/chadananda/siftersearch

```json
{
  "name": "siftersearch",
  "version": "1.0.0",
  "bin": {
    "sifter": "./bin/cli.js"
  },
  "scripts": {
    "init": "node scripts/init.js",
    "daemon": "node src/daemon/index.js",
    "index": "node scripts/index.js",
    "migrate": "node scripts/migrate.js"
  }
}
```

**Installation:**
```bash
npm install -g siftersearch
sifter init        # Setup config
sifter daemon      # Start services
sifter index       # Manual re-index
```

### Service Architecture

```
systemd services (or PM2):
├─ sifter-api      (Fastify server)
├─ sifter-indexer  (Background processing)
├─ sifter-spider   (Website scraping)
├─ sifter-cleanup  (Token cleanup, daily)
└─ meilisearch     (Search engine)

cloudflared tunnel --config sifter-tunnel.yml
```

**Scheduled Tasks:**
- Token cleanup: Daily, remove expired refresh tokens
- Website updates: Per site schedule (weekly/monthly)
- Stats recalculation: Hourly
- Cost aggregation: Daily

### Configuration

**`config.yaml`** (simplified, flat structure):

```yaml
# Paths
library_root: ~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library
processed_path: ./storage/processed
embeddings_cache: ./storage/embeddings

# Server
port: 3000
dev_mode: false

# AI Models (change via admin UI)
ai_admin: anthropic:claude-sonnet-4
ai_patron: anthropic:claude-sonnet-4
ai_institutional: anthropic:claude-sonnet-4
ai_approved: local:qwen2.5:32b
ai_verified: local:qwen2.5:14b
ai_translation: openai:gpt-4
ai_embeddings: openai:text-embedding-3-large

# Local AI Engine (auto-discover if not set)
local_engine: ollama  # ollama, lmstudio, llamacpp, vllm, or "auto"
local_host: http://localhost:11434
local_model: qwen2.5:32b

# Search
fast_queries: 1
research_queries: 5
fast_results: 20
research_results: 100

# Scraping
spider_concurrent: 50
spider_per_domain: 3
spider_delay: 1.0

# Rate Limits
rate_verified: 10
rate_approved: 60
rate_patron: 100
rate_institutional: 100

# All secrets in .env (gitignored)
```

**.env** (never commit):
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
MEILI_MASTER_KEY=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLOUDFLARE_TUNNEL_TOKEN=...
```

### Disaster Recovery

**Backups:**
- Turso/libsql: Auto-backed up (remote)
- Library files: In Dropbox (auto-backed up)
- Processed/embeddings: Rebuildable (no backup needed)
- Meilisearch index: Rebuildable from processed files

**Recovery:**
```bash
# Complete rebuild from sources
sifter rebuild --from-sources

# Partial re-index
sifter index --changed-only

# Restore user database
turso db restore sifter-users [backup-id]
```

---

## Success Metrics

### Must Have

- Search returns relevant results 90%+ of queries
- Response time <2s for fast searches, <5s for research
- Can search across all content types and languages
- Works excellently on mobile browser
- Users can contribute documents with AI assistance
- Admin can monitor costs and usage

### Nice to Have

- Semantic search noticeably better than keyword-only
- Can find documents with imprecise queries
- Forum fosters community discussion
- Users voluntarily support infrastructure
- System handles 100 concurrent users smoothly

---

## Implementation Phases

### Phase 1: Core Search (Weeks 1-3)
- Meilisearch setup with hybrid search
- Basic indexing pipeline (PDF, MD, HTML)
- Paragraph extraction and embedding
- Simple API + Astro/Svelte UI
- Fast search mode only
- Manual document addition

### Phase 2: Sifter Intelligence (Weeks 3-5)
- Query analysis and strategy
- Re-ranking with extract generation
- Research mode
- Translation layer
- Conversation memory
- Analysis synthesis

### Phase 3: User System (Weeks 5-7)
- Authentication (email verification)
- User tiers and rate limiting
- Referral system with QR codes
- Admin approval workflow
- Private messaging
- User profiles

### Phase 4: Contributions (Weeks 7-9)
- Document upload with staging
- AI metadata extraction
- Duplicate detection
- Admin approval interface
- Batch ZIP uploads
- Metadata correction suggestions
- OCR quality feedback

### Phase 5: Community (Weeks 9-11)
- Forum implementation
- Threaded discussions
- AI moderation
- Related documents linking
- Recent additions feed

### Phase 6: Operations (Weeks 11-13)
- Website spider with politeness
- Asset management
- Activity monitoring (long-polling)
- Analytics dashboard
- Cost tracking
- Classical text segmentation

### Phase 7: Polish (Weeks 13-15)
- Infrastructure support (Stripe)
- Mobile optimizations
- Performance tuning
- Backup/recovery procedures
- Documentation
- Admin training

### Phase 8: Production (Week 16)
- Cloudflare Tunnel setup
- Deploy frontend to Cloudflare Pages
- Systemd/PM2 daemon setup
- Monitoring and alerting
- Beta testing with initial users
- Launch

---

## Technical Risks & Mitigations

### Risk 1: GPU Memory Management (96GB VRAM)
**Risk:** Large models or concurrent inference exceeds VRAM
**Mitigation:**
- 96GB VRAM is generous for qwen2.5:32b (~20GB) or even 70b (~40GB)
- Can run multiple models simultaneously if needed
- Memory monitoring via Ollama metrics
- Quantization available if needed (int8, int4)
- System RAM separate from VRAM (no competition)

### Risk 2: OpenAI Costs
**Risk:** Research mode too expensive at scale
**Mitigation:**
- Default to fast mode
- Track costs per search in analytics
- Set daily/monthly spending caps
- Can fall back to keyword-only if budget exceeded
- Supporter system offsets costs

### Risk 3: Classical Text Segmentation Quality
**Risk:** AI segmentation of unpunctuated texts produces poor results
**Mitigation:**
- Manual review of segmented texts initially
- Iterate on prompts with examples
- Allow admin to override/correct segmentation
- Mark low-confidence segmentations for review

### Risk 4: Re-ranking Bottleneck
**Risk:** Re-ranking 100 results in research mode too slow
**Mitigation:**
- Batch processing (20 at a time)
- Parallel batches where possible
- Cache common query patterns
- Tune relevance threshold to reduce results sent to AI

### Risk 5: Website Scraping Blocks
**Risk:** Sites block scraper or rate limit aggressively
**Mitigation:**
- Polite delays and user agent
- Respect robots.txt
- Exponential backoff on errors
- Allow per-site configuration
- Manual fallback for critical sites

### Risk 6: Mobile Performance
**Risk:** Large result sets slow on mobile
**Mitigation:**
- Lazy loading of results
- Aggressive pagination
- Optimize bundle size (code splitting)
- Service worker caching
- Progressive enhancement

### Cost Considerations with Tiered AI Providers

**Operating costs by user tier:**

**All API approach (previous):**
- Per search: ~$0.25 (Claude for everything)
- 3,000 searches/month: ~$750/month

**Tiered approach (current):**

**Admin searches** (100/month):
- Claude orchestration + re-ranking: ~$0.15/search
- Monthly cost: ~$15

**Patron searches** (5 patrons × 200/month = 1,000):
- Claude orchestration + Ollama re-ranking: ~$0.05/search
- Monthly cost: ~$50

**Regular user searches** (30 users × 60/month = 1,800):
- Ollama for all operations: ~$0.02/search (embeddings only)
- Monthly cost: ~$36

**Shared costs:**
- Embeddings for new documents: ~$50/month
- Translations: ~$15/month

**Total estimated: ~$166/month**
- Down from $750/month (78% reduction)
- Covered by 2 patron supporters ($160/month)
- Sustainable with small community

**Quality vs. Cost:**
- Admin always gets best (Claude) for validation
- Patrons get premium experience
- Regular users get "good enough" (Ollama)
- Can upgrade users to Claude temporarily for testing

**Hardware utilization:**
- Framework Desktop AMD GPU with 96GB dedicated VRAM
- Handles qwen2.5:32b efficiently, can run 70b models
- ~10-20ms inference time with GPU acceleration
- No rate limits, instant responses
- Complete privacy for 95% of searches

---

## Future Enhancements (Post-Launch)

### Phase 9+: Advanced Features

**Search Enhancements:**
- Saved searches and alerts
- Search history per user
- Bookmarking results
- Export results to citations (BibTeX, APA, MLA)
- "More like this" recommendations

**Content Enhancements:**
- Audio/video lecture transcription
- Image OCR for scanned books
- Table extraction from PDFs
- Citation graph (which texts reference which)
- Timeline view (documents by date)

**Collaboration:**
- Librarian roles (delegated approval by language/religion)
- Collaborative annotation
- User-created collections
- Document tagging by users
- Quality voting on contributions

**Analysis:**
- Comparative analysis reports (AI-generated)
- Theme extraction across corpus
- Historical trend analysis
- Cross-reference mapping
- Automated bibliographies

**Infrastructure:**
- Dedicated GPU for local embeddings (cost reduction)
- Multi-language UI (beyond English)
- Mobile native apps (React Native)
- CLI tool for power users
- API for external integrations

---

## Appendix

### Glossary

- **Sifter:** AI orchestrator that conducts search pipeline
- **Fast mode:** Single query, no synthesis (~1-2s)
- **Research mode:** Multiple queries with analysis (~3-5s)
- **Paragraph:** Semantic unit of indexing (not arbitrary chunks)
- **Extract:** Key 1-3 sentences pulled from paragraph by AI
- **Re-ranking:** AI scores results and extracts relevant passages
- **Hybrid search:** Combines keyword and vector similarity
- **Classical text:** Arabic/Farsi text without punctuation
- **Staging:** Temporary area for user contributions pending approval
- **Shadow ban:** User sees results but gets Google instead of library

### Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Astro + Svelte | Static + interactive UI |
| API | Node.js + Fastify | Backend server |
| Search | Meilisearch | Hybrid keyword + vector |
| Database | Turso (libsql) | User data, auto-backed up |
| AI Orchestration | Ollama (qwen2.5:32b) / Claude Sonnet 4 | Tier-based: Ollama for users, Claude for admin/patrons |
| Embeddings | OpenAI text-embedding-3-large | 3072-dim vectors |
| Translation | OpenAI GPT-4 | Classical Arabic/Farsi translation |
| Tunnel | Cloudflare | Secure exposure |
| Hosting | Cloudflare Pages | Frontend CDN |
| Payments | Stripe | Donations |
| Process Manager | PM2 | Daemon, auto-restart, monitoring |

### File Formats Supported

**Input:**
- PDF (text and image)
- DOCX
- Markdown
- HTML
- TXT
- EPUB (future)

**Processing:**
- Everything converted to Markdown + YAML
- Stored in `/storage/processed/`
- Indexed to Meilisearch as paragraphs

### API Endpoints (Summary)

**Search:**
- `POST /api/search` - Main search (fast or research)
- `GET /api/document/:id` - Get full document
- `GET /api/conversation/:id` - Load conversation history

**Library:**
- `GET /api/library/state` - Library stats (long-poll)
- `GET /api/library/stats` - Detailed statistics
- `GET /api/library/browse` - Browse by religion/collection

**Contributions:**
- `POST /api/contribute/upload` - Upload document
- `POST /api/contribute/metadata` - Confirm metadata
- `GET /api/contribute/status/:id` - Check approval status

**Forum:**
- `GET /api/forum/discussions` - List discussions
- `POST /api/forum/post` - Create post/reply
- `POST /api/forum/report` - Report content

**Admin:**
- `GET /api/admin/approvals` - Pending user approvals
- `POST /api/admin/approve` - Approve user/contribution
- `GET /api/admin/analytics` - Usage and cost analytics
- `GET /api/admin/activity` - Indexing activity (long-poll)
- `GET /api/admin/moderation` - Flagged forum posts

**User:**
- `POST /api/auth/signup` - Create account
- `POST /api/auth/verify` - Email verification
- `POST /api/auth/login` - Login (returns tokens)
- `POST /api/auth/refresh` - Refresh access token (uses httpOnly cookie)
- `POST /api/auth/logout` - Logout (revokes tokens)
- `GET /api/user/profile` - Get profile
- `POST /api/messages/send` - Message admin

**Support:**
- `POST /api/support/subscribe` - Start monthly support
- `POST /api/support/grant` - One-time grant
- `POST /stripe/webhook` - Stripe events

### Environment Variables

```bash
# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # For admin/patron tiers
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Ollama (local)
OLLAMA_HOST=http://localhost:11434

# Authentication
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

# Database
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...

# Meilisearch
MEILI_MASTER_KEY=...
MEILI_HOST=http://localhost:7700

# Cloudflare
CLOUDFLARE_TUNNEL_TOKEN=...

# Paths
LIBRARY_PATH=~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library
PROCESSED_PATH=./storage/processed
EMBEDDINGS_PATH=./storage/embeddings

# Deployment
NODE_ENV=production
PORT=3000
DEV_MODE=false  # true = use API orchestration (laptop dev)
```

---

**Document Version:** 1.0
**Last Updated:** December 2025
**Owner:** Chad
**Status:** Ready for Implementation

---

## Development Philosophy Summary

This PRD emphasizes **production-quality code from day one:**

✅ **Hardware**: Framework Desktop with AMD Ryzen 365+ and 96GB VRAM
✅ **Local-first**: Pluggable AI engines (Ollama/LMStudio/llama.cpp/vLLM)
✅ **Dev mode**: Use API on laptop, local AI on server
✅ **Auto-update**: Daemon checks npm hourly, updates automatically
✅ **Multilingual**: Responds in user's language, side-by-side translations
✅ **Personalized**: Learns user metadata naturally (name, interests, language)
✅ **Visual**: Organic WebGL flowing liquid background animation
✅ **Minimal**: Brief ES6+ functions, maximum reuse
✅ **Resilient**: Never crash, always degrade gracefully
✅ **Self-documenting**: README in every folder, inline docs
✅ **Zero-friction**: `npx siftersearch init` installs everything
✅ **Maintainable**: Easy to understand after months away
✅ **Friendly**: Sifter introduces itself, helps with signup

**Key Principle:** Code should be a joy to return to, not a mystery to decipher.

This PRD covers all architectural decisions, workflows, and technical specifications for Sifter Search.