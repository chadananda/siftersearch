# Work plan — Jev-planned search (started 2026-09-24)

Chad: "the more we can use fast classification to plan the search, the better. Limit to 1 or 2 LLM calls
generally; do the rest with fast JEV-based classification, branching, sorting" — plus semantic cache, HyPE,
and GRAPH CLAIM indexing (facts/claims for persons, places, dates, documents, concepts).

Measure every step with `score-types.mjs` (public + --multi); record history. Baseline: public 46/76,
multi 37/76; offline multi+scope 27/45 search fixtures.

## A. Planner — api/lib/search-plan.js  [DONE 2.187.88–89; author = PREFERENCE, never filter]
One Jev call (~150ms, fail open): tradition, comparative, author (whose WORDS, not who is the subject),
shape (quote | fact | topic | lookup | enumerate), subject (person | place | date | work | concept | none).
Pure `layersFor(plan)` picks layers: quote → keyword layer, no diversity cap; fact → claims + HyPE;
topic → HyPE + main; comparative → never narrowed. Caller-given filters always win. Unit tests.

## B. Claims index — Meili `claims`
From entity_claims (306k supported; subject = person, target_entity_id = place/event/work, valid_from = date,
doc_id/para_id = cited paragraph). Today's entitySearch is a LIKE scan at 4.5–7s — unusable inline.
Sync runs in the unified worker (single writer), triggered via internal API — not SSH.

## C. Executor — plannedSearch()
multiIndexSearch + keyword layer (semanticRatio 0) + claims layer (claims → paragraphs → RRF)
+ relaxScope ladder + result cache keyed on (SEARCH_VERSION, normalized query, plan).
Cross-tradition diversity cap ONLY when the plan has no scope and shape ≠ quote.

## D. Wire
/api/search/multi and executeSearch (tools + chat; model args override plan) → battery →
switch /v1/search main path if it beats public.

## F. Search-first chat (Chad: "chat should fire the search immediately with JEV and feed results to a single LLM call")
Turn → planSearch(messages) → route by shape WITHOUT an LLM (quote/fact/topic/define → plannedSearch;
enumerate → roster endpoint; lookup → find-document/entity lookup) → ONE generation call with the results.
A second call only when retrieval was thin (widened/empty) or the answer needs a follow-up search.
Replaces the research→craft→reflect tool loop as the default path; the loop stays as the fallback.

## E. LLM budget
Public /search runs ~7 parallel LLM analysis calls per query. Target ≤ 2: order by fast signals,
one LLM call to summarise the final top-N.

## Queued
- Jev read "harmony of science and religion" as comparative — tighten wording; routing bank.
- Semantic cache (embedding-near queries share results) after C's exact-key cache proves out.
