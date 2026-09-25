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

## G. Raw search owns correct sources (2.187.102–.103)
source-resolve.js: Jev classifies each candidate passage (original/quotation/recollection/commentary + speaker);
quoted spans traced by exact words to the speaker's own work (authority, canonical site); quotation passages
replaced (quoted_in), commentary annotated (quote_sources); copies collapsed (also_in). Adds ~0.35–0.55s.
Battery (raw, analyze:false) now reports a DATA CONTRACT per returned passage. First run, 424 passages:
book-root references 73 (17%), uploader-as-author 28 (7%: bayat, michot, pdf-h-holley, pdf-h-hartz).
OPEN (decisions/data): (1) translation policy for collapsing copies — John 1:1 now served from Douay-Rheims, not
"John"; Bahá'í = Shoghi Effendi's authorized translation? (2) paragraph ids for OceanLibrary docs linked at book
root (Epistle to the Son of the Wolf, Promised Day is Come…). (3) author metadata: uploader names; Lights of
Guidance + The Universal House of Justice stored as author Bahá'u'lláh; pilgrim notes at authority 7.

## F-DONE (2.187.95–.96): Anis chat layer LIVE on /api/chat/stream (default; ANIS_ENGINE=jafar rolls back)
api/lib/anis/{respond,prompt,craft}.js — transport-neutral anisRespond() for the web component AND future
anis@oceanlibrary.com email. Lean prompt (1k vs 12k tokens). ONE global model ANIS_LLM (default openai:gpt-4o-mini;
race in scripts/wip/anis-model-race.mjs). Live convo test: scripts/wip/anis-live-convo.mjs.
OPEN: (1) Groq paid tier → ANIS_LLM=groq:openai/gpt-oss-120b:low (2-3x faster; free tier 8k TPM); also the `fast`
service names retired llama-3.3-70b → silently falls back to OpenAI. (2) gpt-4o-mini added an ungrounded date
("1850" for Ṭabarsí; 1849). (3) chat-path search 0.8–1.7s vs 0.2s raw — executeSearch enrichment SQL.
(4) primary texts vs secondary books in chat quotes (authority). (5) email adapter for anis@.

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
