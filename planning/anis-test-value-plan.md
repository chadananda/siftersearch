# Anís tests that pay for themselves — caps + plan (11-06, for Chad's decision)

## What went wrong (measured, spend ledger 10-31 → 11-06)
- Improvement spend since 11-04 16:26 ≈ **$312**: Opus judge $190.52 (10,407 good calls ≈ $0.018 each; 41,553 failed calls),
  Opus deep analysis $115.46 (≈ $0.047 each), replay + strategy judge $6.
- It produced 1,054 judged items, ~1,400 recommendations, **14 implemented**. Weak rate 82% → 77% → not evidence of anything.
- Why: (1) it graded a 30-day BACKFILL of old traces — mostly code from before the fixes — so it could never show a fix working;
  (2) it judged every trace, so spend scaled with test volume, not with decisions; (3) recommendations outran implementation
  ~100 : 1; (4) no before/after on a fixed set, so no fix has a number; (5) the improve cap was $200/day — a cap that never bit.
- 11-06 ~12:00 UTC: `siftersearch-improve` pm2-stopped. Nothing in the improve group spends until Chad approves this plan.

## Caps (SET 11-06 — Chad: "I don't want to cap searches but only improvement of searches")
| group | cap |
|---|---|
| improve (judge / deep analysis / replay) | **$5/day** (was $200); worker pm2-stopped until the redesign ships |
| media | **$20/day** (Chad, was $40) |
| live searches + Anís replies (search-query) | **no cap** — product traffic is never throttled |
| anis batteries / other | unchanged ($30 → $20 from 11-08; other $10) |
No global ceiling (Chad chose per-group caps). Tested in `tests/api/spend-caps.test.js`.

## The plan: a frozen eval set, measured before/after every fix
1. **Eval set (one-time, ~$0 LLM).** ~10 fresh synthetic questions per defect class that actually recurs
   (writings-buried, missed-question, best-copy-missed, no-writings-pass, process-talk, zero-hits, padded-answer, stage-over-budget):
   ~80 questions, each with its expected source/route written down. Half are HELD OUT — never shown to analysis, only scored —
   so we see tuning-to-the-test. Frozen in `tests/quality/`; changed only by adding classes.
2. **Score with code first.** Most classes are checkable deterministically (expected doc in top k, Writings-first order, zero hits,
   latency, markdown validity — forensics.js already does much of this): free. Opus judges only what code cannot (answered the
   question? padded?), only on the eval set: ≈ 80 × $0.018 ≈ **$1.50 per full run**.
3. **One loop per fix.** Pick the class with the most failures → analysis on THAT class only (≤ 10 cases, ≈ $0.50) → fix →
   re-run that class + the held-out half → keep the fix only if its class improves and no other class regresses. Every fix
   reports one line: class, before → after, held-out before → after, cost.
4. **No backfill, no judging every trace.** Batteries still run (they find new failure classes); a NEW class enters the eval set
   with fresh questions. Old traces are never re-graded.
5. **Weekly number** on the maintenance email: weak rate per class on the frozen set and on the held-out half, spend for the week.

Expected cost: baseline $1.50 + ~2 fixes/day × ~$2 ≈ **$5/day**, inside the proposed cap. Value = a measured before/after per fix.

## Status (11-06)
- Shipped: truncation storm fixed (effort low/medium, Truncated parks), spec #1 Writings pass, spec #2 dedupe-before-pay +
  real files + backfill off (live_from cursor), spec #4 quote-by-meaning (Jev quote shape only), spec #5 query drift.
- Eval set shipped (tests/quality/anis-eval-set.json, 78 items, 13 classes × 6, half held out; anis-eval.mjs scores by code,
  `--from-threads` rescores stored replies at $0). **Baseline 11-06: tune 29/39, held 29/39 (58/78) for $0.26, 0 unchecked.**
  Weakest classes: best-copy-missed 1/6, no-originals-search 2/6, padded-answer 2/6, clipped-quote 3/6. These are the next fixes;
  each is measured on tune, confirmed on held.
- Incident: siftersearch-improve was still online after the cap: 36,371 Opus judge + 80 analysis calls in 6 h, all refused by
  the cap at $0. pm2-stopped + saved (the updater never revives a stopped service). Stays stopped until the eval loop drives it
  under $5/day.
- Latency (24 h, search-latency): Qdrant's own time p50 5–10 ms; the query embedding (Gemini API) dominates, p50 254 ms /
  p95 776 ms, and phrase/canon wait on it; total p50 330 / p95 1,020 ms. Next: a query-embedding cache or local embedder.
- Metadata: oceanoflights.org docs whose author was a file slug get the Central Figure the slug names (9,732 docs; canary
  200 verified), Qdrant payload restamped per doc (paragraph writers kept).
