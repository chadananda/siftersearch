# Index coverage — every layer visible, no long queries (Chad 10-16)

> "All types of data indexing should be clear and visible and easily observed without long-running queries … The goal
> here is to have a growing library of highly accessible interfaith literature. I cannot start adding more until we
> have retrieval working really well."

## Priority order (Chad 10-16)
1. **Findability** — basic vector + keyword indexing of paragraphs, phrases and words, "so we can actually find something
   we already know exists". Measured by the KNOWN-ITEM test: a real paragraph's own fragment must bring it back.
2. **Exploration by questions** — disambiguation, then HyPE.
3. **Scholarly analysis** — concept extraction and historical (entity) extraction.

Within every tier: **doctrinal core first** ("Probably doctrinal core first") — each tradition's scripture and its
authoritative interpretation (Bahá'í: the Báb, Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi, the Universal House of Justice;
Qur'an; Bible; Gita/Upanishads; Pali canon; …) before secondary literature. The ledger reports the core as its own row.

## The ledger
`index_coverage` (migration 150): one row per **document × layer** — `total` paragraphs, `generated` (the derived data
exists), `current` (at the current version), `indexed` (searchable: in Meili / Qdrant / FTS), `version`, `updated_at`.
~54k docs × 13 layers ≈ 700k small rows; every dashboard number is a GROUP BY over it (milliseconds), never a scan of
`content` or a vector store.

Kept fresh three ways:
1. **Producers** re-measure the documents they just touched (grounding completion, phrase/hype/concept index runs,
   section-index, ingestion) — `coverage-refresh {ids}`.
2. **Rolling refresh**: the reports worker re-measures the 300 stalest documents every minute (all docs ≈ 3 h), so
   anything a producer forgets still converges.
3. Per-document measurement is cheap by construction: one document's rows by `doc_id` index + Qdrant `count` with the
   `doc_id` payload index (~2 ms).

## Layers
| layer | generated = | indexed = |
|---|---|---|
| text | live paragraphs | Meili synced (`synced = 1`) |
| embedding (paragraph, 512-d) | `embedding` present | Meili synced |
| keyword (BM25) | — | Qdrant `paragraphs_kw` points |
| phrase | — | Qdrant `phrases` points |
| sections (sub-documents) | `doc_sections` rows | `doc_sections_fts` |
| context (disambiguation) | `context` present (`current` = context_model ok) | not separately indexed (feeds HyPE/extraction) |
| hype | `hyp_questions` present (`current` = HYPE_VERSION) | Qdrant `hype` points |
| entities (historic) | `extract_model` stamped / mentions | `entity_mentions_v2` active mentions (graph) |
| concepts | `concept_claims` proof_ok paragraphs | Qdrant `concepts` points |
| alignment (language links) | `content_alignment` live links | **not indexed — gap** |
| translation (non-English, unlinked) | `translation` present | **not indexed — gap** |

## Surfaces
- `GET /api/admin/index-coverage` — by tradition × scope × layer (and per document with `?doc=`).
- Admin page **Index coverage**: one matrix, % generated / % current / % indexed, version drift, last refresh age.

## Retrieval methods missing (for Chad)
1. **Reference index** — "Qur'an 2:255", "John 3:16", "Gleanings CXXV", "Aqdas ¶155", "Hidden Words Persian #19":
   structured citation → paragraph, every tradition. Today only Hidden Words resolves (Anís special case).
2. **Cross-lingual pivot** — English query → aligned original (and back) through `content_alignment`, as an index layer,
   not a per-answer lookup. Plus **translation embeddings** for non-English passages that have no aligned English.
3. **Work/section-scoped search** — the plan names the work; search runs inside the book or section (in progress).
4. **Near-verbatim quote index** (shingles/minhash) — a half-remembered quote with changed words, and duplicate
   detection across copies; phrase vectors are semantic, BM25 is word-bag.
5. **Quote graph as a pivot** — "where else is this passage quoted / what does it quote" (246k source links exist,
   not searchable).
6. **Authority-aware reranking** — scripture > interpretation > pilgrim notes before the reply sees them (HyPE layer
   is off in production until this exists).
7. **Retrieval evaluation per layer** — a gold battery per query type, run nightly, recall@k per layer on the same
   dashboard: "working really well" becomes a number.
