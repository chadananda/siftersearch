# Ocean Search Testing — PRD and SifterSearch Implementation Guide

**Original framework:** [ocean-search-testing](https://github.com/dnotes/ocean-search-testing)
**Created by:** David Hunt — [dhuntatwork@gmail.com](mailto:dhuntatwork@gmail.com)
**License:** MIT
**Adapted for:** SifterSearch — June 2026

> This document would not exist without David Hunt's years of work testing and documenting
> what good multi-tradition religious search looks like. The scoring model, fixture queries,
> authority weights, and design decisions below are drawn directly from his framework.
> Our adaptation replaces Elasticsearch + ordering-error with Meilisearch + MRR/precision@K,
> but the core insight — that source authority and phrase fidelity must be measured together —
> is entirely his.

This document extracts the full specification, test data, and design concepts from
David Hunt's ocean-search-testing framework and maps them to a concrete implementation
plan for SifterSearch (and any other multi-tradition religious library search engine).

---

## 1. Core Scoring Model

The framework defines search quality as a function of two independent dimensions:

### 1.1 Book Importance (source authority)

| Label | Score | Definition |
|---|---|---|
| primary | 3 | Revealed text or central figure writings — highest authority |
| secondary | 2 | Authorized interpretations, approved history, important doctrinal works |
| general | 1 | Published scholarly or devotional works by community members |
| supplemental | 0 | Supplementary, provisional, or peripheral works |

**Derived combined score = importance + match_quality (max 8).**

The expected ordering of results follows this matrix (higher score first):

| importance | match_quality | combined |
|---|---|---|
| primary | exact | 8 |
| secondary | exact | 7 |
| primary | all words | 6 |
| general | exact | 6 |
| primary | some words | 5 |
| secondary | all words | 5 |
| supplementary | exact | 5 |
| secondary | some words | 4 |
| general | all words | 4 |
| primary | no words | 3 |
| general | some words | 3 |
| supplementary | all words | 3 |
| secondary | no words | 2 |
| supplemental | some words | 2 |
| general | no words | 1 |
| supplemental | no words | 0 |

The key insight: **a primary source with some-word match (score 5) should outrank a supplemental
source with an exact-phrase match (score 5 — tied), and definitely outrank general+some-words (3).**
Authority wins when match quality is equal.

### 1.2 Match Quality

| Label | Score | Definition |
|---|---|---|
| exact | 5 | All search terms appear in exact sequence (phrase match) |
| all words | 3 | All search terms appear but not as a phrase |
| some words | 2 | Some but not all search terms appear |
| no words | 0 | No search terms appear (only semantic/conceptual match) |

### 1.3 Success Metric: Ordering Error

The original metric is **median ordering error ≤ 5% of total books searched**.

- Each result is scored (importance × match_quality combined score)
- Results are ranked by score descending (ideal order)
- Ordering error = how many positions a result is displaced from ideal
- Median across all results must be ≤ 5% of N (where N = books searched, typically 15 or 500)
- This is stricter than precision@K: it penalizes any out-of-order result, not just misses

### 1.4 Performance Requirement

Target: **< 200ms** per search query (well-optimized indexes, local or CDN-cached).
The test suite has explicit timing scenarios with this budget.

---

## 2. Test Fixture Inventory (635 queries → 491 deduplicated)

All tests run as BDD Cucumber scenarios in `search-ordering.feature`. The fixture format is:

```
| searchPhrase | religion | context |
```

**Religion distribution in fixtures:**
| Religion | Count |
|---|---|
| Baha'i | ~120 |
| Buddhist | ~70 |
| Christian | ~80 |
| Islamic | ~65 |
| Hindu | ~60 |
| Jewish | ~55 |
| Zoroastrian | ~40 |
| Taoist | ~25 |
| Jain | ~30 |
| Confucian | ~20 |
| Cross-tradition (no filter) | ~70 |

**Context categories (thematic, not technical):**
- creation stories and myths
- purpose of existence / afterlife / salvation
- virtues (ethics, character)
- teachings on prayer / worship / ritual
- scripture references (named texts)
- historical figures and events
- theological concepts (soul, God, divine)
- end times prophecies
- teachings on charity / community
- commandments / laws
- requirements for spiritual growth

---

## 3. Document Importance Weights

The `weights-table.txt` defines the authority tier for every document in the Ocean corpus.
The scale is 1 (highest) → 8 (lowest), reversed from our SifterSearch 10-point scale.

**Weight → SifterSearch authority mapping:**

| Ocean weight | Ocean meaning | SifterSearch tier |
|---|---|---|
| 1 | Primary: Bahá'u'lláh, the Báb, 'Abdu'l-Bahá revealed/authorized texts | 9–10 |
| 2 | Secondary: UHJ docs, important individual works by central figures | 7–8 |
| 3 | Compilations, prayer books (mixed authorship, officially sanctioned) | 6 |
| 4 | Narrative history (e.g., Dawn-Breakers) | 5 |
| 5 | Published scholarly books by Bahá'í authors (Taherzadeh, Balyuzi, etc.) | 4 |
| 6–7 | Star of the West, centenary news | 3 |
| 8 | News clippings, ephemeral content | 1–2 |

For non-Bahá'í traditions the same principle applies:
- Scripture (Qur'an, Bible, Upanishads, Avesta) → weight 1
- Canonical doctrinal collections (Hadith, Talmud, etc.) → weight 2
- Secondary scholarly/devotional → weight 3–5

Full canonical weight table:

```
Bahá'í weight-1:  All works by Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi (primary letters/tablets)
Bahá'í weight-2:  UHJ Messages, Divine Philosophy, Memorials of the Faithful
Bahá'í weight-3:  Research Dept. Compilations, Bahá'í Prayers (mixed authorship)
Bahá'í weight-4:  Dawn-Breakers (Nabíl)
Bahá'í weight-5:  Taherzadeh, Balyuzi, Esslemont, Townshend, Abu'l-Fadl, Harper, Rabbání, Sears
Bahá'í weight-6:  Star of the West (excerpts)
Bahá'í weight-8:  News clippings (Centenary News), Minnesota visits, etc.

Christian weight-1: All books of the Bible
Christian weight-2: Deuterocanonical works, other authors
Jewish weight-1: Torah/Tanakh
Jewish weight-2: All other texts (Mishnah, Talmud, Midrash)
Islamic weight-1: Qur'an translations
Islamic weight-2: Hadith collections (Sahih Muslim, Bukhari, Forty Hadith of Nawawi)
Buddhist weight-1: (not explicitly defined — core sutras implied)
Buddhist weight-2: Other canonical texts
Hindu weight-1: Upanishads, Mahabharata, Rig Veda, Bhagavad-Gita, Ramayana
Hindu weight-2: Yoga Sutras, Songs of Kabir, Tagore
Zoroastrian weight-1: Avesta, Khorda Avesta
Zoroastrian weight-2: All other texts
Jain weight-1: Core Agamas (implied)
Confucian weight-1: Analects, core texts (implied)
```

---

## 4. Search Design Decisions

From `search-decisions.md`:

### 4.1 BM25 Without Length Normalization

Turn off the "b" value in BM25 (length normalization factor). Without this, long passages
get artificially deflated scores because BM25 penalizes documents longer than average.
Religious texts often have long passages — normalizing by length hurts primary sources.

**In Meilisearch:** Configure similarity settings to use BM25 without length bias if possible.
(Meilisearch doesn't expose BM25 b-value directly — but passage-level segmentation helps by
making all indexed units roughly equal length.)

### 4.2 Importance Score Field

Every indexed document gets an `importance` (or `authority`) numeric field at index time.
This field is used to boost search results during query execution — it should NOT be derived
from query-time logic. The ranking formula effectively becomes:

```
final_score = bm25_score × importance_multiplier
```

Where `importance_multiplier` is typically `(importance + 1)` to preserve ordering.

**In SifterSearch:** This is already implemented as the `authority` field (0–10) on paragraphs.
The reranking pipeline in `api/lib/authority.js` applies authority-based boosting.

### 4.3 Phrase Match Must Beat Semantic Match

For exact user phrases (quoted or clearly verbatim), the system must identify that the user
is looking for a specific passage — not a conceptually similar passage. The scoring model's
"exact" match quality (score 5) is the highest possible match_quality tier.

**In SifterSearch:** Hybrid search (Meilisearch keyword + vector similarity). The `analyzePassagesParallel`
step in Jafar pipeline needs to verify whether results are phrase-level matches vs semantic matches.
Currently missing: explicit phrase detection to boost exact-match results above semantic-only results.

### 4.4 Stop Words and Stemming

The test suite strips stop words and applies stemming (Porter stemmer) before matching.
This prevents common words ("the", "is", "and") from dominating scores.

**In SifterSearch:** Meilisearch handles stop words via index settings. Our current config
has a stop-word list for common English words. Stemming is less aggressive with Meilisearch's
built-in tokenizer — this may explain some failures on stemmed variants.

### 4.5 Cross-Tradition Queries

Queries without a religion filter should surface results from multiple traditions.
The combined score still applies: a primary Christian source about "love" should outrank
a supplemental Bahá'í source about "love" even when searching without filter.

**In SifterSearch:** Cross-tradition search works but authority ranking is per-tradition.
We need a single normalized authority scale across traditions so "primary Christian" = "primary Bahá'í"
in terms of ranking weight.

---

## 5. Test Categories (SifterSearch mapping)

The ocean-search-testing BDD features map to SifterSearch fixture categories:

| Ocean feature file | SifterSearch category | Description |
|---|---|---|
| search-ordering.feature | phrase-match + concept-match | Core ordering tests with religion filter |
| search-ordering.feature (cross-tradition) | cross-tradition | No religion filter |
| search-performance.feature | (latency checks) | < 200ms target |
| search-filters.feature | concept-match | Filter-specific behavior |
| search-results.feature | entity-aware | Named entity resolution |
| highlights.feature | text check | Expected phrase in result |

---

## 6. SifterSearch Implementation Plan

### 6.1 Current State (June 2026)

| Capability | Status | Gap |
|---|---|---|
| 491 ocean fixtures in JSON | ✅ Done | None |
| Authority field on paragraphs (0–10) | ✅ Done | |
| Authority reranking in search | ✅ Done | |
| Precision@10 measurement | ✅ Done | |
| MRR measurement | ✅ Done | |
| Latency p50/p95 measurement | ✅ Done | |
| Phrase match priority over semantic | ❌ Missing | High |
| Cross-tradition normalized authority | ⚠️ Partial | Medium |
| Ordering-error metric | ❌ Missing | Low (MRR covers this) |
| < 200ms search latency | ❌ Failing | Meilisearch sync load currently slowing to 7–25s |

### 6.2 Priority Fix: Phrase Match Boosting

**Problem:** A query like "Blessed are the meek" should surface the exact Bible verse, not an
`'Abdu'l-Bahá passage that semantically discusses meekness. Currently our hybrid search may
rank the semantic match higher.

**Implementation:**
1. In `/api/routes/search.js` or `api/lib/search.js:hybridSearch`, detect when the query is
   a long exact phrase (> 4 words, no special characters).
2. Issue a separate Meilisearch `matchingStrategy: 'all'` query for those phrases.
3. Boost the Meilisearch keyword score by 3× relative to vector score when `matchingStrategy=all`
   returns results.
4. Add test fixture: `{ "id": "blessed-are-meek", "category": "phrase-match", "query": "Blessed are the meek", "expected_text_contains": ["meek"], "religion_filter": "Christian" }`.

### 6.3 Cross-Tradition Authority Normalization

**Problem:** The authority scale for Bahá'í uses "9" for Bahá'u'lláh, but "9" for a
different tradition might mean something different. A cross-tradition query needs a
unified tier: revealed scripture from any tradition should rank equally.

**Implementation:**
- Define a cross-tradition tier map:
  - Tier A (=9): Revealed text, primary scripture (Qur'an, Bible, Upanishads, Avesta, Bahá'u'lláh writings)
  - Tier B (=7): Authoritative interpretation / canonical hadith, Talmud, Shoghi Effendi
  - Tier C (=5): Secondary scholarly / devotional from recognized community members
  - Tier D (=3): Supplemental, unpublished, unofficial
- Map each tradition's books to these tiers in the DB (or in the authority lookup).
- The `authority` field on paragraphs should reflect the cross-tradition tier, not a
  tradition-internal score.

### 6.4 Ordering Error Metric (optional upgrade)

MRR already penalizes late-appearing relevant results. But ordering error captures
**overall list ordering** not just the first relevant hit. To implement:

```javascript
function orderingError(results, scoreFn) {
  const actual = results.map(r => ({ id: r.id, score: scoreFn(r) }));
  const ideal = [...actual].sort((a, b) => b.score - a.score);
  const positions = new Map(actual.map((r, i) => [r.id, i]));
  const errors = ideal.map((r, idealPos) => Math.abs(idealPos - positions.get(r.id)));
  const median = errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)];
  return median / results.length; // fraction; ≤ 0.05 = pass
}
```

Add `scoreFn` that applies the importance × match_quality matrix from §1.1.
This metric is worth adding to `score-search.mjs` for the ocean fixtures (since those
fixtures were designed with this metric in mind).

### 6.5 Latency Recovery

Current issue (June 2026): Meilisearch sync queue has ~4,800 vector-update tasks backlogged,
causing search queries to return in 7–25s instead of < 1s.

**Short-term:** Wait for queue to clear (entity_mentions sync + paragraph re-index).

**Structural fix:** Separate Meilisearch instances for writes vs reads (or use Meilisearch's
read-replica feature if available). Alternatively: schedule heavy re-indexing during off-peak
hours when search traffic is low.

**Target:** p50 < 500ms, p95 < 2000ms under normal load (no active vector indexing).
The ocean-search-testing 200ms target assumes a dedicated Elasticsearch cluster — our
Meilisearch on a shared server is less optimized, but 500ms p50 is achievable.

---

## 7. Running the Adapted Ocean Battery

```bash
# First run to establish baseline (after Meilisearch queue clears)
npm run test:search-quality:ocean

# This writes tests/quality/ocean-results-latest.json
# Commit the JSON to update the live docs page

# Run both suites combined
npm run test:search-quality:all

# Check a specific religion
node tests/quality/score-search.mjs --ocean --category=concept-match
```

**Expected baseline scores** (once Meilisearch queue clears and OL docs indexed):
- phrase-match (168 fixtures): 40–55% (limited by semantic vs phrase boosting gap)
- concept-match (271 fixtures): 50–65% (depends on authority reranking quality)
- cross-tradition (52 fixtures): 55–70% (depends on normalized authority)

**Target after implementing §6.2 and §6.3:**
- phrase-match: 65–75%
- concept-match: 70–80%
- cross-tradition: 65–75%

---

## 8. Applicability to Other Projects

This scoring model applies to any document search system over a multi-source corpus
where source authority matters:

**Legal research systems:** Primary law (statute, constitution) > case law > commentary > blogs.
Apply the same matrix: `source_authority` field at index time, boosted in ranking.

**Academic search:** Peer-reviewed journal > conference paper > preprint > blog post.
The importance × match_quality combined score directly translates.

**News archives:** Authoritative wire service > major newspaper > local paper > blog.

**Medical information:** Clinical guideline > systematic review > RCT > case study > patient forum.

**General recipe:**
1. Define an authority tier for every document type (usually 3–5 tiers).
2. Store the tier as a numeric field at index time.
3. Use BM25 (or TF-IDF) with the authority field as a multiplicative boost.
4. Test with the ordering-error metric (§1.3) or MRR.
5. Phrase queries get a match_quality=5 boost; semantic-only gets match_quality=0.

---

## 9. Fixture File Locations

| File | Contents |
|---|---|
| `tests/quality/search-fixtures.json` | 52 curated SifterSearch core tests |
| `tests/quality/ocean-fixtures.json` | 491 converted ocean-search-testing fixtures |
| `tests/quality/score-search.mjs` | Test runner (--ocean, --all, --category flags) |
| `tests/quality/results-latest.json` | Latest core battery results (committed) |
| `tests/quality/ocean-results-latest.json` | Latest ocean battery results (committed when run) |

---

*Original framework: github.com/dnotes/ocean-search-testing by David Hunt (MIT license)*
*SifterSearch adaptation: June 2026*
