# CorpusRAG — the reusable enrichment/retrieval library

Status: BUILDING (2026-07-11). One reusable library performs all corpus enrichment and retrieval —
disambiguation, HyPE, the entity (factual) layer, and the concept (doctrinal) layer — behind a single
interface. The [Historical](history-track.md) and [Conceptual](conceptual-track.md) tracks are two
*uses* of this library; the [unified pipeline](unified-enrichment-pipeline.md) is its orchestration.

## The interface is the contract

Callers speak **capabilities**, never files. One import (`createCorpusRAG`) yields the whole surface;
everything beneath it is implementation, free to move, and **deliberately not named anywhere** — in code
or in these docs. **This interface is the deepest level of implementation these conceptual docs surface.**

```
const rag = createCorpusRAG()          // defaults: shared DB, single-writer, model routing (below)
```

Every capability is **idempotent** (re-running touches only what changed), **resumable**, and **gated**
(nothing runs on text that has not been disambiguated first).

## Capabilities

### Understanding

- **`rag.profile(doc)`** — resolve a document's language, script, genre, domain, and per-stage model
  routing. Everything else keys off the profile. Returns the profile; writes nothing.

### Passage enrichment

- **`rag.disambiguate(doc)`** — make each passage self-contained: a faithful note stating place, era, the
  running idea, and the resolution of any bare/variant/ambiguous name — so a later reader (who has not seen
  the surrounding text) can place the passage and tell who/what is meant. Written in English; the passage's
  own qualifier overrides prominence; honorifics kept; under-resolve rather than mis-resolve. **This is the
  gate** — every capability below requires it to have run.
- **`rag.retrieval.index(doc)`** — generate the hypothetical questions (HyPE) each passage answers, in
  English, for search recall across the whole multilingual corpus.

### The factual layer — `rag.entities.*`

*Who existed, who did what, when, where. Ordered, across books, by textual rigor.*

- **`rag.entities.mentions(doc)`** — record every name-occurrence at its text position. Identity is
  **deferred** — a mention is anchored to the source, never bound to an entity by name-matching.
- **`rag.entities.claims(doc)`** — extract cited biographical facts, each carrying a verbatim proof span
  present in the paragraph (no anonymous facts). Subject/relation/object written in English; proof kept
  verbatim in the source language. Continuation-robust (dense genealogies captured in full).
- **`rag.entities.reconcile(doc)`** — resolve mention-clusters to entities by **evidence**: recall
  candidates by transliteration-invariant name, then adjudicate by role/place/era/connection agreement
  (name similarity alone never binds). Emits **proposed decisions** into an append-only log; high-impact or
  uncertain ones route to human review. Never edits the graph.
- **`rag.entities.project()`** — materialize entities as a function of mentions + the decision log
  (cluster → attach claims → apply verified overrides). The materialized graph is a disposable cache;
  regenerating the cheap layers never damages the accumulated decisions.
- **`rag.entities.lookup(q)`** — transliteration-invariant recall for any spelling (Sadeq→Ṣádiq,
  Ghoddus→Quddús). Returns **candidates only** — never determinative of identity.

### The doctrinal layer — `rag.concepts.*`

*Organizing teaching. Ordered, across books, top-down by interpretive authority.*

- **`rag.concepts.lexicon.seed(doc)`** — grow the authority-ranked, cited **interpretive lexicon** (symbol
  / concept → its authoritative interpretation). Populated top-down from the higher texts (which *are*
  interpretation), then spent when binding lower texts.
- **`rag.concepts.disambiguate(doc)`** — disambiguation that additionally carries the running argument, so
  a doctrinal back-reference ("this Will," "the aforementioned station") resolves standing alone.
- **`rag.concepts.extract(doc)`** — lift concepts to first-class entities and extract interpretation-claims
  (work → concept → teaching), proof-gated. This is what populates the lexicon from the higher texts.
- **`rag.concepts.reconcile(doc)`** — bind a symbol/metaphor occurrence in a lower text to its authoritative
  meaning by evidence + authority, proof-gated; literal and metaphorical kept as separate attributed layers;
  under-bind rather than mis-bind.
- **`rag.concepts.link(a, b)`** — connect concepts across traditions: *authoritative bridges* (an authority
  explicitly connects them) and *analogical links* (family resemblance, marked as such, never asserting
  identity). This is what lets a reader query one concept across religions in each tradition's own terms.

### Orchestration

- **`rag.pipeline.drain()` / `rag.pipeline.status()`** — run and report the gated, priority-ordered,
  per-document pipeline that composes the capabilities above (DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE).

## Model routing (swappable — never hard-coded)

No capability names a specific AI model. Model choice is resolved from two existing mappings, so it adjusts
as technology advances — **including using local models** — by editing configuration, never code:

- a **price/provider catalog** of every available model (cloud and local), the authority for which provider
  serves a model and what it costs;
- a **language routing policy** mapping each stage + language to a primary model and a fallback.

Each passage tries its primary model and **escalates to the fallback** on failure (self-healing across a
multilingual corpus — the cheap model is used where it is reliable, a stronger one where it is not). Adding
a model — or a local endpoint — is a catalog/policy entry; the capabilities are untouched.

## Guarantees that hold across the whole library

- **Disambiguation gates everything.** No extraction on un-disambiguated text.
- **Identity is deferred, then decided by evidence** — never by romanization match — and recorded as
  **append-only decisions**, so better models improve entities without regenerating them
  ([improvable architecture](../entity-improvable-architecture.md)).
- **Every fact is cited and proof-gated.** No anonymous facts.
- **Enrichment is English-canonical; proof stays verbatim** in the source language — one query reaches the
  whole multilingual corpus while the source remains searchable in its own language.
