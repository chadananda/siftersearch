# 01 — The Data Model

> Before you can follow a document in or a query out, you need the vocabulary: what is stored,
> where, and why. This document defines the three stores and the tables that matter. Everything
> else in the documentation set refers back to these.

The governing idea, restated from the [overview](README.md): **SQLite is the source of truth;
Meilisearch and the entity layer are regenerable projections of it.** Nothing derived is precious.
That single decision is what makes the system safe to optimize aggressively.

---

## The three stores

| Store | Technology | Role | Rebuildable? |
|---|---|---|---|
| **Content store** | SQLite (`sifter.db`), `docs` + `content` | The source of truth: every document and every paragraph, with embeddings, enrichments, and provenance. | No — this is the origin. Backed up. |
| **Search index** | Meilisearch (`paragraphs`, `hype_questions`, `documents`, …) | A projection of `content` optimized for keyword + vector retrieval. | Yes — from `content`. |
| **Entity layer** | SQLite tables in `sifter.db` (`graph_entities`, `entity_mentions_v2`, `entity_claims`, `entity_decisions`, …) | A knowledge graph over *cited claims* derived from the content. Answers relational/biographical questions. | Yes — the projection tables regenerate from the append-only decision + mention + claim substrate. |

The content store is one canonical SQLite database in WAL mode. A **single-writer rule** protects it:
only the worker and the library-watcher processes ever write; the API is read-only. (See
[08](08-operations-and-stability.md) for why the single-writer rule is load-bearing, not incidental.)

---

## The content store

### `docs` — one row per document

A document is a book, tablet, compilation, or article. `docs` holds its metadata and the hashes
that drive change detection.

Columns that matter (see [09](09-appendix-schema-and-config.md) for the full list):

- **Identity & change detection**
  - `file_path` (UNIQUE) — the relative path in the library tree; the canonical identifier.
  - `file_hash` — SHA-256 of the *entire* file (frontmatter + body). Detects any change at all.
  - `body_hash` — SHA-256 of the body only. Distinguishes a content change from a metadata-only
    edit, and detects a *rename* (same body, new path). This split is what lets the ingester skip
    re-embedding when only frontmatter changed. → [02](02-ingestion.md)
- **Metadata**: `title`, `author`, `religion`, `collection`, `language`, `year`, `description`.
  `religion`/`collection` are derived from the library path (or frontmatter as fallback).
- **Authority & access**: `authority` (a ranking weight; primary scripture high, popular works
  low — see [06](06-retrieval.md)), `encumbered` (copyright/usage restriction), `scope`
  (`primary` | `supplemental` | `site-only` — the three-class model for external sites).
- **External-source tracking**: `source_site` (e.g. `oceanlibrary.com`, else NULL for the main
  corpus), `source_url` (canonical URL, used to build citation deep-links), `duplicate_of`
  (points at the doc that supersedes this one), `external_id`.
- **Lifecycle**: `deleted_at` (soft-delete timestamp; NULL = active), `paragraph_count`, `slug`.

### `content` — one row per paragraph

The paragraph is the **atomic unit** of the system: the unit that is chunked, embedded,
disambiguated, questioned, indexed, and cited. Everything hangs off `content`.

Columns grouped by purpose:

- **Identity & text**: `id`, `doc_id` (→ `docs`), `paragraph_index` (0-based position),
  `text` (clean, no markdown), `heading`, `blocktype` (`paragraph` | `heading1..3` | `quote` |
  `list_item` | `code`).
- **Hashing / dedup**:
  - `content_hash` — hash of the exact text; change detection within a document.
  - `normalized_hash` — hash of the *normalized* text (punctuation/case/formatting stripped).
    This is the **cross-corpus embedding-reuse key**: the same passage quoted in fifty documents
    shares one embedding. → [02](02-ingestion.md) §embedding cache.
- **Vectors**: `embedding` / `embedding_grounded` (BLOB) — the 512-dim MRL vector (see
  [07](07-embeddings-and-vector-index.md)); `embedding_model` (records which model produced it,
  so a model upgrade can be detected and re-run).
- **Enrichment sidecars** (the three enrichment layers write here):
  - `context` + `context_model` — the disambiguation note that makes the paragraph standalone.
    → [03](03-disambiguation-and-segmentation.md)
  - `hyp_questions` + `hyp_thesis` — the hypothetical questions and one-line doctrinal thesis.
    → [04](04-hype.md)
  - `topic_tags`, `question_types`, `para_meta` — topical tagging and per-paragraph authorship
    metadata (a compilation paragraph may have a different author than its containing doc).
  - `text_grounded` + `embedding_grounded` — the paragraph with entity names resolved to
    canonical forms, and its embedding, for entity-aware retrieval. → [05](05-entity-knowledge-layer.md)
- **External linkage**: `external_para_id` (e.g. `para_13` at the source site) — the key that
  builds a citation deep-link as `${source_url}?paraId=${external_para_id}`; `pdf_page`,
  `block_attrs`, per-paragraph `language`.
- **Sync flags** (each derived projection has its own dirty bit, so one enrichment finishing
  doesn't force the others to re-run):
  - `synced` — 0 = needs pushing to the Meili `paragraphs` index; 1 = confirmed indexed.
  - `enhanced_synced` — HyPE questions/thesis pushed to the `hype_questions` index.
  - `grounded_synced` — grounded embedding synced.
  - `graph_enriched` — entity extraction has run over this paragraph.
- **Lifecycle**: `is_duplicate` (paragraph belongs to a superseded doc → deleted from Meili),
  `deleted_at`.

The presence of *separate* dirty flags (`synced`, `enhanced_synced`, `grounded_synced`,
`graph_enriched`) is a deliberate design point: each projection converges independently. A
paragraph can be indexed for keyword search long before its entity extraction runs.

---

## The search index (Meilisearch)

Meili holds several indexes, each a projection of `content`/`docs`:

| Index | Projects | Searchable on | Purpose |
|---|---|---|---|
| `paragraphs` | `content` rows | `text`, `heading`, `context` + 512-dim vector | The main hybrid (keyword + vector) retrieval surface. |
| `hype_questions` | one row per hypothetical question/thesis | `question_text` + vector | Question-space retrieval; closes the query↔statement gap. → [04](04-hype.md) |
| `documents` | `docs` rows | `title`, `author`, `description` | Document/catalog lookup ("how many books by X"). |
| `deep_research` | curated Q&A sets | question, summary, Q&A | Pre-computed answers for common questions. |
| `entity_mentions_idx` | entity mentions | surface forms, entity name | Entity-aware retrieval. |
| `siftersearch_{prefix}_paragraphs` | per-site content | as `paragraphs` | Isolated indexes for `site-only` external sites (walled off). |

Each vector-bearing index uses a **user-provided embedder** at 512 dimensions with binary
quantization — SifterSearch computes the vectors; Meili just stores and searches them. Full
embedder config is in [07](07-embeddings-and-vector-index.md).

---

## The entity layer

The entity layer models *who and what the texts talk about*. It is built on a strict separation
between an **append-only substrate** (facts of record) and a **regenerable projection** (the
current best view). This is what makes identity decisions auditable and reversible.

- **`entity_mentions_v2`** — the atoms. One row per *mention*: a name at a position in a
  paragraph (`doc_id`, `para_id`, `occurrence`, `surface`, `surface_norm`). The `anchor` column
  is a hash of the source location, so re-extracting the same text yields the same stable anchor.
  Crucially, `entity_id` is **NULL until resolved** — extractors record mentions; binding is a
  separate, evidence-based step. (This encodes the principle *name nominates, evidence binds*.)
- **`entity_claims`** — the cited facts. One row per claim: a `relation` (born/died/wrote/
  witnessed/…), a `statement`, a **`proof_verbatim`** (an exact quote that must occur in the
  cited paragraph), `doc_id` + `para_id`, temporal fields (`time_value`, `time_precision`,
  `time_basis`, `time_anchor` — dates are PINs or ESTIMATES, never silently exact), and
  validation gates (`proof_ok`, `subject_ok`, `consistency_ok`). A claim that can't prove itself
  is rejected. → [05](05-entity-knowledge-layer.md)
- **`entity_decisions`** — the append-only log. Every merge/split/verify/reassign/quarantine is
  a row with an `actor` and an `actor_tier` (3 = human > 2 = strong model > 1 = flash model >
  0 = derived), plus `supersedes` links. Nothing is ever destructively edited; the projection is
  rebuilt from this log, so any decision can be reversed by superseding it.
- **`graph_entities`** — the projection. The materialized "current view" of each entity
  (`canonical_name`, `entity_type`, `description`, counts, prominence), regenerated from the
  substrate above.
- **`entity_lookup_keys`** — a transliteration-invariant recall index (`skeleton_key` →
  entity). Used only to *suggest* candidates for a name (Ṣádiq/Sadeq/Sadiq collapse to one
  skeleton); never determinative. → [05](05-entity-knowledge-layer.md)
- **`graph_relations`** — directed entity-to-entity relations for graph traversal/visualization.

---

## Why this shape (the lesson)

1. **One source of truth, many projections.** Because Meili and the entity tables are derived,
   you can re-embed, re-quantize, re-extract, or rebuild any of them without data loss. The
   content store is the only thing you must never lose — so it's the only thing backed up as
   precious.
2. **Provenance is in the schema, not bolted on.** `content` carries `external_para_id`/
   `source_url` for citations; `entity_claims` carries `proof_verbatim` + `doc_id`/`para_id`.
   The database cannot hold an un-citable fact by design.
3. **Independent dirty flags = independent convergence.** Every projection has its own "needs
   work" bit, so pipelines don't block each other and each can be proven to drain to zero
   (see [08](08-operations-and-stability.md)).

→ Next: [02 — Ingestion](02-ingestion.md), the life of a document from file to indexed paragraph.
