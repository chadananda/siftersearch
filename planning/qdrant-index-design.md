# Qdrant index design — collections, channels and fields, derived from the search strategies (2026-10-01)

Principle (Chad): searching for a published source ≠ searching for the original-language source ≠ searching for an
answer to a question. Each strategy names the collection, channel and filters it uses; fields and payload indexes
follow from that — and more are added later when the strategy logs show demand (planning/document-metadata-plan.md).
SQLite stays the source of truth (texts, doc_meta, link tables, identity); Qdrant holds projections rebuildable per
document. No text in Qdrant except where a channel needs it.

## Collections

| collection | one point per | channels | why separate |
|---|---|---|---|
| `phrases` | phrase unit (all languages, all texts) | dense `literal` (Gemini-2 3072, binary in RAM, rescoring); later dense `grounded` | the semantic core; grouped by paragraph |
| `paragraphs` | paragraph (library + sites) | sparse `bm25` (our folding, IDF by Qdrant) | keyword channel; measured better than Meili; text fetched from SQLite for word-order resort + display |
| `questions` | HyPE question | dense `literal` | question-shaped matching; own ranking; points at its best phrase — kept apart so phrase filters/grouping stay clean |
| `concepts` | concept card (definition + terms in every language) | dense `literal` + sparse `bm25` over terms | entry point for best_expression / define_term; small |
| *(SQLite)* doc_meta, units, links, identity | — | FTS5, joins | metadata lookups, pivots, quotation links, entity expansion stay relational |

## Payload fields (`phrases`; the same document/unit fields copied onto `paragraphs`)

| field | from | indexed at start? | used by |
|---|---|---|---|
| `paragraph_id`, `doc_id`, `k`, `start`, `end` | segmentation | paragraph_id (group_by), doc_id | every strategy (grouping, book scope, highlight offsets) |
| `lang_group` (ar-fa · en · he · zh · …), `fa_share` | detection (arabic-script.js) | lang_group | find_original, find_published, compare |
| `religion`, `collection`, `source_site` | docs | yes | scope narrowing, site search |
| `author_id` (the voice), `translator_id` | doc_meta / units | author_id | author-scoped, find_published |
| `kind` (scripture · translation · interpretation · history · scholarship · letter · talk · prayer · …) | doc_meta / units | yes | find_published (kind = translation), authority layers, prayer by occasion |
| `authority` (1–10), `translation_authority` (authorised · approved · provisional · scholarly) | authority.js / doc_meta | authority; translation_authority | find_published, answer_question, authority re-rank |
| `date_written` (year range), `date_published` | doc_meta / units | later — on demand | timelines, "written before …", concept development |
| `unit_id` (talk, letter, diary entry, extract) | unit metadata | later | metadata_gather, parallel accounts |
| `entity_ids` (per-document binding ids) | entity_mentions_v2 → offsets | yes | person_event, prosopography, who-was-there |
| `concept_ids` | concept claims' proof spans | yes | best_expression, define_term, compilation |
| `aligned_ids` (phrase ids of the aligned original/translation) | span alignment (P5) | yes | find_original ⇄ find_published (pivot inside Qdrant) |
| `quotes_ids` / `quoted_by` (paragraph ids) | content_source_links | later | who quotes this, citation tracing, dedupe copies |
| `thread_id`, `role` | argument outline (enrichment P6) | later | argument |

## Strategy → channels → filters → re-rank

| strategy | 1st channel | then | filters | re-rank |
|---|---|---|---|---|
| **find_original** (English → Arabic/Persian) | link pivot: `aligned_ids` / content_alignment | `phrases.literal`, query = English, **lang_group = ar-fa** (or the source language) | religion; author if known (rank, not filter) | original_first; Jev highlight in original + aligned English |
| **find_published** (original or paraphrase → authorised English) | pivot from the original phrase's `aligned_ids` | `phrases.literal`, lang_group = en, **kind = translation**, same author as the original | translation_authority ≥ approved first | translation_authority, then score |
| **exact_quote** | `paragraphs.bm25` + word-order resort | `phrases.literal` as backup | scope if named | none; highlight = matched tokens |
| **answer_question** | `questions.literal` → their phrases | `phrases.literal` (later `grounded`) | religion/author scope; authority ≥ n when doctrinal | answerhood (Jev), authority |
| **best_expression** (of an idea) | `concepts` → **concept_ids** on phrases | `phrases.literal` with the concept card's vector | concept_ids, authority | expressiveness (Jev), authority |
| **person_event** | **entity_ids** (identity expansion from SQLite) | `phrases.literal` (later `grounded`) for what happened | entity_ids, date range, place | primary_speaker / chronological |
| **define_term** | `concepts` (dense + term bm25) | phrases with concept_ids; lexicon (SQLite) | — | authority |
| **compare** | `phrases.literal` once per religion, in parallel | — | religion = each | diversity |
| **enumerate / metadata_gather** | SQLite doc_meta + units (or Qdrant scroll with filters, order_by) | Jev fills gaps from unit evidence | kind, author, place, date | chronological / document order |
| **metadata_lookup** | SQLite doc_meta (FTS5) | — | — | — |
| **who quotes this / cross-references** | SQLite link tables | stored vector of the phrase by id → `phrases.literal` neighbours, same author first | author, authority | authority / chronology |
| **argument** | thread_id / role | — | doc_id | document order |
| **follow-up hops** | ids from the working set (entity_ids, concept_ids, aligned_ids, quotes_ids) | stored vectors by id (no new embedding) | as the branch requires | as the strategy |

## Initial payload indexes (create with the collection)
`phrases`: paragraph_id, doc_id, lang_group, religion, source_site, author_id, kind, authority, translation_authority,
entity_ids, concept_ids, aligned_ids. `paragraphs`: doc_id, lang_group, religion, source_site, author_id, kind, authority.
Everything else is added on demand (set-payload + create index; no re-embedding).

## Open questions
- `questions` as its own collection (proposed) vs a `kind=question` point type in `phrases`.
- Paragraph keyword only, or also phrase-level BM25 (exact-quote highlight comes from offsets either way).
- Site texts: inside `paragraphs` with `source_site` (proposed) vs one collection per site.
