---
id: "0008"
title: A search test suite, so refinement can be measured
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
acceptance:
  - text: a written set of questions with known correct answers and expected citations
  - text: it runs on demand and reports a pass rate
  - text: the rate is in the daily report, so search quality is visible as a trend
  - text: each case is graded on must and must_not, not string overlap
  - text: cases marked `verify` are excluded from the score until their expected answer is confirmed
  - text: declining correctly on `absent` cases scores as a pass
---

## The bar
Chad, 2026-09-06: the harness exists to "push this database and make sure it
acts as a **competent scholar, not just a light search**."

That is testable, and it decomposes into five things a scholar does and a
search box does not:

| category | what it tests |
|---|---|
| **precision** | answers the question asked, not an adjacent one |
| **disambiguation** | the right person among similar names |
| **synthesis** | assembles across sources; no single passage answers |
| **absence** | says "the sources do not record that" — declining is passing |
| **provenance** | every claim shows the passage it rests on |

Seeded at `tests/scholar/queries.yaml` with 11 cases drawn from real failures
observed 2026-09-06.

## This does not start from nothing — read the existing work first
`docs/jafar-conversational-analysis.md`, `docs/morning-report-final.md` and
`docs/dialog-overnight-iteration-log.md` (April 2026) already contain:

* a **scoring rubric** — depth, clarity, stereotype-avoidance, word-definitions,
  assumption-challenge, teaching-clarity, evidence-quality
* **97 scored conversations**, range 55–76%, only 6 at ≥70%
* **nine named failure patterns** with dialog evidence
* a re-test protocol: re-run the lowest-scoring dialogs, target +10 points

That corpus is a far better harness than 11 hand-written cases. The right move
is to **merge**: keep the categories here for factual correctness and
provenance, which the rubric does not cover, and adopt the existing rubric and
conversation set for posture and quality. Do not rebuild what exists.

## Why every case carries `must_not`
A grader that only string-matches will pass an answer about the wrong person.
The Mullá Ḥusayn failure produced a precisely dated, sourced answer — about his
brother. `must_not` is what catches that class.

## Why `status: absent` cases matter most
A system rewarded only for answering learns to answer always. `abs-01` asks
what Mullá Ḥusayn ate on the morning of 23 May 1844; the correct response is a
refusal, and it must score as a pass.
