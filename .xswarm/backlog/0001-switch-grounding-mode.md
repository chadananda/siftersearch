---
id: "0001"
title: The grounding gate does not include the prerequisites — do not switch to general
state: blocked
blocked_on: Chad — switching to general mode means spending, and that is his call
traces_to: .xswarm/GOAL.md
priority: P1
size: S
class: never
acceptance:
  - text: a mode is chosen and the queue is enqueueable again
  - text: a spend ceiling is set so it does not need re-deciding every week
decision: |
  CORRECTED TWICE, 2026-09-06. The first version said "extraction finished".
  The second said "the curated plan is complete, open the library?". Both were
  wrong in the same direction: they treated the grounding processor's notion of
  done as the plan's notion of done. It is not.

  **The recommendation is now: do NOT switch to general.** There are at least
  two prerequisites the gate cannot see, both of which you specified.

  1. **Dial in concept search on the seeded books first.** The point of seeding
     the doctrinal spine in a load-bearing order was to test and tune concept
     retrieval on those books before spending on the rest of the library.
     That test has not happened. Filed as 0025.

  2. **Source-text alignment for translated paragraphs.** Your request, in the
     code: `concepts/source-survey.js` opens "The prerequisite for 'fetch the
     source for every translated canonical' (Chad, 2026-08-25)". Built and
     measured — `align.js` uses Dice over monotonic alignment because index
     matching was measured wrong on the Íqán. **It is not a gated stage**:
     `plan.js` gates on disamb, reconcile, extract and hype only, and
     `original_text` appears in neither plan.js nor processed.js. Filed as 0026.

  Concept extraction is also a SEPARATE TRACK from the entity pipeline that the
  mode governs. It has run on six books, its promotion stage does not exist at
  all (nothing writes `concept_entities`), and four spine texts are un-run —
  Some Answered Questions, the Íqán, the Aqdas, the Hidden Words. Switching the
  entity pipeline to general does nothing for any of that. Filed as 0027.

  CHOOSE ONE:
    A. Hold in plan mode; do 0025, 0026, 0027 first  — RECOMMENDED. The gate is
       measuring the wrong finish line; open the library only once the
       prerequisites you set are actually met.
    B. Switch to general anyway — right only if breadth of entity coverage now
       matters more than concept quality and source alignment.
    C. Extend the plan with specific books — bounded spend, keeps the ordering,
       but leaves the same prerequisites unmet.

  The reporting defect underneath all of this is filed as 0028: a pipeline that
  reports "plan exhausted" while two specified prerequisites are untouched is
  measuring stage completion and calling it project completion.
---

## Finding, 2026-09-06 — corrected
The extraction pipeline is not broken, and it is not finished. From the ops
report:

    ✓ Grounding progress — plan exhausted — no enqueueable work left
      (7 husks, 2 language-parked, 0 quarantined);
      switch mode to "general" when ready to spend

It completed the **curated history plan** and stopped. That plan is a hardcoded
roadmap of specific books in a deliberately load-bearing order — seed, then
doctrinal spine, then history — not the library. Nothing is queued, spend is
$0.00, and 0 books processed in 24h because the next step needs a mode change,
not more time.

## Why this went unnoticed for days
The daily report subject reads **"all nominal · 0 books done 24h · $0.00
spend"** and the grounding check shows a green tick. A pipeline that processed
nothing and spent nothing is reporting itself healthy. The instruction to
switch modes is buried in the body of a passing check.

**A pipeline doing nothing is not nominal.** See item 0002.

## The decision
Switching to general mode costs money. Chad sets the ceiling.
