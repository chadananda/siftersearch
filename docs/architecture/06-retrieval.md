# 06 — Retrieval: The Life of a Query

> **The RAG problem, in four parts:** a good answer must be *relevant* (match the question),
> *authoritative* (prefer the primary source over a paraphrase), *diverse* (not drowned by the
> largest tradition), and *honest* (grounded in real, cited passages — never hallucinated). A single
> vector search delivers none of these reliably. This document follows a question from keystroke to
> answer and shows how each property is engineered in.

Two architectural ideas frame everything here:

- **Deterministic first, AI second.** A fast, exact, cited retrieval layer does the finding; a
  slower AI layer only *words* what was found. The AI never chooses evidence or invents sources.
- **Retrieval is a fusion, not a lookup.** Several indexes and signals are combined; the vector
  index is one voice among many.

---

## 1. The deterministic layer (fast, exact, cited)

This layer must feel instant, and be provably so. It is pure retrieval — Meilisearch plus the
entity DB — with no LLM in the hot path. It is exposed on its own so it can be measured
independently (the endpoint `/search/quick` is keyword-only; raw Meili keyword latency runs ~60–90 ms
over ~4M paragraphs). The user's standard for this layer is explicit: *the deterministic Meili part
should be instantaneous.*

### 1a. Hybrid search (keyword + vector)

Every content query runs as a **hybrid** against the `paragraphs` index: a BM25 keyword query and a
512-dim vector query, fused by Meili at a configurable `semanticRatio`.

- **Keyword (BM25)** nails exact phrases, proper nouns, and rare terms — where embeddings are weak.
- **Vector** captures meaning and paraphrase — where keywords miss.
- `semanticRatio` is **tuned per tradition/text**, because the right balance differs by corpus.
  Archaic, high-variance vocabulary (Islamic texts, varied Bahá'í transliteration) leans more
  semantic (~0.4); the King James Bible, whose exact phrasing users quote, leans fully to keyword
  (~0). This per-tradition tuning is a small thing that matters a lot.

Binary quantization ([07](07-embeddings-and-vector-index.md)) makes the vector half fast; the
keyword half and the reranker (below) recover the precision quantization gives up.

### 1b. Multi-index fusion (RRF)

The query hits several indexes in parallel — `paragraphs` (text), `hype_questions` (the
hypothetical-question sidecar, [04](04-hype.md)), and the entity index — and their rankings are
combined by **Reciprocal Rank Fusion** on `paragraph_id`:

```
score(paragraph) = Σ_index  weight_index / (K + rank_in_index)      // K = 60
```

HyPE is weighted highest (~1.5) because a question-to-question match is the strongest relevance
signal. A paragraph that ranks well in *several* indexes wins. RRF needs no training and no
cross-index score calibration — it uses ranks only — so new signals can be added without
destabilizing the ranking.

### 1c. Cross-tradition federation (diversity)

The corpus is heavily imbalanced — one tradition dominates by volume. A single unfiltered vector
query would return that tradition almost exclusively, burying everything else. The fix is
**federation**: fan the query out into per-tradition sub-queries (each `religion`-filtered), plus
per-tradition author anchors and vocabulary transforms (e.g. "mercy" → "loving-kindness" for
Buddhist texts; author-anchored, keyword-leaning for the KJV). The results are merged so every
tradition is represented, with an authority boost for canonical OceanLibrary sources.

> **A cost to watch.** Federation currently issues on the order of a dozen-plus filtered vector
> sub-queries per unfiltered query. With binary quantization each sub-query is cheap, so this is
> affordable — but it is measured, and collapsing the fan-out into a single unfiltered query with
> in-application diversification is the fallback if the sub-query cost ever dominates. The principle:
> *diversity is worth sub-queries only as long as the sub-queries are cheap.*

### 1d. Reranking (precision at the top)

The fused candidate pool is re-scored by two mechanisms:

- **Authority reranking.** A source-hierarchy weight (`api/lib/authority.js`) lifts higher-authority
  sources: revealed scripture > authoritative interpretation > primary history > scholarship >
  popular works, with a boost for canonical originals. This is RAG problem #6: relevance is not the
  same as authority, and in a corpus with a real source hierarchy the answer should prefer the
  primary text over a blog that paraphrases it.
- **Cross-encoder rerank** (Voyage/Cohere, `api/lib/reranker.js`) re-orders the top candidates with
  a full-precision relevance model. This is what recovers the fine-grained ranking precision that
  binary quantization traded away: the vector index only has to get the right paragraphs *into* the
  pool; the cross-encoder orders them.

### 1e. The entity/biography path

Person and relationship questions are routed to `bioSearch` ([05](05-entity-knowledge-layer.md)),
which answers from the proof-gated `entity_claims` catalog and resolves group/roster/connection
questions deterministically (shared-episode rosters, `graph_relations`). This is the deterministic
answer to the "chunks can't reason about people" problem — and, like all of this layer, it returns
only cited claims.

---

## 2. The AI layer (grounded phrasing, never invention)

Only after the deterministic layer has produced a ranked, cited candidate set does an LLM get
involved — and its job is strictly to **word the evidence**, not to find or judge it.

`api/lib/parallel-analyzer.js` runs the AI analysis (summarize + synthesize) over the retrieved
passages to produce the human-readable answer with per-point citation links. Key constraints, each
a scar from a real failure:

- The model sees **only** the retrieved passages; it may not add outside facts.
- Its output is forced to structured/JSON form where needed, because a model asked to "summarize"
  will otherwise drift into prose that drops the machine-readable result (a DeepSeek prose reply once
  returned zero search results until a `json_object` response format was enforced).
- Citations are generated from the passages' own metadata — `${source_url}?paraId=${external_para_id}`
  — never fabricated. Where the book's own wording can be quoted, it is, with a link from the quote
  to the source.

> **The provider split (cost vs. latency).** AI model selection is centralized
> ([08](08-operations-and-stability.md)) so providers swap without touching call sites. The policy:
> **DeepSeek for backend, heavily-parallel bulk work** (disambiguation, HyPE, extraction — cheap at
> volume); **fast user-facing models (GPT-turbo / Haiku class) for the live answer**, where latency
> is felt. The deterministic layer stays instant regardless; the AI layer's ~seconds of latency is
> the analysis, and is the primary target for further speed work (it, not Meili, is what makes the
> full `/search` take several seconds).

---

## 3. Anís: the chat agent

The chat agent is **Anís** (the Ocean AI Research Assistant). One transport-neutral turn function,
`anisTurn()` (`api/lib/assistant/turn.js`), serves the widget, the site chat (`POST /api/chat/stream`)
and email. Jev (System-1) reads the turn with its history and chooses a strategy; the strategy's tree
of activities (search, fetch, rank, judge, shape) runs on this retrieval stack; one writer call phrases
only what was found, and code guards quotes, links and format. A turn no strategy fits goes to
**Unmatched**, which plans a new strategy. Full reference: [anis-trm.md](anis-trm.md).
(Jafar is the CTAI.info agent, not part of SifterSearch.)

---

## The life of a query, end to end

```
user question
  → deterministic layer (no LLM in hot path):
      embed query
      hybrid search (BM25 + vector, per-tradition semanticRatio)   paragraphs index
      + HyPE sidecar + entity index      →  RRF fuse on paragraph_id
      cross-tradition federation (per-religion sub-queries, merged)
      authority rerank + cross-encoder rerank
      [person/relationship? → bioSearch over cited entity_claims]
      = ranked, CITED candidate passages   (target: instant)
  → AI layer (phrasing only):
      analyze ONLY those passages → grounded answer + per-point citation links
      (backend bulk = DeepSeek; live answer = fast GPT-turbo/Haiku class)
  → [chat] Anís: Jev picks a strategy → its tree runs → one writer call → code guards
```

Relevance comes from hybrid + HyPE + RRF; authority from the rerank hierarchy; diversity from
federation; honesty from cited-only retrieval plus an AI layer that may only phrase what was
retrieved. Each of the four properties is a distinct, deliberate mechanism — which is the lesson:
*"good RAG" is not one model choice; it is four separate problems, each solved on purpose.*

→ Next: [07 — Embeddings & the vector index](07-embeddings-and-vector-index.md) (if you skipped it)
and [08 — Operations & stability](08-operations-and-stability.md), which keeps all of this fast,
cheap, and convergent.
