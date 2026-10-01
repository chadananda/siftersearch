# Search strategy — options (overnight research, 2026-09-30 → 10-01)

**The question (Chad):** convert what we have — entities, disambiguation, concepts, HyPE, translation and source
links — into one search that finds a phrase or a concept in any language, leaves out no person or idea, stays very
fast, stays memory-light (Meili-style, near-embedded), and survives the library doubling.

Everything below marked *measured* ran tonight on our own battery (tests/quality/crosslingual/, 819 cases: English
phrase / sentence / citation → the Arabic or Persian original; judged by text overlap, never by our ids). "Book" =
search narrowed to the right work; "originals" = all Bahá'í Arabic/Persian. Whole-paragraph queries are excluded from
the headline numbers ("nobody ever searches with whole paragraphs").

## The short answer

1. **Phrase-level vectors are the fix, and they need a second index.** One vector per paragraph averages many ideas;
   one vector per phrase (embedded with ~30 words of neighbouring phrases) finds the passage AND returns the exact
   phrase. Paragraphs are never cut — phrases are index entries pointing into an untouched paragraph.
2. **The model matters as much as the granularity.** Gemini embedding beats OpenAI 3-large on every cut; OpenAI
   at 512 dims (what production uses) is the weakest thing we measured. *(Local open models: see BGE-M3 / Qwen3 rows.)*
3. **Binary quantization is fine at high dimension, ruinous at 512.** Gemini 3072-bit loses 3–4 points; OpenAI
   512-bit loses 8–12 (production today is the 512-bit case).
4. **The link graph is the strongest single tool for originals — use it first, vectors second.** English → our
   translation link → original finds 54% at rank 1 by itself; combined with phrase vectors, 72% at rank 1, 85% in
   the top 10.
5. **Do NOT put title/author into the phrase vector.** Tested: it halves cross-language accuracy (originals @1
   27% → 15%). Metadata belongs in filters. (Context notes not yet tested — same risk; test before using.)
6. **Meili can hold it** as a lean, vectors-only phrase index (measured 0.9–1.5 KB per phrase on disk, memory-mapped),
   with an unmeasured risk at 36–73M phrases: indexing time. That must be load-tested on tower-nas before committing.

## Measured results

Test set "small": every target paragraph + every paragraph of the 5 test books + random Bahá'í ar/fa distractors =
19,496 paragraphs / 100,001 phrases. All models run on the SAME set. Queries: 245 in-book, 545 corpus-wide (phrase,
sentence, citation). exact@1 = the returned PHRASE itself holds the target.

| option | in-book @1 | in-book @10 | originals @1 | originals @10 | originals exact@1 |
|---|---|---|---|---|---|
| paragraph vector, OpenAI 512 (≈ production)¹ | 35.5% | 70.6% | 9.7% | 24.2% | — |
| phrase, OpenAI 512 binary (production model + quantization) | 46.5% | 76.3% | 19.6% | 37.8% | 12.1% |
| phrase, OpenAI 512 float | 56.3% | 84.9% | 27.2% | 49.5% | 17.2% |
| phrase, OpenAI 512 + title/author header | 54.7% | 86.1% | **15.4%** | 31.6% | 11.9% |
| phrase, OpenAI 3072 float | 62.0% | 86.9% | 33.2% | 58.9% | 22.4% |
| phrase, Gemini 768 binary | 60.0% | 86.1% | 26.2% | 52.7% | 17.6% |
| phrase, **Gemini 3072 binary** | 69.0% | 87.8% | 36.3% | 61.5% | 27.3% |
| phrase, Gemini 3072 float | **71.8%** | **91.4%** | **40.6%** | **62.8%** | **29.2%** |
| phrase, BGE-M3 1024 float (local, free) | 53.5% | 81.2% | 23.5% | 39.8% | 21.1% |
| phrase, Qwen3-Embedding-0.6B 1024 (local, free; custom query instruction, fp16) | 35.5% | 70.2% | 8.4% | 23.5% | 6.4% |
| **link pivot** (English → link graph → original; production API, no vectors) | — | — | 53.6% | 62.8%² | — |
| pivot ∪ phrase OpenAI 512 binary | — | — | 62.9% | 78.5% | — |
| pivot ∪ phrase BGE-M3 | — | — | 63.9% | 77.2% | — |
| pivot ∪ phrase Gemini 3072 binary | — | — | 68.6% | 85.0% | — |
| pivot ∪ phrase Gemini 3072 float | — | — | **72.3%** | **85.0%** | — |

¹ measured on the larger 85k-paragraph subset (more distractors) — paragraph vs phrase on THAT set: in-book @1 35.5% →
56.3%, originals @10 24.2% → 39.8%. ² pivot "any of its returned originals". The pivot only works where the
translation is in the library and linked; it fails on ~13% that found nothing and on the known link-graph errors
(planning/citations/api-bugs.md). Phrase vectors cover what links don't (untranslated, unlinked, paraphrase).

Larger-subset cross-checks (381k phrases): Gemini 3072 float 71.8 / 31.6 @1; OpenAI 3072 binary 58.0 / 23.3;
OpenAI 512 binary 46.5 / 13.8 — same ordering.

Latency (local Meili, laptop): phrase search p50 10–45 ms after the query vector exists. The query vector costs
400–600 ms from OpenAI/Gemini over the network vs ~20 ms from a local model on GPU.

## Size and cost at library scale

Measured on disk, lean phrase index (ids + filters + vector, no text; text stays in the paragraph index), 381,310 phrases:

| vector | bytes / phrase | 36M phrases (today) | 73M (library doubled) |
|---|---|---|---|
| 512 binary | 855 | 31 GB | 62 GB |
| 1024 binary | 1,065 | 38 GB | 78 GB |
| 3072 binary | 1,521 | 55 GB | 111 GB |
| 3072 float (for contrast; with text) | ~22,000 | ~790 GB | — |

Memory-mapped: RAM needed is the hot part, typically ⅓–1/10 of disk (Meili guidance) → 3072-bit at 73M ≈ 11–37 GB
RAM. tower-nas has 188 GB. For comparison the current Meili data is 177 GB.

Embedding the phrases (~52 words / ~95 tokens anchored Arabic; English shorter; ~2.5B tokens for 36M phrases):
OpenAI 3-large ≈ $330 ($165 batch); Gemini ≈ $375 (~$190 batch); local model = $0 but GPU time (unmeasured on boss;
this Mac does ~20 phrases/s with BGE-M3 → far too slow; boss's GPU with vLLM is the candidate).
Re-embedding is needed again only when the model changes; new books cost proportionally.


## What we have, and what it can become (inventory)

| asset | where / size | becomes, in a phrase-level search |
|---|---|---|
| paragraphs (6.56M, 114k docs) | SQLite + Meili `paragraphs` (4.8M docs, 512-d binary, 177 GB total Meili) | **unchanged** — keyword + paragraph layer stays as is (changing its settings = a week's re-index) |
| sentence/phrase markers `⁅sN⁆` | inline in text | ready boundaries where present; phrases.py supplies Arabic/Persian clause units elsewhere |
| context notes `{place, era, idea, resolve[]}` | `content.context`, ~282k pipeline paragraphs | filters (place, era) and the resolved names in `resolve[]` as keyword/entity terms. As an embedding header: only if a test shows it helps — the title/author header HURT cross-language search (above) |
| entity mentions v2 (~216k, 55k entities) | `entity_mentions_v2` (anchor = doc, para, surface, occurrence) | `entity_ids[]` on each phrase → exact "every phrase naming X" by FILTER, no vector needed; aliases expand queries |
| HyPE (1.67M questions, 267k paragraphs) | Meili `hype_questions` | stays a separate question layer; each question re-pointed to the phrase in its paragraph closest to it (free: cosine within one paragraph) |
| concept claims (19k, `proof_verbatim`) + lexicon (1.7k) | migr 90 tables | the proof span IS a phrase → `concept_ids[]` on that phrase; lexicon terms expand concept queries |
| translation alignment + source links (~246k) | `content_alignment`, `content_source_links` | (1) the **pivot**: find the English, follow the link to the original — *measured above*; (2) collapse quoted copies onto their source phrase |
| `text_grounded`, `embedding_grounded` | legacy, stale, unversioned | retire; do not feed to vectors |
| entity sidecar `entity_mentions_idx` | legacy table, id-type mismatch, switched off | rebuild from v2 as phrase filters; drop the sidecar |

Gaps: full enrichment covers ~282k of 6.56M paragraphs (~4%), all Bahá'í. The phrase index does not wait for it —
enrichment adds filters as it lands.

## Engine facts that decide the options (research, sources in the agent report)

- **Meili scores an array of vectors per document by its best vector, but each array slot is its own graph (max 256)
  and the hit does not say which vector matched.** → phrases go in a **separate index, one small document per phrase**
  (`paragraph_id`, offsets, filter ids; `distinct: paragraph_id`). This is what we tested.
- **Meili quantization is binary only, and irreversible** (no int8, no rescoring). Graph params are hard-coded.
  Disk-bound, mmap — RAM can be ⅓–1/10 of the index. No published numbers above ~1M vectors; one user at 17M saw
  slow indexing (since improved, v1.37–1.51).
- **Qdrant** (single binary, Arch/macOS): int8 / 4-bit / 1-bit with **rescoring from disk**, memory tiers
  (pinned/cached/cold), strong filtered search. Measured by them: 1-bit + rescore ≈ full precision at a fraction of RAM.
- Vespa/Milvus/Elastic: more ops than we want. LanceDB: embedded, disk-based, thin public numbers at 100M+ filtered.

## The search, whichever option (one query path, no LLM re-rank)

Jev plans the query (as now) → the layers below run in parallel → reciprocal-rank fusion → paragraphs, each with the
matching phrase highlighted.

1. **Exact layers first (no vectors):** named people/places → `entity_ids` filter on phrases (every mention, including
   the ones a vector would miss); concepts → `concept_ids` + lexicon terms; quote-shaped queries → keyword phrase match.
   This is what keeps people and ideas from being "left out": recall by ID, not by similarity.
2. **Link pivot** for anything translated: English hit → alignment/source link → original (and back). Measured best
   single route to originals.
3. **Phrase vectors** (new side index): the semantic layer, narrowed by language/religion/work/author filters before
   ranking (feedback: narrow first, relax honestly).
4. **HyPE questions** (existing index) for question-shaped queries, each question pointing at its best phrase.
5. Paragraph keyword index as today.

Re-ranking, if any, is System-1 (Jev or a small local cross-encoder), never a slow LLM.

## Options

### A. Meili phrase index + Gemini embedding (3072, binary) — best measured quality, no new engine
- Quality: in-book 69% @1 / 88% @10; originals 36% @1 (68.6% with the pivot), 85% @10 with the pivot.
- Size: ~55 GB disk today, ~111 GB doubled; RAM ~⅓ of that or less. Same engine, same ops.
- Cost: ~$190–375 to embed the library once; queries ~$0 but **400–600 ms per query vector** (network) and a
  dependency on Google's model staying available (a model change = re-embed everything).
- Risk: Meili indexing time at 36–73M phrases is unmeasured (only external data point: slow at 17M before recent
  fixes). Gate on a tower-nas load test.

### B. Meili phrase index + a local open model on boss (BGE-M3 or Qwen3-Embedding) — fastest, free per query
- Quality: BGE-M3 measured BELOW the API models — in-book 53.5% @1 (Gemini 71.8%), originals 23.5% @1 (Gemini 40.6%), though its returned phrase is often exact (21% exact@1). Qwen3-0.6B was far worse (originals 8.4% @1). The local models that rank above Gemini on public multilingual benchmarks (Qwen3-Embedding 4B/8B) are untested here — they need boss's GPU.
- Size: 1024-bit ≈ 38 GB today / 78 GB doubled.
- Cost: $0 per embedding; ~20 ms query vectors (inside the 1 s budget with room to spare — today's OpenAI call alone
  is 0.5–0.75 s). Embedding 36M phrases needs boss's GPU: throughput unmeasured (this Mac: ~20/s ≈ 3 weeks — not
  viable here). Larger Qwen3 4B/8B score higher on public benchmarks but cost 7–14× the GPU time.
- Risk: boss becomes part of the search path (query embedding) — it must be up, or a fallback is needed.

### C. Keep OpenAI, go to phrases at 3072-bit — smallest change of vendor
- Quality: in-book ~58% @1, originals ~23% @1 (binary, larger set); clearly below Gemini.
- Size as A (55/111 GB). Cost ~$165–330. Same 0.5 s query latency as today.
- Only reason to choose: no new API key/vendor. Not recommended on the numbers.

### D. Qdrant for phrase vectors, Meili for keyword/facets — the scale escape hatch
- Recovers the binary-vs-float gap (Gemini: +3–4 @1) via quantized search + rescoring from disk; tunable recall;
  strong filtered search; comfortable past 100M.
- Cost: a second service (single binary) and an app-side fusion step (already RRF).
- Recommendation: not now. Design the phrase layer behind one interface so it can move to Qdrant if the Meili load
  test fails or the library passes ~100M phrases.

### E. Minimum: pivot-first, no new index
- Wire the link pivot into search for originals now (≈ 54% @1 originals, zero cost, already live as an API).
- Does nothing for English phrase/concept search or unlinked originals. Worth doing regardless — it is a few hours.

## Recommendation

**A + E now, with the exact-ID layers, gated by a load test; keep D as the escape hatch.**

1. **Today, free:** wire the link pivot into search for originals (option E) — the single biggest measured gain
   (originals @1 from ~10–20% to 54%).
2. **Next:** build the phrase side index in Meili with **Gemini embedding at 3072 bits** — best measured quality,
   ~55 GB disk today / ~111 GB doubled, mmap'd, no new engine. Before the full embed (~$190 batch), run the tower-nas
   load test on ~5M phrases (~$25).
3. **Exact layers** (entity_ids, concept_ids, keyword quote match) carry the "never leave out a person or idea" duty;
   vectors carry similarity. Neither alone is enough.
4. **Query latency:** Gemini query embedding is ~0.4–0.6 s (same as today's OpenAI call). If that's too slow, the
   path is a local model on boss — but the one local model measured so far (BGE-M3) loses ~18 points, so test
   Qwen3-Embedding-4B/8B on boss first; don't trade quality for speed blind.
5. **Don't** use title/author headers in phrase vectors; **don't** stay at 512-bit OpenAI (weakest of everything measured).

Decisions for you: (a) OK to add Google (Gemini embedding) as the vector vendor? (b) OK to spend ~$25 on the load test,
then ~$190 on the library? (c) Should boss's GPU be tried for Qwen3-8B before committing to an API model?

## Conversion plan (from what we have)

| step | what | gate |
|---|---|---|
| 0 | **Load test on tower-nas**: lean phrase index of ~5M phrases (one model), measure indexing rate, query p50/p99 with filters, RSS. | if indexing > ~1 day per 10M or p99 > 200 ms → option D |
| 1 | Pivot into search (option E) | battery originals @1 |
| 2 | **English battery** — topical + phrase queries over English (type battery 76 + SE citations English→English). The phrase result is measured only for ar/fa so far. | phrase ≥ paragraph on English |
| 3 | Phrase units for every paragraph: ar/fa = phrases.py (clause markers, never length); English = clause/sentence from its own punctuation; ~36M units. Stored as offsets into the paragraph (no text copy). | spot-check units per language |
| 4 | Embed (batch API or boss) → `phrases` side index: `paragraph_id, offsets, doc_id, language, religion, author_id, entity_ids[], concept_ids[]`; `distinct: paragraph_id`. Paragraph index untouched (no week-long re-index). | battery on the real index |
| 5 | Attach IDs: entity_ids from `entity_mentions_v2` anchors (offset → phrase); concept_ids from claims' `proof_verbatim`; re-point HyPE questions to their nearest phrase (cosine within the paragraph, free). Rebuild the entity sidecar from v2 or drop it. | "every phrase naming X" = mention count |
| 6 | Switch `multiIndexSearch` semantic layer → phrase index; `/search/original` = pivot ∪ phrase | type battery + crosslingual battery, no regression |
| 7 | Later: drop paragraph vectors from `paragraphs` only if nothing needs them (saves RAM; no rush) | — |

New books flow through the same path at ingest (units → embed → index), so doubling the library is a linear cost.

## What is NOT yet known (be honest about it)
- English phrase vs paragraph retrieval — not measured tonight (step 2).
- Meili behaviour at 36–73M documents — not measured (step 0).
- Boss embedding throughput for a local model — not measured.
- Context notes as an embedding header — untested; the title header hurt.
- Phrase rules for Persian are heuristic (verb endings + openers); measured only through the battery.

