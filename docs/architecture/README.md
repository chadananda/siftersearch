# SifterSearch Architecture — How to Build a RAG System That Actually Works

This is the complete, self-contained description of how SifterSearch ingests a library of
religious texts and answers questions about them. It is written to do two things at once:

1. **Teach.** Every subsystem here exists to solve a specific, recurring problem in
   Retrieval-Augmented Generation (RAG). If you read straight through, you get a course in
   *why* naive "chunk it and embed it" RAG disappoints, and what a production system does
   instead.
2. **Enable reconstruction.** There is enough detail — schemas, algorithms, model choices,
   thresholds, and the reasoning behind each — that a competent engineer could rebuild the
   system from these documents alone.

If you only read one file, read this one. The numbered documents that follow are the
recreatable detail; this one is the map and the argument.

---

## What the system is

SifterSearch is a semantic search and question-answering platform over a large corpus of
Bábí–Bahá'í scripture, history, and scholarship (millions of paragraphs, multiple languages,
multiple "traditions"/religions in the wider library). The goal is stated bluntly internally:
*be twice as good as a general web search assistant, for this domain.* It answers three kinds
of question that ordinary keyword search cannot:

- **Conceptual** — "what do these texts say about the nature of the soul?"
- **Relational** — "which Letters of the Living met Bahá'u'lláh, and where?"
- **Evidentiary** — every answer is grounded in cited, linkable source paragraphs.

Achieving that requires far more than an embedding model and a vector database. It requires
a *pipeline* that prepares documents so they retrieve well, a *knowledge layer* that models
the people and events the texts talk about, and a *retrieval stack* that balances relevance,
authority, and honesty.

---

## Why naive RAG fails (the problems this system solves)

The textbook RAG recipe is: split documents into chunks, embed each chunk, embed the query,
return the nearest chunks, stuff them into an LLM prompt. It demos well and fails in
production for concrete, predictable reasons. Each subsystem in SifterSearch is the answer to
one of these failures. Keep this list in mind; it is the throughline of the whole document set.

| # | The RAG problem | Where it's solved |
|---|---|---|
| 1 | **Chunk granularity.** Too big and embeddings blur many ideas together; too small and they lose context. | Ingestion — paragraph-level chunking ([02](02-ingestion.md)) |
| 2 | **The orphaned chunk.** A retrieved paragraph that says *"He then declared His mission"* is useless alone — who is "He"? Embeddings of ambiguous text are ambiguous. | Disambiguation / the *context* layer ([03](03-disambiguation-and-segmentation.md)) |
| 3 | **No sentence boundaries.** Arabic, Farsi, Hebrew, and Urdu source texts often arrive without reliable paragraph/sentence breaks, so there is nothing sensible to chunk. | AI segmentation ([03](03-disambiguation-and-segmentation.md)) |
| 4 | **The vocabulary gap.** Users ask *questions* ("how should I treat my enemies?"); scripture makes *statements* ("Consort with all men in a spirit of friendliness"). Their embeddings don't match well. | HyPE — Hypothetical Prompt Embeddings ([04](04-hype.md)) |
| 5 | **Chunks can't reason about entities.** "Who accompanied the Báb to Mecca?" is not answerable by nearest-neighbor over paragraphs — it needs a model of *people* and their *cited* connections. | The entity knowledge layer ([05](05-entity-knowledge-layer.md)) |
| 6 | **Relevance ≠ authority.** A blog paraphrase can out-embed the primary scripture it paraphrases. Naive RAG surfaces the loudest match, not the most authoritative source. | Authority reranking ([06](06-retrieval.md)) |
| 7 | **Corpus imbalance.** When one tradition is 96% of the library, a single vector search returns only that tradition. | Cross-tradition federation ([06](06-retrieval.md)) |
| 8 | **Hallucinated citations.** An LLM asked to "answer from these passages" will confidently cite things the passages don't say. | Proof-gated evidence + the deterministic/AI split ([05](05-entity-knowledge-layer.md), [06](06-retrieval.md)) |
| 9 | **Cost and speed at scale.** Full-precision vectors and premium models make a large index slow and a live search expensive. | Embeddings + binary quantization + tiered models ([07](07-embeddings-and-vector-index.md), [08](08-operations-and-stability.md)) |
| 10 | **Pipeline instability.** A single un-ingestable file can put the indexer into an infinite retry loop that thrashes the whole system. | Convergent pipelines ([08](08-operations-and-stability.md)) |

---

## The principles (the lessons that recur)

These are the hard-won rules the codebase keeps returning to. They are worth internalizing
before the details, because every design choice downstream follows from one of them.

1. **Provenance or it didn't happen.** Every fact, alias, and claim in the knowledge layer
   carries a citation (`doc_id` + `para_id`) and a *verbatim proof span* that literally occurs
   in that paragraph. A fact without a citation is worthless — it can't be verified, corrected,
   or improved over time. Write-time gates enforce this; unprovable data is rejected, not stored.

2. **Disambiguate before you extract.** You cannot pull reliable facts out of ambiguous text.
   The invariant order is **DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH.** Extracting entities
   from raw ("He met him at the fort") text builds on sand.

3. **Name nominates, evidence binds.** A name is a *label*, not an identity. "Mírzá Aḥmad"
   might be a dozen different people. Candidate generation may *suggest* who a mention refers to
   (by fuzzy, transliteration-invariant matching), but the *decision* to bind or merge is made
   by comparing evidence — never by matching strings. The canonical name is for lookup only,
   never determinative.

3b. **Identity is anchored to the text, not to a name.** The atom of identity is the *mention*
   — a name at a position, in its surrounding context. An entity is a *resolved cluster of
   mentions*. This is why provenance is non-negotiable: strip the anchor and you have a floating
   string that mis-files facts.

4. **Search reads facts; it never builds them.** Retrieval surfaces cited claims — it does not
   mint new ones. Facts are built only by the extraction pipeline, book by book. Conflating the
   two is how fabrications enter (a search that "gathers" an uncited fact will eventually assert
   a hallucination as truth).

5. **Deterministic first, AI second.** The system separates a *deterministic* layer (exact,
   instant, cited retrieval and lookups) from an *AI* layer (which words and summarizes what the
   deterministic layer found). The AI never chooses candidates or invents evidence; it phrases
   evidence that was already retrieved. This makes answers fast, cheap where it matters, and
   impossible to hallucinate a source.

6. **Convergence is a property you must design in.** Every loop that writes content or syncs to
   the index must *converge*: each item either succeeds (done) or reaches a terminal failure
   state (recorded, not retried), never infinite-retry. A pipeline without a terminal failure
   state will, the first time it meets an un-processable item, thrash forever.

7. **Authority is a first-class ranking signal.** In a corpus with a clear hierarchy of
   sources (revealed scripture > authoritative interpretation > primary history > scholarship >
   popular works), retrieval must weight *who said it*, not just *how well it matches*.

8. **Compactness buys speed.** Vectors are compressed (512 dimensions via Matryoshka
   truncation, then 1-bit binary quantization) because a smaller index is a faster index. The
   quality lost is recovered by the enrichment layers (disambiguation, HyPE, reranking).

---

## The architecture at a glance

SifterSearch runs across **two surfaces**, deliberately separated:

**Surface 1 — the origin / data plane (`tower-nas`, an 80-core / 188GB server).**
A Fastify API, a single canonical **SQLite** database (`sifter.db`, the source of truth for all
content and knowledge), a **Meilisearch** instance (the search index), and a set of PM2 worker
processes that ingest, enrich, and sync. A separate machine (`boss`) runs local LLMs (vLLM) for
cheap bulk inference. This surface is exposed to the public through a Cloudflare Tunnel as
`api.siftersearch.com`.

**Surface 2 — the edge / presentation plane (Cloudflare Pages + Workers).**
A server-rendered Astro/Svelte frontend at `siftersearch.com`. It holds no application logic;
it fetches dynamic content from the origin API at request time and caches responses at the edge.

The important architectural idea is the **three stores** and the **direction of flow between them**:

```
   markdown files                          user question
        │                                       │
        ▼   (INGESTION + ENRICHMENT)             ▼  (RETRIEVAL)
  ┌───────────────┐   projects to    ┌───────────────┐
  │  SQLite        │ ───────────────► │  Meilisearch   │
  │  (source of    │   (sync)         │  (search index)│
  │   truth:       │                  │  paragraphs,   │
  │   content,     │                  │  hype_questions,│
  │   entities)    │ ◄─────────────── │  documents…    │
  └───────────────┘   reads for       └───────────────┘
        │              enrichment
        │  projects to
        ▼
  ┌───────────────┐
  │  Entity layer  │   the knowledge graph over CITED claims:
  │  (mentions →   │   who/what the texts talk about, and the
  │   claims →     │   evidence for every connection.
  │   entities)    │
  └───────────────┘
```

**SQLite is the source of truth.** Meilisearch is a *projection* of it, rebuildable at any time.
The entity layer is a second projection — a knowledge graph derived from the same content. This
"source of truth + regenerable projections" shape is the reason the system can be aggressively
optimized (re-embed, re-quantize, re-extract) without fear: nothing derived is precious.

The pipeline order invariant governs *when* each projection is built:

> **DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH**

Content is first made self-contained (disambiguation), then facts are extracted from the
disambiguated text, then facts are integrated/reconciled into entities, and only then is any of
it trusted for search. Skipping ahead — extracting from raw text, or searching un-reconciled
claims — produces exactly the failures in the table above.

---

## Two journeys (the narrative spine)

The rest of the documentation is organized around two stories. If you follow both, you have
seen the whole system end to end.

**The life of a document (ingestion, inward).** A markdown file lands in the watched library
tree. It is parsed into blocks, chunked into paragraphs, and each paragraph is *disambiguated*
into a standalone form. Paragraphs are embedded (reusing a cross-corpus cache so identical text
is never embedded twice), and *hypothetical questions* are generated and embedded alongside
them. Facts about people and events are extracted from the disambiguated text and reconciled
into the entity layer. Finally, the paragraph — with its embedding, its questions, its context —
is synced into Meilisearch. The single-writer worker guarantees this converges: every paragraph
ends either indexed or terminally recorded, never looping. → [02](02-ingestion.md),
[03](03-disambiguation-and-segmentation.md), [04](04-hype.md), [05](05-entity-knowledge-layer.md)

**The life of a query (retrieval, outward).** A user asks a question. The system embeds it and
runs a *hybrid* search (keyword + semantic) — federated per-tradition so no single tradition
crowds out the rest — against both the paragraph index and the hypothetical-question index.
Results are reranked by authority (canonical sources rise) and by a cross-encoder. A fast
deterministic layer returns the cited passages instantly; an AI layer then composes a
grounded, quoted, link-per-point answer from *only* those passages. Relational questions
("who met whom") are answered from the entity layer's cited claims rather than from chunks. The
Jafar chat agent wraps all of this in a tool-using research loop. → [06](06-retrieval.md)

---

## How to read the rest

| Doc | What it covers |
|---|---|
| [01 — Data model](01-data-model.md) | The three stores; the `content`/`docs` schema; the Meili indexes; the entity tables. The vocabulary for everything else. |
| [02 — Ingestion](02-ingestion.md) | The life of a document: parsing, chunking, the embedding cache, the single-writer sync, external-site ingestion, change/duplicate detection. |
| [03 — Disambiguation & segmentation](03-disambiguation-and-segmentation.md) | Making chunks self-contained; segmenting boundary-less scripts. |
| [04 — HyPE](04-hype.md) | Hypothetical Prompt Embeddings: closing the question↔statement vocabulary gap. |
| [05 — The entity knowledge layer](05-entity-knowledge-layer.md) | Mentions → claims → entities; provenance; the identity principles; biography search. |
| [06 — Retrieval](06-retrieval.md) | Hybrid search, cross-tradition federation, authority reranking, the deterministic/AI split, biography search, the Jafar chat agent. |
| [07 — Embeddings & the vector index](07-embeddings-and-vector-index.md) | Model choice, Matryoshka 512-dim truncation, binary quantization, the vector-index config. |
| [08 — Operations & stability](08-operations-and-stability.md) | Convergent pipelines, the failure modes and their fixes, tiered AI providers, monitoring and proof, deployment. |
| [09 — Appendix: schema & config](09-appendix-schema-and-config.md) | Full table schemas, the model registry, thresholds, environment configuration. |
| [Unified enrichment pipeline (v2)](unified-enrichment-pipeline.md) | **New 2026-07-10.** The one gated orchestrator (`doc_pipeline` state, migration 89) that replaced the six always-on enrichment/entity workers — enforces DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE per book, in authority order. |
| [Historical Track](history-track.md) | **New 2026-07-11.** One of the two extraction pipelines: the *factual* layer (person/tablet/event, cited + proof-gated), ordered by source authority (primary/eyewitness before 3rd-party), multilingual + continuation-robust (Momen's genealogies). |
| [Conceptual Track](conceptual-track.md) | **New 2026-07-11 (design).** The parallel pipeline: *organizing doctrine* — a concept ontology (keystone: the Dispensation) + `concept` entities, seeded top-down by interpretive authority (Shoghi Effendi → 'Abdu'l-Bahá → Bahá'u'lláh → …). |

### Going deeper

This set is the cohesive, educational spine — enough to understand and rebuild the system. Several
older documents in `docs/` hold additional subsystem depth and are worth reading alongside the
relevant chapter:

- `docs/architecture/unified-enrichment-pipeline.md` — the current (2026-07-10) enrichment
  orchestrator that replaced the six always-on workers; the authoritative source for *how and in what
  order* every enrichment layer is produced (→ [02](02-ingestion.md), [04](04-hype.md),
  [05](05-entity-knowledge-layer.md), [08](08-operations-and-stability.md)).
- `docs/entity-architecture.md`, `docs/entity-extraction.md` — the entity layer in full detail
  (→ [05](05-entity-knowledge-layer.md)). Note: `docs/entity-upgrade.md` is a **superseded** plan
  (six-worker topology retired 2026-07-10).
- `docs/retrieval-architecture.md` — the retrieval stack internals (→ [06](06-retrieval.md)).
- `docs/content-pipeline.md`, `docs/architecture-content-pipeline.md`, `docs/sync-architecture.md`
  — ingestion and sync internals (→ [02](02-ingestion.md), [08](08-operations-and-stability.md)).
- `docs/disambiguation-methodology.md` — disambiguation practice (→ [03](03-disambiguation-and-segmentation.md)).
- `docs/jafar-chat-assistant.md`, `docs/jafar-system-prompt-v2.md` — the chat agent
  (→ [06](06-retrieval.md) §Jafar).
- `docs/sites-integration.md` — external-site ingestion (→ [02](02-ingestion.md) §6).

Where those older documents disagree with this set on a specific number or model name, this set is
the more recent and takes precedence (notably: embeddings are stored at **512** dimensions).

A note on honesty, which is itself a design value here: where a subsystem has known rough edges
or in-flight work, the documents say so. A system you can trust is one whose documentation tells
you where the bodies are buried.
