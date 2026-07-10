# 10 — Query Router, Solution Patterns & Per-Type Quality (design)

> **Status: design / roadmap** (not yet fully built). This document is the contract we implement
> against, pattern by pattern. It extends the retrieval story in [06](06-retrieval.md).

> **The RAG problem:** one pipeline for every query is both slow and mediocre. "Who was Quddús",
> "tell me the story of Badasht", "what do the religions say about the soul", and "when did the Báb
> declare His mission" are four *different problems* — different data sources, different effort, and
> different **answer shapes**. Running the full fan-out-and-analyze machine on all of them wastes
> time on the easy ones and under-serves the specialized ones. The fix is to **decide what kind of
> problem a query is, first — fast — and branch into a purpose-built solution pattern.**

---

## Part A — The Query Router

### The core insight: two orthogonal axes

Every query answers two independent questions:

1. **Retrieval strategy** — *where/how to find it*: entity DB · HyPE-semantic · keyword-exact ·
   cross-tradition facet · episode/timeline · catalog/compilation · single-doc read.
2. **Answer shape** — *what the person wants back*: fact · story · discussion · timeline ·
   compilation · comparison · biography · overview.

They correlate but are not the same, so the router extracts both, plus the parameters that
specialize a pattern (entities, religion, timeframe, named work, scope).

### The router contract

The router takes the raw query (+ any explicit flags like `religion` from the caller/site scope)
and returns a **plan**:

```jsonc
// QueryPlan
{
  "intent": "biography|fact|story|discussion|timeline|compilation|comparison|overview",
  "shape":  "card|answer|narrative|discussion|timeline|list|grid|catalog",   // how to render
  "entities": [ { "name": "Quddús", "type": "person" } ],   // extracted, for entity-DB routing
  "religion": "Baha'i" | null,          // explicit flag OR detected
  "facet":    "filter" | "compare" | "none",  // one tradition, across traditions, or n/a
  "timeframe": { "from": null, "to": null } | null,
  "named_work": "Kitáb-i-Íqán" | null,
  "tools":   ["entity_dossier", "hybrid_search"],   // which of the toolbox to actually run
  "effort":  "fast" | "precision",       // the cascade gate ([06])
  "confidence": 0.0-1.0                   // low → fall back to the general 'discussion' pattern
}
```

Everything downstream (which tools run, how hard, how it renders) is a function of this plan. The
plan is the "branch" — it's how we run *only* the relevant tools instead of all of them.

### The classifier — near-free, never on the critical path

Routing must not add latency, so it is **heuristics-first with a lightweight-LLM fallback, run
speculatively in parallel** with a default retrieval:

1. **Heuristics (0ms, high precision).** Capitalized person-name patterns → biography; explicit
   religion adjectives → facet; trigger words ("history of", "timeline", "when" → timeline; "story
   of", "what happened at" → story; "compile", "list of", "passages about" → compilation;
   "compare", "other religions", "across traditions" → comparison). These resolve a large fraction
   with zero cost.
2. **Lightweight LLM for the ambiguous rest (~0.4s).** A single Groq structured-output/tool call
   (the *lightweight tier* — `gpt-oss-20b`) returns the full `QueryPlan`. Proven: Groq does exactly
   this classification+extraction in **0.43s**.
3. **Speculative parallelism.** Fire the router *and* a default hybrid retrieval simultaneously. If
   the router picks a specialized pattern, we use it; if it's slow or low-confidence, the generic
   hits are already in hand. Routing therefore never costs serial time.

### The pattern registry (data-driven, evolvable)

A **pattern** is a registered object, not hardcoded control flow — new types are added by
registering, not by editing the core:

```jsonc
// Pattern
{
  "name": "biography",
  "matchers": { "heuristics": [/* regex/keyword rules */], "classifierHint": "asks who a person is" },
  "tools": ["entity_lookup", "entity_dossier", "bio_search"],
  "retrieve": /* (plan) => candidates */,
  "format":   /* (candidates) => { shape:'card', blocks:[...] } */,
  "fallback": "discussion",
  "eval": "biography"   // ← links to the per-type quality suite (Part C)
}
```

### The initial patterns

Most tools already exist; the registry is the orchestration layer that *chooses* among them.

| Pattern | Trigger | Tools / data (existing) | Shape |
|---|---|---|---|
| **biography** | person name / "who is/was…" | `entity_lookup → entity_dossier → bioSearch` (cited facts, dates, death, connections) | card |
| **fact** | short factual "what does X say about Y" | hybrid top-3 (HyPE-weighted) → cascade fast path | answer |
| **story** | "tell me about [event]", "what happened at…" | episode rosters (`research_notes.episodes`) + sequential read | narrative |
| **discussion** | "nature of…", "meaning of…" (default) | HyPE-semantic, multi-passage, multi-perspective | discussion |
| **timeline** | "when…", "history of…", "sequence of" | `entity_claims.time_value` (PIN/EST) + episodes | timeline |
| **compilation** | "passages about…", "list/compile" | catalog + `deep_research` + broad semantic | list |
| **comparison** | "what do [other] religions say", "compare" | per-tradition facet fan-out | grid |
| **overview** | "what do you have", author/scope | `library_overview` / `library_count` | catalog |

Faceting is a modifier: a religion flag (explicit or detected) → **filter** to that tradition;
comparison intent → **fan out** per tradition; otherwise **none** (and skip the expensive 16-way
fan-out entirely — a major saving on the common case).

### Placement

Build as a shared **`api/lib/query-router.js`** consumed by *both* `/search` and
`jafar-pipeline.js` — this generalizes Jafar's existing research-phase dispatcher
(`classifyIntentAndEntities` + its ~10 routing rules) rather than duplicating it. One router, two
callers.

---

## Part B — The typed response contract (frontend)

Different answer shapes render differently — a biography **card**, a **timeline**, a comparison
**grid**, a **narrative**, a terse **answer**. So a pattern returns a *typed* response:

```jsonc
{ "shape": "timeline",
  "blocks": [ { "type": "event", "date": "1844", "text": "…", "citation": {url, source} }, … ],
  "meta": { "intent": "timeline", "confidence": 0.9, "tools": [...] } }
```

The frontend renders per `shape`. Designing this contract early lets the backend patterns and the
UI evolve together instead of retrofitting.

---

## Part C — Per-Type Quality Assessment (measure to improve)

Each pattern ships with its **own evaluation suite** so quality is tracked and improved per type,
not globally. This is the "comprehensive quality assessment for each search type."

### Structure

```
tests/quality/patterns/<pattern>.json     — fixtures: {query, expect:{...}, notes}
tests/quality/score-patterns.mjs          — runs fixtures, scores, reports per-pattern
```

### Per-type metrics (what "good" means differs by shape)

| Pattern | Primary quality metrics |
|---|---|
| biography | correct entity resolved; every fact cited + proof-gated; no namesake conflation; death/dates present |
| fact | answer faithful to the cited passage; correct passage surfaced; ≤ N words; link resolves |
| story | key participants present (roster completeness); chronology correct; no fabricated events |
| discussion | multi-perspective coverage; each claim cited; no ungrounded synthesis |
| timeline | events in correct order; PIN vs EST dates honest; no missing keystone events |
| compilation | recall (did we get the known members?); no duplicates (post-dedup); grouped sensibly |
| comparison | each named tradition represented; authority-correct source per tradition; balanced |
| overview | counts accurate vs DB; collections complete |
| **routing itself** | % queries routed to the correct pattern (the gate that governs all the above) |

### The feedback loop (evolve the taxonomy)

- Log every `(query → chosen pattern → effort → outcome/score)`.
- Mis-scored or low-confidence queries become **new fixtures** and **few-shot examples** for the
  classifier — the router sharpens itself.
- Clusters of "general/discussion fallback" queries that share a shape reveal a **missing pattern**
  to add to the registry. The taxonomy grows from real usage.

### Cross-cutting invariants (all patterns)
Every answer is **cited** (proof-gated, [05](05-entity-knowledge-layer.md)); the deterministic
**dedup + score-floor** pre-filter runs after retrieval in every pattern (38.8% of the corpus is
duplicate content — measured); nothing is fabricated; honest "not established" over a flattering
guess.

---

## Part D — Cache-Friendly Bulk HyPE on deepseek-v4-flash

The enrichment side (feeding [04](04-hype.md)) moves to **deepseek-v4-flash** for HyPE generation,
structured to maximize DeepSeek's automatic **prefix (context) caching**. Verified empirically:

- v4-flash produces good HyPE (5 registered question types + thesis); ~3s/call.
- A shared system prefix caches: a 2nd call with the same prefix returned
  **`cache_hit=128 / miss=100`** — DeepSeek serves the repeated prefix from cache (billed ~10%).

### The prompt shape (maximize the stable prefix)

```
┌─ STABLE PREFIX (cached across every paragraph in the book) ─────────────┐
│ system: HyPE instructions (fixed)                                        │
│       + book metadata (title, author, tradition, description)            │
│       + a list of paragraph SUMMARIES for the book (context, compact)    │
├─ VARIABLE SUFFIX (the only thing that changes per request) ─────────────┤
│ user:   the TARGET paragraph (+ its own summary)                         │
└──────────────────────────────────────────────────────────────────────────┘
```

Because the prefix (instructions + metadata + summary-list) is **identical for every paragraph in a
book**, each request after the first reuses it from cache. Push the stable/variable ratio toward
**90%+ cached** by making the summary-list the dominant, fixed part and the target paragraph the
small variable part. (Sending *summaries* rather than full neighbor paragraphs keeps the prefix
compact *and* stable — the key trick.)

### Bulk & parallelism

- **Within a book:** warm the cache with the first paragraph, then process the rest — each hits the
  cached prefix. Cheap + fast.
- **Across books (parallel):** each book has a *different* prefix → its *own* cache entry, so books
  process in parallel without cache interference. Fire N books concurrently; each warms and reuses
  its own prefix.
- **Measure it:** log `prompt_cache_hit_tokens / prompt_tokens` per call and report the book's
  aggregate cache-hit ratio — the definition of "caches well." Target ≥ 90% steady-state.
- This is the same jumping-window / prefix-cache principle already used for disambiguation
  ([03](03-disambiguation-and-segmentation.md)), now on DeepSeek for HyPE, replacing the local-Qwen
  path — durable and cheap for the ROB ingest ahead.

---

## Phased implementation plan

1. **Deterministic wins (no router yet):** dedup-by-`normalized_hash` + Meili score-floor pre-filter
   in `/search` (helps every pattern; safe). Run the Meili-vs-AI agreement A/B to calibrate the
   `effort` gate.
2. **Router foundation:** `api/lib/query-router.js` — contract, heuristics, Groq lightweight
   classifier, registry, speculative-parallel harness. Behind a flag.
3. **First three patterns end-to-end** (highest signal/value): **biography**, **comparison**,
   **fact** — each with its per-type eval suite (Part C).
4. **Typed response contract** + frontend renderers for those shapes.
5. **Remaining patterns:** story, timeline, compilation, discussion, overview + their evals.
6. **Bulk HyPE on deepseek-v4-flash** (Part D) — cache-structured prompt, per-book cache-ratio
   telemetry, parallel-book runner; validate on a real book before ROB.
7. **Feedback loop:** log routing outcomes → fixtures + classifier few-shots; surface missing
   patterns.

Model tiers throughout ([08](08-operations-and-stability.md)): router + fast path + bulk HyPE on
the cheap/fast tier (Groq `gpt-oss-20b` / DeepSeek v4-flash); precision synthesis on the smart-fast
tier (Groq `gpt-oss-120b`). Groq free-tier rate limits still apply → the gpt-4.1-mini fallback
covers throttling until the Groq tier is upgraded ([reference: groq search analysis]).
