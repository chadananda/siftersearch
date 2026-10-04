# Phrase index — build plan (2026-10-01)

Why and the measurements: planning/search-strategy-options.md. Test harness: tests/quality/crosslingual/.

**Goal:** a side index of phrase spans across the whole library. Each entry points into an untouched paragraph
(paragraph_id + character offsets), carries a vector and filter ids, and is ranked alongside the existing layers.
It is a *projection*: everything in it can be recomputed from SQLite + the vector store, one document at a time.

**Invariants**
- Paragraph text is never cut or rewritten. Units are offsets.
- Units come from edition structure or the language's own markers — never from length. A paragraph with no rule
  for its language is ONE unit (flagged), not a sliced one.
- The `paragraphs` Meili index is not touched (settings change = a week's re-index).
- No LLM re-ranking. Fusion is RRF; any re-rank is System-1.
- Metadata (title, author) never goes into the phrase vector — measured: it halves cross-language accuracy.

## Architecture

```
SQLite content (read-only for this service)
   │  paragraphs, mentions, claims, alignments, links
   ▼
siftersearch-phrase-indexer   (new PM2 process; owns its own state, no load on the single writer)
   1 segment   api/lib/phrases/  per-language rules → [{start,end}]  (deterministic, versioned)
   2 embed     phrase + ~30 words of neighbouring phrases → Gemini (batch API for backfill, online for new)
   3 store     vector store on /tank  (float16 shards keyed by paragraph_id + segmenter/model version)
   4 tag       entity_ids, concept_ids, link ids located onto spans (offsets computed here)
   5 index     → Meili `phrases` (second Meili instance, port 7701 on tower-nas, data on /fast)
   state: data/phrases.db  (per-doc: segmenter_version, embed_model, tag_version, indexed_at, counts)
   ▼
API: multiIndexSearch gains a `phrase` layer; /search/original = link pivot ∪ phrase layer; hits return offsets
```

Why these choices:
- **Own process and own state DB.** 36M rows through the `/write` single writer would revive the writer stalls of
  July/August. Units are deterministic from text + segmenter version, so SQLite stores no unit rows at all — only
  per-document stamps, in the indexer's own `phrases.db`.
- **Vector store outside Meili.** Meili's binary quantization discards the floats; without our own copy, any Meili
  rebuild or settings change means paying to re-embed. float16 at 3072 dims ≈ 6 KB/phrase ≈ 220 GB for 36M on /tank.
- **Second Meili instance.** Backfill indexing of tens of millions of entries must not starve live search. Same
  binary, separate port and data dir; the API queries both. Also makes the load test risk-free.

## Phrase entry (Meili `phrases`)

```
id               paragraph_id * 1000 + k
paragraph_id     → paragraphs index (distinct attribute)
doc_id, k, start, end
language, religion, author_id, collection, authority, encumbered     (filters; copied from the paragraph; ar/fa = one group)
fa_share         0..1 Persian share of the phrase's grammar words (ranking signal for "Persian"/"Arabic" asks)
kind             phrase | question | rendering                         (question/rendering: later phases)
entity_ids[], concept_ids[], link_ids[]                                (later phases; partial updates)
seg_v, emb_v     version stamps
_vectors         { literal: [...] }            later: { grounded: [...] }  (second embedder, same index)
```
No text field (text stays in `paragraphs`; measured lean size 1.5 KB/phrase at 3072 bits → ~55 GB for 36M).
Settings: `distinctAttribute: paragraph_id`, embedder `literal` userProvided 3072 (or 1536 — see P1), binaryQuantized.

## P1 findings so far (2026-10-01)

- **Gemini 1536 vs 3072 bits** (cached vectors, free): 1536 loses ~3 points (in-book @1 66.5 vs 69.0, originals
  32.7 vs 36.3) to save ~20% of index disk → **3072**.
- **Census** (production, sampled ~30 docs/language, low load): paragraphs by language en 4.34M, ar 1.63M, he 0.34M,
  fa 0.20M, zh 39k, fr/es/it/de small. Units/paragraph: ar 5.4, fa 5.5, he 2.7 (verses), en 14.2 on a sample that
  ran long (314 words/para vs the library's ~180) → ~8/para corrected. **Estimate ~46M units today** (raw sample
  extrapolation 72.5M is an upper bound) → plan for ~46M now, ~90M doubled. Disk at 1.5 KB: ~70 GB / ~135 GB.
- **English: phrase beats paragraph** (292 docs / 26.6k paragraphs / 164k phrases; whole-corpus search; 434 queries —
  396 stored HyPE questions → their paragraph, 14 exact quotations, 7 lay paraphrases, 17 known-answer cases).
  All @1 / @10: paragraph OpenAI 512 bits (≈ production) 38.5 / 66.1 · paragraph Gemini 44.5 / 74.7 ·
  **phrase Gemini 3072 bits 52.5 / 74.9** · phrase Gemini float 54.6 / 79.3. HyPE questions were written from whole
  paragraphs (biased toward paragraph vectors) and phrases still win. Gate passed.
- **Classical Arabic/Persian normalisation (Chad 10-01: lots of classical text, Persian and Arabic mixed).**
  `api/lib/arabic-script.js` = the ONE folding definition (harakat, superscript alef, Qur'anic annotation + verse
  marks, tatweel, ZWNJ/bidi controls, NFKC presentation forms/ligatures, ی/ي ک/ك ى ة/ۀ hamza seats, Arabic/Persian
  digits) + grammar-word scoring. **No Persian/Arabic division is assumed** (Chad 10-01: classical Islamic writing
  mixes them; Persian prose is full of Arabic terms and quotation). Splitter phr-v3 = ONE rule set: Arabic clause
  openers and Persian-only openers fire everywhere; Persian verb endings and shared openers fire only where the clause
  itself shows Persian (grammar word or پ چ ژ گ). Measured v3 vs v1: in-book @1 72.2 vs 71.8, originals @1 40.9 vs
  40.6, exact phrase @1 29.5 vs 29.2 — best of the three versions. Measured: on the 19.5k-paragraph test set, 2,988 'ar'-labelled
  paragraphs are Persian (Ẓuhúru'l-Ḥaqq) and 1,567 'fa'-labelled are Arabic (tablets inside Persian volumes) — 10/10
  spot-checks correct. → phrase entries carry `fa_share` (0 = Arabic … 1 = Persian, from the phrase's own grammar
  words) — a measure to rank by, never a filter that excludes; the language filter treats ar+fa as one group.
  Units +31% (real Persian clause boundaries); accuracy neutral (in-book 72.7 vs 71.8 @1, originals 40.0 vs 40.6).
  **Embedding input stays RAW**: folding it before embedding measured worse (originals @1 37.8 vs 40.0; in-book @10
  88.6 vs 91.0). Folding is for decisions and keys only.
  Follow-up (not now): the four older partial folds (search/fuzzy.js, segmenter/detect.js, rag/concepts/anchor.js,
  translit-key.js) should import arabic-script.js — translit-key feeds stored entity lookup keys, so change it only
  with a key rebuild.
- **Chinese**: CJK rule added (split after 。！？；, character-level; tests).
- `api/lib/phrases.js` ported, 67 tests incl. exact parity with the measured Python splitter on 61 real paragraphs.

- **Embedding model → `gemini-embedding-2`** (stable 2026-03; 001 shuts down 2028-05-14; vectors incompatible).
  Same test sets: cross-language in-book @1/@10 72.7/91.8 (001: 72.2/91.0), originals 40.4/66.4 (40.9/62.9);
  English all 58.1/82.5 (54.6/79.3), HyPE questions 59.1/83.8 (54.8/79.5). Exact English quotations fell
  (4/14 vs 7/14 @1 — small sample; quotations go through the keyword layer anyway). Task is a prompt prefix:
  queries `task: search result | query: …`, documents `title: none | text: …` (no titles — measured harmful).
  Price $0.20/M tokens, batch $0.10 → ~46M units × ~70 tokens ≈ 3.2B tokens ≈ **$320 batch** (+ HyPE ~1.7M short
  questions, a few dollars).
- **Rescoring (Qdrant-style) measured offline, free** (127k real Gemini vectors, exact search): binary only 69.0 /
  38.2 @1 (in-book / originals); binary top-100 then full-precision rescoring 72.2 / 41.7 = the same as full float
  (72.2 / 41.8). Meili cannot rescore, so it keeps the binary loss (~3–4 points); Qdrant recovers it with 100
  candidates.

- **Meili 1.54 vs Qdrant 1.19 on IDENTICAL data** (tower-nas, same Gemini-2 vectors, same phrases, same filters;
  tests/quality/crosslingual/engines.py). Server time; Meili timings taken while its 10M load test was indexing.

  | | ar/fa in-book @1/@10 | originals @1/@10 | English all @1/@10 | server p50/p99 |
  |---|---|---|---|---|
  | Meili one-bit | 68.2 / 90.2 | 40.2 / 63.7 | 54.4 / 78.6 | 10–12 / 16–87 ms |
  | Meili top-100 + app rescoring (our vector store) | 70.2 / 91.8 | 41.3 / 67.9 | 58.3 / 83.2 | ~48 / 80 ms |
  | Qdrant one-bit | 68.6 / 90.2 | 42.2 / 66.2 | 56.0 / 81.1 | 3.5–3.9 / 6–7 ms |
  | Qdrant one-bit + rescoring | 72.7 / 91.8 | 41.7 / 69.0 | 58.1 / 83.6 | 4 / 7 ms |

  Index time at 125k/164k: Meili 527/692 s, Qdrant 604/785 s. **Meili + our rescoring ≈ Qdrant** (equal in English,
  −1 to −2.5 on ar/fa: Meili's distinct keeps one unit per paragraph chosen by bits before we rescore). Both fit a
  < 1 s turn. Open: indexing and latency at 46–90M (matched scale test), and multi-step trees need stored vectors by id
  (Qdrant native; Meili → our vector store).

- **Keyword search without Meili** (tests/quality/crosslingual/lexical_test.py; 46,112 paragraphs, same queries):

  | | ar/fa fragments, unvocalised, ی/ي ک/ك swapped @1/@10 | English fragments @1/@10 | exact (14) @1/@10 | known-answer (17) @1/@10 |
  |---|---|---|---|---|
  | Meili keyword | 82.7 / 87.3 | 90.3 / 95.3 | 50.0 / 64.3 | 64.7 / 76.5 |
  | SQLite FTS5 + our folding (phrase → AND → OR) + word-order resort | 98.7 / 100 | 94.0 / 97.7 | 42.9 / 71.4 | 47.1 / 88.2 |
  | Qdrant BM25 sparse (our tokens/TF, IDF by Qdrant) + word-order resort | 98.7 / 100 | 92.0 / 96.3 | 42.9 / 71.4 | 52.9 / 88.2 |

  Word-order resort = re-sort the top 50 by how many query word pairs occur in order (deterministic, ms). Our
  Arabic-script folding beats Meili's on unvocalised/variant spellings by 16 points @1. Small sets (14/17) are noise.
  Not available in Qdrant: typo tolerance, prefix search (only matters for search-as-you-type), highlighting (→ Jev
  picks highlight spans; lexical hits highlight their tokens). → **Meili is not needed for keyword retrieval.**

## Phases

### P1 — Segmenters + English measurement (no spend beyond ~$5)
- Port tests/quality/crosslingual/phrases.py → `api/lib/phrases/` with a language registry:
  `ar`, `fa` (clause markers, measured), `en` and other punctuated languages (sentence + clause punctuation),
  edition structure (verse/numbered sections) first wherever present. Unknown language → whole paragraph, flagged.
  Reuse `api/lib/markers.js` offset round-trip (`parseMarkers`/`verifyMarkedText`); check `api/services/segmenter.js`
  for reusable boundary logic before writing new.
- Unit tests per language from real paragraphs (golden files).
- **Census** (read-only, production via internal API): units per language, total → replaces the 36M estimate.
- **English battery:** topical queries (type battery, 76) + phrase/quotation queries (SE citations English → English
  source). Compare paragraph vs phrase, Gemini 3072 vs 1536 bits. Gate: phrase ≥ paragraph on English; pick dims.

### P2 — Load test on tower-nas (free)
- Second Meili instance; 10M entries with **random vectors** at the chosen dims (indexing cost does not depend on
  meaning; quality is already measured locally). Measure: indexing rate, disk, RSS, query p50/p99 with
  language/doc filters + distinct, live `paragraphs` search latency during indexing.
- Gate: ≤ ~1 day per 10M, p99 ≤ 200 ms filtered. Fail → Qdrant for the phrase vectors (options doc, option D),
  same indexer, swap step 5.

### P3 — Indexer service + backfill
- `siftersearch-phrase-indexer`: idempotent per document; picks docs whose stamps lag the current versions.
- Backfill via Gemini batch API (half price), in priority order:
  1. Bahá'í Arabic/Persian originals + their linked translations (the CTAI use case)
  2. the ~898 enriched works
  3. rest of Bahá'í
  4. other traditions
- New/changed documents: online embedding, minutes after ingest (hook where the embedding worker picks up
  unembedded paragraphs).
- Spend meter: route Gemini embedding calls through `logAIUsage` (embeddings bypass the chat chokepoint today).
- Progress endpoint on the internal API (docs done / units / spend / ETA) — control via API, not SSH.

### P4 — Search integration
- `searchPhrases()` beside `searchHypeQuestions()`; add to `multiIndexSearch` parallel layers + RRF weight (tuned on
  both batteries). Query embedding: Gemini via `query-embedding.js` memo (runs in parallel with the OpenAI query
  embedding the paragraph layer still needs, so latency = the slower of the two).
- Hits carry `{paragraph_id, start, end}` → highlight the phrase in UI and public API.
- `/search/original`: link pivot first, phrase layer (filtered to the original's language) second; return the span.
- Gate: crosslingual battery ≥ measured local numbers; type battery no regression; p50 within the 1 s budget.

### P5 — ID tags (partial updates, no re-embedding)
- Entities: `entity_mentions_v2` has no offsets — locate the `occurrence`-th `surface` in the paragraph → offset →
  phrase. Store binding ids (per-document), never global ids: global identity = query-time expansion table, so a
  merge/split touches no index entries.
- Concepts: locate `proof_verbatim` in its paragraph → phrase(s) → `concept_ids`.
- Links: align phrases inside each aligned paragraph pair (order-preserving DP over phrase vectors, as
  /concepts/align-crosslingual) → span-level `link_ids`; translations become `rendering` entries pointing at the
  original phrase; tags propagate across the link both ways.
- HyPE: re-point each question at its nearest phrase (cosine within the paragraph); index as `question` entries.

### P5b — Strategy layer (System-1 picks search strategy, re-ranker and answer format)
Separate plan: planning/search-strategy-layer.md. Starts after P4. Its battery reuses all of P1's test sets.

### P6 — Meaning layers (separate enrichment plan; feeds this index)
These change what a phrase MEANS in place; the index consumes their output as `grounded` vectors and ids.
- **Structured context.** `content.context` is a flattened display string today; store the JSON
  (`{place, era, idea, resolve[]}`) as its own column so stages can read it.
- **Gap research (Chad, 10-01).** Per paragraph: "what concepts, referents or implied arguments are missing or
  ambiguous here?" → answer by searching EARLIER paragraphs of the same work (phrase index, `doc_id` +
  paragraph_index filter) → write the answers into the disambiguation layer, versioned and reversible. Uses P3's
  index, so it runs after P3 for each work.
- **Argument outline** per work (threads, digressions, resumptions) and placement of each paragraph in it.
- **Statements:** per-phrase in-place restatement written from all of the above → second embedder `grounded`.
  Literal vectors stay for wording and quotation finding.
- Test first on the Íqán, Dawn-Breakers, God Passes By, Some Answered Questions (argument- and referent-heavy).

## Cost and time (to be firmed up by P1 census and P2)

| item | estimate |
|---|---|
| Gemini embedding, backfill (~2.5B tokens, batch) | ~$190 (online price ~$375) |
| Query embeddings | negligible |
| Disk: Meili phrases (3072 bits) | ~55 GB today, ~111 GB doubled (/fast) |
| Disk: vector store (float16 3072) | ~220 GB today (/tank) |
| Backfill wall time | unknown — Gemini batch throughput + Meili indexing rate (P2) |

## Qdrant scale test — PASSED (2026-10-01)
10M synthetic 3072-dim entries on tower-nas (Qdrant 1.19.1; vectors on disk, binary in RAM; 8 parallel uploaders,
graph built once at the end on 56 threads): upload 37 min (~16M/h) · graph build 23 min · ~1 h empty → searchable ·
filtered search with group-by-paragraph + rescoring p50 53 ms / p99 113 ms · live Meili search during build 33 ms
(unaffected) · disk 60 GB · RSS 13 GB. Meili's comparable run: 1.74M in ~2 h, 0.85M/h and falling. → 46M ≈ 4–5 h.

## Stack direction (Chad, 2026-10-01)
**Qdrant** (phrase vectors with built-in rescoring + BM25 sparse keyword retrieval for paragraphs and site texts) +
**SQLite** (source of truth; texts, doc_meta, FTS5) + **Jev** (strategy, branching, re-ranking, highlights, format).
**Meili retired** at the swap — measured unnecessary for both semantic (rescoring) and keyword (folding + word-order
resort) retrieval. Gate: Qdrant sustains indexing and filtered latency to 10M+ (load test running on tower-nas;
Meili's comparable run reached 1.74M in ~2 h, 0.85M/h and falling).

## Decisions (Chad, 2026-10-01)
1. Vendor: **Gemini** — model now `gemini-embedding-2` (measured better; 001 retires 2028).
2. Spend: ~$5 for P1 tests approved; the ~$190 backfill comes back for approval after P2.
3. Dims: decided by the P1 test (3072 vs 1536).
4. **Second Meili instance** on tower-nas for `phrases`.
