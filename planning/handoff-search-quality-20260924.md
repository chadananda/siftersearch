# Handoff — search quality (2026-09-24)

Read this, then `git status` — it should be **clean**. No background jobs are running: the quality battery
was killed at handoff and wrote nothing (§3). Everything below §1 is committed and pushed.

Node: **v25.9.0 required** (`export PATH="$HOME/.local/share/fnm/node-versions/v25.9.0/installation/bin:$PATH"`).
The fnm shell hook is broken this session; substituting Node 24 gives **95 phantom test failures**
(`better_sqlite3.node` NODE_MODULE_VERSION 141 vs 137). Check `node -v` before believing any test run.

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

## 3. Quality baseline — NOT RUN (killed at handoff; run it first)

No baseline exists for the current code. The battery was killed at 212/516 and wrote nothing:
`tests/quality/history.json` and `results-latest.json` are still at their **Aug 25** state.
Partial log (discardable): `/tmp/qual-public.log`.

**Run this before changing any retrieval code**, so §4 has a before/after:

```
export PATH="$HOME/.local/share/fnm/node-versions/v25.9.0/installation/bin:$PATH"
nohup node tests/quality/score-search.mjs --write-report > /tmp/qual-public.log 2>&1 &
```

~45–55 min for 516 fixtures. It hits the LIVE api — **do not deploy while it runs.**
It overwrites `results-latest.json` and appends `history.json`.

The bank: `score-search.mjs` reads **`ocean-fixtures.json` = 516 fixtures** (concept-match 271,
phrase-match 168, cross-tradition 52, lay-paraphrase 12, entity-aware 9, authority-ranking 4).
`search-fixtures.json` (52) is legacy and unused. Recorded history:

| run | total | pass | MRR | p50 |
|---|---|---|---|---|
| Jun 1 | 52 | 81% | 0.82 | 3.9s |
| Aug 26 | 516 | **25%** | **0.137** | 7.2s |

Those are **different populations** — do not read a regression from them. `--multi` runs the battery against
the internal multi-index path (the one that includes HyPE); `--category=X` narrows it. Running both plain and
`--multi` would directly size what §4 is worth.

Observed in the 212 fixtures before the kill: a heavy share of `rank=NF` (not found), consistent with §4
rather than with a fresh regression.

## 4. THE BIG ONE, not yet done: the raw endpoint is missing HyPE

`/api/v1/search` calls `hybridSearch` **directly** (public-api.js:401) — main index only, **no HyPE, no
entity layer**. Meanwhile `/api/v1/tools/search` and the chat tool both use `multiIndexSearch`, which includes
HyPE at weight 1.5 (1.67M questions, 39% of indexed paragraphs) plus entity mentions.

Chad: *"the public endpoint should have both chat and raw index. The raw index can use all of our indexed
search and even our JEV routing."* So this is a defect, not a design — and the bank has been scoring the
crippled path, which is very likely most of the 25%.

**Fix:** point the main call at `multiIndexSearch`, keep the response shape. Then re-run the bank for a true
before/after. This is the highest-leverage item outstanding.

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

## 8. Recommended order

1. **Run the baseline** (§3) → record the number. Nothing exists for current code.
2. Commit §2 (trace + forensic API) and wire `recordTrace()` at both emission points.
3. Fix §4 (raw endpoint → `multiIndexSearch`), re-run the bank, compare.
4. Give `/search` the result cache `/search/quick` already has.
5. Wire scope extraction behind a flag: log the inferred scope **without applying it** for a day, then switch
   on once the inference rate is visible on real traffic rather than a 124-question sample.
6. Only then: branch-per-question-type with Jev routing.

## 9. Open, not mine to decide

- tower-nas `.env-secrets` is mode **664** (boss is 600). Chad: private boxes, deal with it later.
- Analytics routes (`/activity/search-log`) need a browser JWT; `INTERNAL_API_KEY` returns 401 on all four
  header spellings. §2 adds internal-key routes for the new trace data; the older analytics routes are still
  agent-unreachable.
- Answer cache serves a stale answer **once** before revalidating. Correct for latency; if a wrong answer
  must never be served again, that becomes block-and-recompute.
- `entity_claims` quirk: a claim attributed to Mullá Ḥusayn carries the statement "the Báb —
  participated-in pilgrimage to Ḥijáz". Subject/attribution mismatch, untouched.
