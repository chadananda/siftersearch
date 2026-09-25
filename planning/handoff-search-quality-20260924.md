# Handoff — search quality (2026-09-24)

Read this, then `git status` — it should be **clean**. No background jobs are running: the quality battery
was killed at handoff and wrote nothing (§3). Everything below §1 is committed and pushed.

Node: **25.9.0**, now pinned by `.node-version` and `engines` (matches tower-nas production exactly).

⚠ **Your fnm shell hook is broken** — every command prints "can't find the necessary environment variables",
and `node` is absent from PATH. Until it is fixed, `.node-version` cannot auto-apply, so export explicitly:

```
export PATH="$HOME/.local/share/fnm/node-versions/v25.9.0/installation/bin:$PATH"
```

The permanent fix is `eval "$(fnm env --use-on-cd)"` in the shell profile; then `.node-version` switches
automatically on cd. The local fnm *default* is still v24.20.0 — deliberately unchanged, since that affects
every other project. `fnm default v25.9.0` if you want it global.

Why this matters: `node_modules/better-sqlite3` is compiled for **ABI 141 (Node 25)**. Running the suite on
Node 24 gives **95 phantom failures** and looks like a code regression. I lost time to exactly that.
**boss is on v24.20.0** and will need `fnm install 25.9.0` before dev moves there.

⚠ **`rtk` filters command output.** `git diff --name-only` reported **1 file** when the truth was **305**;
`ls`/`wc` returned "(empty)" for files that exist; `curl` JSON came back as a *schema* instead of values. Use
`rtk proxy <cmd>` for anything load-bearing, and always before a destructive git operation. I nearly ran
`git reset --hard` on a "no conflicts" reading derived from filtered output.

---

## 1. What is LIVE (2.187.81, all verified in production)

| fix | commit | evidence |
|---|---|---|
| **Title ranking** — the NAMED work outranks a more authoritative one | `e5c58bf7` | 8/8 titles correct. Was: "The Dawn-Breakers" → *The Advent of Divine Justice* |
| **SEARCH_VERSION → 2026-09-24.1** + exact-string tripwire | `71372abe` | stale answer served once, then correct (0.29s) |
| **Author filter** — folded substring, was exact-match | `21a7f011` | `author="Abdu"` 0 → 3 passages |
| Conversation scoping + honest relaxation (**NOT WIRED**) | `5391152f` | `scope-extract.js`, `search-scope.js`, 19 tests |

## 2. Search trace + forensic API — COMMITTED (`bf269f60`), one step from useful

```
migration 122            search_trace table (empty until wired)
api/lib/search-trace.js  buildTrace / recordTrace / summarizeTraces   (12 tests)
api/lib/search.js        multiIndexSearch now emits _timings {main,hype,entity,merge,total}
api/routes/admin.js      GET /search-trace/:traceId · /search-trace?… · /search-stats?days=
```

All `requireInternal`, so the dev agent can read them — the existing `/activity/*` analytics routes need a
browser JWT and return 401 for `INTERNAL_API_KEY` on all four header spellings.

**Additive and inert**: nothing calls `recordTrace()` yet, so the table stays empty and no search behaviour
changed. Migration 122 creates the table on the first boot after deploy.

**The one remaining step** — call `recordTrace(buildTrace({...}))` at the two emission points:
`/api/v1/search` (public-api.js ~401) and `executeSearch` (chat.js ~479). Pass `timings` from
`multiIndexSearch`'s `_timings`, `layers` from `_layers`, `hits` (they carry `_layerRanks`), the filters plus
`filtersSource`, `cacheStatus`, and `SEARCH_VERSION`. Return the `trace_id` to the caller so a search can be
looked up afterwards.

Why it matters: `SOURCE_STATS` already tracked hype-vs-main leadership but only in memory — lost on restart,
never queryable. `by_search_version` in `/search-stats` is what makes "did that change help?" a query instead
of an argument.

## 3. The batteries — rebuilt 2026-09-24 (session 2)

**Legacy bank (`score-search.mjs` + `ocean-fixtures.json`, 516) was mostly noise and was re-based.**
326/516 gated on ONE arbitrary word picked from Ocean's first snippet; 165 had "expected" doc ids that were
our OWN past top result (circular). Upstream (dnotes/ocean-search-testing) were ORDERING tests, not per-query
truth. Now: `expected_match: 'all_words'` = the query's own content words appear in a top-K passage (the user's
"did the words find the obvious quote at all"); snapshot ids demoted to `regression_doc_id` (soft signal only).
Soft signals reported, never gating: `phrase_found`, `tradition_top1`, `regression_kept`; misses carry
`best_coverage` + `missing_words`. Feasibility: 456+ of 491 gates are satisfiable — the keyword index
(`/search/quick`) finds an all-words passage — so a miss is a SEARCH miss, not a fixture error.
cross-tradition sample (52): 29/52, tradition_top1 0.42.

**New: search-TYPE bank** — `score-types.mjs` + `search-type-fixtures.json` (76). One fixture per real
question type (exact_phrase, lay_paraphrase, find_work, find_person, enumerate, scoped_topic, compare,
author_scoped, history_fact, define_term, misattribution, library_meta), each against the endpoint that type
really uses, each expectation independent truth (text/history/title — never current output). `persona`
chat/research/both; `known_gap` marks fixtures written to fail today. History: `type-history*.json`.

| path | all | exact | lay | scoped | author | history | define | find_person | research persona |
|---|---|---|---|---|---|---|---|---|---|
| public `/v1/search` | 46/76 61% | 8/14 | 4/7 | 3/6 | 1/3 | 1/6 | 4/5 | 7/14 | 8/22 |
| `/search/multi` | 37/76 49% | 4/14 | 3/7 | **0/6** | 0/3 | 2/6 | 3/5 | 7/14 | 8/22 |

**Rate limit:** API keys are 1000 req / sliding hour. The 516 legacy run uses half; two runs + probes in an
hour 429. The scorers count 429 as ERROR (run marked invalid), never as a fail. Entity routes are keyless.

## 4. ~~Switch `/v1/search` to multiIndexSearch~~ — MEASURED: it would REGRESS. Do scope first.

The multi path treats every unfiltered query as cross-tradition (search.js ~1255–1305): Bahá'í capped to
**one slot**, one passage per document, authority sorted BEFORE relevance. Since HyPE covers only Bahá'í
books, its hit lands at #1 on every query ("What does Buddhism teach about suffering?" → a Bahá'í pilgrim note).

**Offline experiment (scripts/wip/scope-experiment.mjs): multi + `extractScope()` religion filter, comparatives unnarrowed:**
search types 16/45 → **27/45**; scoped_topic 0/6 → 6/6; history_fact 2/6 → **6/6**; all 3 comparatives
correctly left open. One regression (Psalm 23 under Christian filter). Jev misread "harmony of science and
religion" as COMPARATIVE (0.95) — a routing-bank case.

**So the order is: wire scope → then multi.** Still unsolved by either:
- **Exact phrase** (4–8/14): main layer is hybrid ≥0.3 semantic; verbatim Hidden Words/Gleanings quotes lose
  to Qur'án/Psalms neighbours and never enter the pool, while `/search/quick` has them at #1–2 in ~1s.
  Needs a KEYWORD/phrase layer in RRF fusion (phraseBoost can't help — it only reorders the pool).
- **Author-scoped** (0–1/3): nothing extracts an author; Jev scope is religion-only.
- **Public `/search` drops passages scoring <40** after LLM rerank → "Where did Bahá'u'lláh pass away?"
  returned ZERO results. Honest when the pool is bad, but the pool is the bug.

**Entity findings (independent historical truth; NOT fixed — no disambiguation work started):**
Qurratu'l-'Ayn / Zarrín-Táj ≠ Ṭáhirih node; Siyyid 'Alí-Muḥammad ≠ the Báb; "Mírzá Ḥusayn-'Alí of Núr" →
Imám Ḥusayn / Núr-'Alí (WRONG person); Abdul Baha / 'Abbás Effendi / Janab-i-Bábu'l-Báb are duplicate nodes.
Badasht roster lists **the Báb participated-in** (he was imprisoned in Máh-Kú/Chihríq in 1848). Letters of
the Living node has 16/18 — missing Mullá Ḥasan-i-Bajistání and Mírzá Muḥammad Rawḍih-Khán-i-Yazdí.

**Fixed + deployed this session:** `/v1/search` analysis-timeout fallback returned every result with
`text: undefined` (raw passages lack `excerpt`) — `unanalyzedResults()` in parallel-analyzer.js, tested.

## 5. Measured facts worth not re-deriving

- **Indexing was never the problem.** Ingestion + indexing 100%, 0 pending. 1.67M HyPE questions = 39% of
  4.23M indexed paragraphs. The Dawn-Breakers is 90% hyped (1,280/1,424) and has 19,901 hype rows.
- **Metadata narrowing is the biggest lever.** Same query: unfiltered **7.35s → Sutra Collection, Tao Te
  Ching**; `religion="Baha'i"` **0.95s → The Dawn-Breakers**. 7.7× faster AND correct.
- **Nothing infers a tradition.** `religion` arrives only in the model's tool args (chat.js:481); internal
  searches at jafar-pipeline.js:244 and :3066 pass none. `/api/v1/search` *does* detect a tradition for a
  supplementary search (public-api.js:409) but never applies it to the main query.
- **Latency**: repeat chat questions ARE cached (0.3s); NEW ones cost 21–26s (4 research + 5–8 subagent
  calls). `/search` has **no result cache** (8.6 / 7.1 / 10.2s identical query); `/search/quick` does
  (1.15 → 0.22s).
- **Observability hole**: `_layers` is computed then stripped by the response schema, so you cannot see which
  index answered. That cost a day of chasing the wrong suspect. §2 fixes it.
- **Describing instead of citing** is prompt-sanctioned: jafar-pipeline.js:1967 classifies "what do texts say
  about X" as thesis-not-verbatim, and :2107 permits uncited paraphrase when the passage is not in
  `retrieved_quotes`. It fires when retrieval returns nothing from the named book.

## 6. Question types, from real logs (124 distinct of 278 user turns)

source_says **30%** · topic_browse 19% · define_term 11% · find_work 10% · find_person 10% ·
exact_phrase 8% · enumerate 5% · compare 5% · followup_meta 2% · library_meta 1%.
**~34% need no passage search at all** (find_work, find_person, library_meta, enumerate).

Chad wants a branch per type — list, table, careful evidence weighing, immediate answer, philosophical
discussion — each individually tested. *"If a person is looking for a specific tablet, we should not bother
with content at all."*

## 7. Jev (TypeSafe System One) — key propagated, measured, ready

`TYPESAFE_API_KEY` (renamed from JEV_API_KEY) is in `.env-secrets` on **local, tower-nas and boss** —
byte-identical, verified. Boss has the full secrets file (Chad's call, for the xswarm move).
`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer`, types `noul` / `choice` / `score`.

Measured on the 124 real questions: **124/124, median 150ms, p95 347ms, 0 errors.** Scope extraction: 55%
narrowable at 0.99–1.00 confidence, comparatives correctly left open.

**Use raw `fetch`, not the SDK** (`@typesafe-ai/sdk` is 0.6.0). The single most expensive bug of the previous
session was an SDK silently dropping `extra_body` — 69% of SAQ HyPE emptied, ~17M tokens for nothing. Route
Jev calls through the existing spend chokepoint (`api/lib/rag-adapter/usage.js`).

⚠ pm2 processes load `.env-secrets` at boot — **nothing has restarted**, so the live API does not yet see
`TYPESAFE_API_KEY`.

## 8. Status of the order (updated late 2026-09-24) — see planning/work-plan-planned-search.md

DONE and LIVE (2.187.86–.91):
- **Author/collection filters were dead in production**: Meili 1.41 rejects `CONTAINS` without the
  `containsFilter` experimental feature; hybridSearch swallowed the error as zero hits. Enabled at API boot
  (`ensureEngineFeatures`; NOTHING runs `initializeIndexes()` at startup — the worker comments said otherwise).
  `GET /api/admin/search-engine` (internal key) = version, features, per-filter-kind probe.
- `containsClause`: CONTAINS OR-ed over ' ’ ‘ (Meili CONTAINS is apostrophe-sensitive).
- keywordSearch cache now keyed on filters too (a filtered and unfiltered search shared one entry).
- **Jev-planned search** (`search-plan.js` + `planned-search.js`): one ~200ms classification → tradition,
  comparative, author PREFERENCE (never a filter — Chad), shape → layers (keyword for quotes, HyPE, diversity
  only when unscoped) → relaxScope. Plan cache 30 min; keyword backstop when Jev fails.
- `/v1/search` is planned; LLM only summarises (preserveOrder, ≤2 calls, no unused introduction call).
  `analyze:false` = RAW: planned retrieval, ZERO LLM calls. `plan:false` = legacy path.

| path (76 fixtures) | pass | p50 |
|---|---|---|
| public legacy (`plan:false`) | 49 | 6.5s |
| public planned + LLM summary | 56 (before Jev hardening) | 4.1s |
| **public planned, `analyze:false`** (steady state, 2.187.93) | **61** | **0.18s** (p95 0.41s) |
| public planned + LLM summary (steady state) | 56 (2 degraded: Jev timeout under LLM load) | 3.7s |
| multi planned | 61 | 1.2s |

NEXT:
1. **Search-first chat** (work plan §F): Jev plan → deterministic route by shape → ONE generation call.
2. Claims index (work plan §B): Meili `claims` over entity_claims (target_entity_id = place/event/work,
   valid_from = date); entitySearch LIKE-scan is 4.5–7s.
3. Remaining quote misses (Psalm 23 under Christian scope, "harmony of science and religion").
4. `/v1/tools/search` + chat executeSearch still call multiIndexSearch unplanned.
5. **API event-loop freezes** (slow_query_log via `GET /api/admin/server/slow-queries?hours=24&minMs=300`):
   fixed the 47s status embedding count and the daily-spend `date(timestamp)` (2.187.93). REMAINING, biggest:
   `api/lib/pipeline/queue.js:181-191` — five per-doc `COUNT … GROUP BY doc_id` over content, ~3s each,
   ~248×/day each IN THE API process (~44 min/day frozen). Needs a precomputed per-doc rollup (the worker
   owns writes), not a query tweak. Also: don't call `/api/admin/server/status` casually — its other counts
   still scan content.
   Battery hygiene: run ≥4 min after a deploy and away from the :35 book-ingest cron; a run with errors or
   `plan_fallbacks` is INVALID/DEGRADED — never a quality number.

## 9. Open, not mine to decide

- tower-nas `.env-secrets` is mode **664** (boss is 600). Chad: private boxes, deal with it later.
- Analytics routes (`/activity/search-log`) need a browser JWT; `INTERNAL_API_KEY` returns 401 on all four
  header spellings. §2 adds internal-key routes for the new trace data; the older analytics routes are still
  agent-unreachable.
- Answer cache serves a stale answer **once** before revalidating. Correct for latency; if a wrong answer
  must never be served again, that becomes block-and-recompute.
- `entity_claims` quirk: a claim attributed to Mullá Ḥusayn carries the statement "the Báb —
  participated-in pilgrimage to Ḥijáz". Subject/attribution mismatch, untouched.
