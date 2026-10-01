# Cross-lingual search precision — battery first, then fix the index (2026-10-01)

**Requirement (Chad):** find the original-language passage from a translation — "a very obvious search requirement… I
need this to work well". No slow re-ranking: fix the INDEX (or System-1/Jev only).

## What failed (measured)
- Within the right book, the right paragraph was in the top 10 always, first only 6/11; an exact Arabic quote ranked its
  own paragraph 10th. Corpus-wide across languages: almost never found.
- Exact float re-score of the quantized results: no gain (reverted, 7cac9296). Cause = representation:
  ONE 512-d vector per paragraph (text-embedding-3-large truncated); long paragraphs average many subjects.

## Battery — tests/quality/crosslingual-fixtures.json (judged by TEXT, not our ids)
- CTAI verified pairs (Shoghi Effendi's English ↔ original, 11 works) — sentence queries + whole-pair queries.
- Súriy-i-Haykal «ب N» (doc 926567) ↔ Summons [1.N] — exact alignment key.
- The hand-sourced Shoghi Effendi citations (planning/citations/manual-sources.jsonl).
- Scopes: within the book · all Bahá'í originals (ar/fa) · whole library. Metrics: hit@1, hit@5, MRR, latency.

## Options (local Meili 1.42, not production)
| | granularity | model |
|---|---|---|
| A | paragraph (production as-is) | 3-large @512, binary-quantized |
| B | paragraph | 3-large @512 float (isolates quantization) |
| C | **array of window vectors per paragraph** (~40 words, step 20; Meili `_vectors` array → max-sim) | 3-large @512 |
| D | window array | 3-large @3072 |
| E | window array | Gemini embedding / Voyage multilingual (keys present) |
| F | + letter-normalised Arabic/Persian text field (exact phrase) | — |
Paragraphs are never split: a paragraph is one Meili document carrying an array of vectors.

## Then
Winning option → cost (embedding the library's windows), storage, latency → roll out as a side index
(originals first), switch /search/original and hybrid search to it; main-index change only if it earns it.

## Results so far (local Meili, all 194,772 Bahá'í ar/fa paragraphs; battery 544 cases)
| option | book hit@1 | book hit@10 | originals hit@1 | originals sentence hit@1 |
|---|---|---|---|---|
| A prod paragraph, 3-large@512 binary-quantized | 42.6% | 72.5% | 11.4% | 3.9% |
| B paragraph, 3-large@512 float | 54.9% | 82.2% | 19.5% | 5.4% |
| library scope (no language filter), prod | 0% | — | — | — |

## Sentence units (decision, Chad 2026-10-01)
"We would want to divide sentences to match the English, so we would have to link first, then segment next."
- Production markers are coarse: 379,623 units over 194,772 paragraphs (1.9/para); 14% of units > 60 words; 43,434
  paragraphs > 40 words are a single unit (one ⁅s1⁆ wrapped round an unpunctuated paragraph).
- So the SEARCH index does not wait for sentence segmentation: index-only windows (vectors only; text and paragraphs
  untouched) carry the originals now. True sentences come AFTER linking — align each original passage to its English
  sentence by sentence, write the markers into the source, then index those sentences (exact passage returned).
- tests/quality/crosslingual/sentences.py (markers → own punctuation → phrase punctuation for > 60 words; never by
  length) serves punctuated texts and English.

## Granularity test (subset: 2,530 docs / 85,548 paragraphs = every target doc + 2,000 random distractors; 3-large@512)
| | paragraph | window 40/20 (array) | **phrase-anchored** |
|---|---|---|---|
| book hit@1 | 54.8% | 72.1% | **71.5%** |
| book hit@10 | 82.3% | 91.1% | **92.5%** |
| SE citations, book hit@1 | 45.5% | 72.7% | **81.8%** |
| SE citations, originals hit@10 | 63.6% | 72.7% | **100%** |
| originals hit@1 | 26.3% | 37.7% | **36.0%** |
| originals single sentence hit@1 | 10.4% | 24.7% | **23.2%** |
| p50 latency | 11 ms | 69 ms | **13 ms** |
**Decision: phrase-anchored units** (tests/quality/crosslingual/phrases.py — Arabic/Persian clause markers, not
Western punctuation; each phrase embedded with its neighbours ~30 words; one Meili doc per phrase, distinct by
paragraph) — equal accuracy to windows, better on citations, 5× faster, and returns the EXACT phrase.
Remaining gap = model capacity at 512-d (single sentence vs all originals ≈ 23%): testing 3-large@3072/1536 and Gemini.
