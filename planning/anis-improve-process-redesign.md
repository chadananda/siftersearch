# Anís improvement process: what the $312 bought, and a $5/day redesign (11-06)

Extends `planning/anis-test-value-plan.md` (the parent's draft). Its direction is kept: a frozen eval set, before/after per fix, no backfill.
This doc adds the measured causes, a code fix that has already landed, and the cost arithmetic.

## Sources
- **S1** Spend ledger, 144 h: `ops.mjs report spend --params '{"hours":144}'` on tower, run 796680.
- **S2** Tokens by stage, 60 h: `GET 127.0.0.1:7839/api/admin/spend/by-stage?hours=60` (x-internal-key).
- **S3** `.claude/context/improve-report-all.json`: pipeline totals since 10-01, plus 50 audits and 50 conclusions.
- **S4** `.claude/context/improve-digest-all.json`: 1,024 code rows and 370 data rows.
- **S5** `.claude/context/improvements-{done,open,rejected}.json`: 14 done, 500 open, 300 rejected.
- **S6** Model facts from the Claude API reference, 11-06:
  - Opus 5.5 always thinks; `thinking:{type:"disabled"}` returns a 400.
  - The default effort is `medium`.
  - Thinking tokens count against `max_tokens`.
- **S7** Prices from `api/lib/model-registry.js`:
  - Opus 5.5: $4 in / $20 out per 1M tokens, cache reads at 0.1×, batch at 0.5×.
  - Haiku 5.5: $0.10 / $0.50 per 1M tokens.

## 1. Why the judge calls failed, and whether it was a retry storm
**Yes, it was a retry storm, and it had two causes.**

| | number | source |
|---|---|---|
| improve-judge calls | 52,783 ($190.52) | S1 |
| of which API failures | 42,376 | S1 |
| successful calls | 10,407 | S1 |
| items that actually got a verdict | 3,049 | S3 |
| successful but unusable calls (10,407 − 3,049) | **≈ 7,358** | S1−S3 |
| items stuck at 5 attempts | 9,600 (≈ 48,000 attempts) | S3 |
| avg judge output per successful call | **574 tokens, against a 600 cap** | S2 (5,973,827 / 10,407) |
| avg deep output per call | **1,852 tokens, against a 2,000 cap** | S2 (4,751,186 / 2,566) |
| recent deep conclusions with no diagnosis and no fixes | **43 / 50** | S3 conclusions (11-06 05h) |

**Cause A: the API was refusing calls (out of credit).** These 42,376 calls failed without billing tokens: the $190.52 total equals 10,407 calls × about $0.018 each. Even so, every failure counted as one attempt and pushed items toward "stuck". The parent's commit dd5b73fa already fixes this: `noteCreditOut` raises a SpendCapError, so the worker waits instead of failing.

**Cause B: truncation, and it was not fixed yet.** Opus 5.5 always thinks, and its thinking is paid out of `max_tokens` (S6).
- With a cap of 600, replies ended mid-JSON. `parseJudge` then returned null, the worker threw "unparseable", and the item was retried until 5 attempts.
- About 7,358 paid replies were thrown away like this, roughly $135 of the $190.
- Deep analysis at a cap of 2,000 had the same problem. The difference is that `parseDeep` never fails, so an empty conclusion was saved as "deep done" at $0.03–0.06 each.

**Fixed: commit f25838c0 in the worktree, not pushed.**
- `api/workers/improve-worker.js`:
  - The judge now runs with `JUDGE_CALL = {maxTokens: 4000, effort: 'low'}`.
  - Deep analysis runs with `DEEP_CALL = {maxTokens: 8000, effort: 'medium'}`.
  - A reply that stopped at `max_tokens` is parked immediately (`noteFailure(..., {final:true})` sets attempts to 99) instead of being retried 4 more times.
  - A deep analysis with no diagnosis and no suggestions now counts as a failure, not "deep done".
- `api/lib/ai.js`: new optional `effort` setting, sent as `output_config.effort`.
- `api/lib/repos/improve-repo.js`: `noteFailure` takes a `final` flag.
- Test: `tests/api/anis-improve.test.js`, "a reply cut at max_tokens is parked at once…". The 74 improve tests and 35 ai/spend tests pass, and precheck is OK.
- **Measure before restarting the worker:** run 20 judge calls and confirm `finishReason = end_turn` and the real output size. A cap of 4,000 at effort `low` is a ceiling; the actual spend per call is not known yet.

## 2. Cost per item and where the money goes
- **Judge, one successful call: about $0.018** (S2).
  - Prompt: 3,399 tokens, 55% served from cache. That is about $0.0061 fresh input plus $0.0008 cache reads.
  - Output: about $0.0115, which is **62% of the cost**. Most of it is thinking.
  - The rubric is being cached; the trace payload is not, and it never could be, because it differs per item.
- **Cost per usable verdict: $190.52 / 3,049 = $0.062**, which is 3.4× the cost of one call.
- **Deep analysis, one call: $115.46 / 2,566 = $0.045.** Output is 82% of that.
  - Prompt: 2,880 tokens, of which 34% cached.
  - In the recent window, 86% of these analyses came back empty.
- **Cheaper options, in order of how sure I am:**
  1. Stop paying for truncated output. Done in f25838c0.
  2. Lower effort. `low` for the judge is done; it should reduce thinking tokens, but that is not measured yet.
  3. Use the **batch API at half price** for eval-set runs, which are not latency-sensitive. Add `improve:judge` and `improve:analysis` to `BATCH_STAGES` in `api/lib/ai.js` and run with `ANTHROPIC_BATCH=1`.
  4. **Haiku 5.5 as the judge would cost about $0.0007 per item, 26× cheaper.** That is Chad's call: he chose Opus on 11-04. Calibrate first: Haiku and Opus judge the same 80 frozen items, and Haiku takes over only if it agrees with Opus on at least 90% of verdicts and on the top class at least 80% of the time.
  5. Smaller payloads are a minor saving, because input is only about 38% of judge cost.

## 3. Judge vs forensics agreement (S3: 50 audits; all 3,049 judged for the rates)
- **The judge almost always says "weak": 81.8% overall, and 50 of 50 in the sample.** A verdict that is nearly always the same carries little information.
- Forensics flagged 28 of the 50. **The judge also said weak on all 28**, so on those items the verdict was free and the judge added nothing to it.
- **The class matched on only 9 of 50** (judge classes ∩ forensic classes).
  - The forensic classes are retrieval facts: no-authoritative-copy and no-originals-search, 20 each.
  - The judge's classes are mostly about the writing: missed-question 23, process-talk 15, padded-answer 13, best-copy-missed 13. 34 of the 50 judge verdicts named the WRITER stage.
  - So the judge earns its cost on **writer-quality** classes that code does not detect, and is redundant for "weak or not".
  - It is also partly redundant within the writer classes: malformed-markdown appears 9 times, and `md-valid.js` checks that for free.

## 4. Redundancy of the deep analyses (S4, S5)
- **Volume:** 2,463 deep analyses produced **1,394 suggestion rows** (1,024 code, 370 data) carrying 1,556 evidence links.
- **Dedupe rate: (1,556 − 1,394) / 1,556 = 10%.** In the code rows, 981 of 1,024 (96%) have only one piece of evidence.
- **The same themes came back as new rows hundreds of times.** 339 rows target `doctrinal-rank.js` and 191 target `latency-budget.js`.
  - `sameSuggestion` matches on Jaccard ≥ 0.45 over free-text "change" wording, and Opus phrases the same fix differently each time.
  - Per-item analysis with dedupe after the fact does not converge.
- **Traces from code that has since changed:** I could not count these from the dumps. `BACKFILL_DAYS = 30` meant the queue was dominated by old traces (11,528 still pending). The parent's plan reports the same.

## 5. Yield: the 14 done fixes (S5)
- **Evidence was thin:** 11 had one piece of evidence, 1 had two, 2 had three.
  - **14 / 1,394 = 1.0%** of suggestions were done.
  - **297 of the 370 data rows (80%) were rejected.**
- **What they were:**
  - Six were index, tier and author fixes: #262, #135 author route; #242, #118, #227 tier resolution; #136 folding.
  - Four were writer lints: #161, #138 ellipsis restore; #163 search-offer; #147 source-tier order.
  - Two were latency: #312, #309 Qdrant budgets.
  - #167 was hydrate top-k only.
  - #156 needed nothing; its note says it was "already so".
- **None of the 14 has a before/after number.** Several are in unpushed worktrees: 81635023, e9594879, 40fe896b.
- **The fixes that mattered were themes the queue repeated many times**, such as tier resolution and the author route. Grouping by class would have found them with about 10 analyses instead of about 2,400.

## 6. The redesign: eval set first, judge by class, analysis by class
**Principle:** spend scales with **decisions**, meaning a fix tried and kept or reverted, never with trace volume.

1. **Frozen eval set.** About 80 synthetic questions: 10 per recurring class, taken from the S4 top classes.
   - Classes: writings-buried, missed-question, best-copy-missed, no-writings-pass, process-talk, stage-over-budget, zero-hits, padded-answer.
   - Each question records its expected source and route.
   - Half the questions are **held out**: they are scored but never shown to analysis.
   - Lives in `tests/quality/anis-eval-set.json` and only ever grows by a whole new class.
2. **Score with code first, for free.** Use `forensics.js` / `assessSearch`, `md-valid.js`, an expected-document-in-top-k check, a Writings-first order check, zero hits and stage timings.
   - **Opus judges only the writer classes** that code cannot see: missed-question, padded-answer, process-talk.
   - It judges only items code passed, at `effort:'low'`, through batch at 0.5×.
3. **One loop per fix.**
   - Pick the class with the most failures.
   - Run **one** deep analysis per **class**, over 3–5 failing cases at once, with no per-item analyses. That replaces dedupe.
   - Make the fix, re-run the class slice and the held-out half, and keep the fix only if its class improves and no other class gets worse.
   - Report one line per fix: class, before → after, held-out before → after, $.
4. **Finding new classes.** Once a week, sample 20 fresh battery replies that pass every code check and have Opus judge them.
   - A class not yet in the set becomes ~10 new frozen questions; its deep analysis waits until it has 3 or more cases.
5. **No backfill, no judging every trace.**
   - Set `IMPROVE_BACKFILL_DAYS` to 0 and ingest only traces tagged with an eval run id.
   - Retire the 11.5k pending and stuck rows with a skip-status op endpoint. Do not re-grade them.

### Cost under $5/day (S2/S7 per-call costs; Opus realtime unless noted)
| item | Opus realtime | forensics-first + batch | Haiku judge (if calibrated) |
|---|---|---|---|
| full eval run, 80 items | 80 × $0.018 = **$1.44** | ~35 judged × $0.009 = **$0.32** | 80 × $0.0007 = **$0.06** |
| one fix check: class slice before/after (20) + held-out (40) | 60 × $0.018 + 1 class analysis $0.05–0.10 ≈ **$1.18** | ≈ **$0.37** | ≈ **$0.10** |
| weekly new-class sample, 20 items | $0.36/week ≈ $0.05/day | $0.18/week | — |

- **Full runs per day under $5:** 3 on Opus realtime, about 15 with forensics-first plus batch, about 80 with a Haiku judge.
- **Typical day, forensics-first plus batch:** 1 baseline ($0.32) + 6 fix checks ($2.22) + new-class sample ($0.03) ≈ **$2.60/day**. That leaves room for the 8,000-token deep analyses until their real size is measured.
- **Same day on Opus realtime:** 1 baseline + 3 fix checks ≈ **$5.00/day**.
- **Not in these numbers:** producing the 80 Anís replies is billed to the **anis** group, and battery-judge runs about $0.039 per item (S1: 77 calls, $3.02). I did not measure the per-reply cost here.

### What to change, in which file
| file | change | state |
|---|---|---|
| `api/workers/improve-worker.js` | output budgets plus effort; truncated reply parked; empty deep analysis is a failure | **done, f25838c0** |
| `api/lib/ai.js` | `effort` → `output_config.effort` | **done, f25838c0** |
| `api/lib/repos/improve-repo.js` | `noteFailure(..., {final})` | **done, f25838c0** |
| `api/workers/improve-worker.js` | `BACKFILL_DAYS` default 0; ingest only traces tagged with an eval run | todo |
| `api/lib/ai.js` | add `improve:judge` and `improve:analysis` to `BATCH_STAGES` | todo |
| `api/lib/audit/improve.js` | `deepMessage` over a **class** (3–5 cases) instead of one item; judge rubric limited to writer classes | todo |
| `tests/quality/anis-eval-set.json` + a scorer under `scripts/quality/` | the frozen set, its held-out flag, code scoring, a before/after line | todo |
| ops endpoint (`api/lib/ops/…`) | retire pending and stuck backlog rows with a skip status | todo |
| `config/spend-caps.json` | improve group set to $5/day | todo (Chad) |
| `api/lib/model-roles.js` | `search-judge` → Haiku 5.5 only after calibration | Chad decides |
