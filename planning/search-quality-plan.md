# Search quality: a systematic plan

Written 2026-08-17, after Chad reported "our search sucks" and Perplexity answering a question we
answered wrongly. Grounded in what the investigation actually found, not in what I expected to find.

## 1. What the evidence says

One reported failure, fully dissected:

> `Abdu'l-Baha defines "justice" as every man receiving his due. Where?`
> Our answer: *"The exact wording does not appear in the library's collection"* → web fallback →
> attributed to a US compilation → Roman law / Ulpian → a bare "here" link.
> The truth: *Some Answered Questions*, chapter "The Justice and Mercy of God".

**Retrieval was never the problem.** `/api/v1/search` returned that passage at **rank 1** for the exact
phrase *and* for Chad's paraphrase. Every defect was downstream:

| # | Defect | Layer |
|---|---|---|
| 1 | A verbatim-containment test on the user's *remembered* wording was read as proof of absence | answer |
| 2 | The web question discarded the user's actual question, preferred "compilation", and asked for "the earlier book it cites" → Roman law | answer |
| 3 | A canonical work we hold in full was relayed as web prose with an off-site link instead of our own paragraph anchor | answer |
| 4 | Chapter title ("The Justice and Mercy of God") mistaken for a separate compilation | answer |

**All four sat in the ~200 lines between "we found it" and "we said it."** That is the finding that
should shape the plan: effort spent on retrieval tuning would have fixed none of them.

Earlier probes point the same way. Conceptual queries are uneven (`station of the Manifestation` →
Aqdas/Íqán correctly; `progressive revelation` → Sutra Collection, Isaiah, Qur'an) and historical
queries missed the Dawn-Breakers entirely — but those were run against `/api/v1/search`, the
hybrid-only path, where the HyPE and entity layers never contribute. That measurement does not yet
describe what a user experiences.

## 2. The instrument (built, live in 2.186.215)

`api/lib/search-explain.js` records, per question: candidates with rank/score/work, the extracted span,
confidence, each decision **with its reason and inputs**, the question actually sent to the web, and
whether a web lead was recovered from our own corpus. Logged as `search-explain` on success *and*
failure — a trace kept only for failures cannot show what a good answer looks like.

Rule learned from the slow-query log, which took three attempts to become useful: record the INPUTS
beside the decision. "quoteMiss=true" is not a bug report; "quoteMiss=true because containment failed
and confidence was likely" is.

## 3. The plan

**Phase 1 — measure the path users actually use.** Every quality number so far comes from
`/api/v1/search`. Build a scored battery over the **answer** path (`/chat/stream`), reusing the
`tests/quality/` fixture pattern, with per-case expectations: expected work, expected verbatim
presence, and — new — *expected decisions* (`quote_miss=false`, `web_fallback=false`). Score = fraction
of cases where we answered from the library when the library held the answer. The justice question is
case 1. **Until this exists, "search quality" has no number and every fix is anecdote-driven.**

**Phase 2 — harvest traces into fixtures.** The explain log makes every real question a candidate
fixture. Weekly: pull traces where `web_fallback=true` or `quote_miss=true`, check whether the corpus
in fact held the answer, and promote each true miss into the battery. This is the loop that turns user
complaints into regressions instead of memories.

**Phase 3 — fix by layer, in the order the evidence ranks them.**
1. *Answer-layer honesty* (largest, cheapest): never claim absence while holding a semantic hit; label
   confidence instead of discarding evidence. Two of the four defects were this. Partly done.
2. *Citation ownership*: any work in our corpus is cited with our anchor, never an off-site link. Partly
   done via web-as-lead; the general rule (resolve any named work to our own doc) is not.
3. *Chapter-vs-work disambiguation*: defect 4. Chapter titles of canonical works should resolve to the
   parent work; we already hold the structure to do this.
4. *Retrieval itself* — LAST, and only against Phase 1 numbers. The one measured case had it at rank 1.

**Phase 4 — guard the thresholds.** `0.75`/`0.32` confidence cutoffs and the 0.7 containment ratio were
never validated against a fixture set; they are the kind of number that silently decides everything.
Once Phase 1 exists, sweep them and pick values with evidence.

## 4. What I would not do

- **Tune retrieval first.** It answered the reported question correctly at rank 1.
- **Add another fallback.** The bug was a fallback firing when it should not have.
- **Trust a small sample.** This session produced five wrong conclusions from unrepresentative samples
  (8 books that were 710; 2,789 that were ~93). Fixtures get sampled randomly and reported with n and
  an interval. See `feedback_measure_the_matched_population` in memory.

## 5. Honest limits

The four defects are the ones a single question exposed. There is no reason to think they are the only
ones, and I have no measurement of breadth yet — that is exactly what Phase 1 buys. Anything in this
document about *how much* quality improves is a guess until the battery reports a number.
