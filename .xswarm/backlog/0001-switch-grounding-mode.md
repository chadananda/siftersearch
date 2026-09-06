---
id: "0001"
title: Grounding is finished with plan mode and waiting on a spend decision
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
  The extraction pipeline finished everything "plan" mode allows and stopped.
  Its own daily report says: "plan exhausted — no enqueueable work left
  (7 husks, 2 language-parked, 0 quarantined); switch mode to 'general' when
  ready to spend". Nothing queued, nothing running, $0.00 spend, 0 books
  processed — for several days, while the report subject read "all nominal".

  General mode processes the remaining corpus and costs money per book. Nobody
  has recorded what a book costs or how many remain, so the ceiling matters
  more than the switch.

  CHOOSE ONE:
    A. Switch to general, ceiling $X/month  — extraction resumes; everything
       downstream (HyPE coverage, concept extraction, encounters) unblocks
    B. Stay in plan mode                    — nothing more can be extracted;
       say so and the daily alert stops firing
    C. Wait for item 0019                   — the claims investigation may show
       encounter data already exists unused, changing what you would pay for
---

## Finding, 2026-09-06
The extraction pipeline is not broken. From the ops report:

    ✓ Grounding progress — plan exhausted — no enqueueable work left
      (7 husks, 2 language-parked, 0 quarantined);
      switch mode to "general" when ready to spend

It completed everything plan mode permits and stopped. Nothing is queued,
running or completed, spend is $0.00, and 0 books have been processed in 24h.

## Why this went unnoticed for days
The daily report subject reads **"all nominal · 0 books done 24h · $0.00
spend"** and the grounding check shows a green tick. A pipeline that processed
nothing and spent nothing is reporting itself healthy. The instruction to
switch modes is buried in the body of a passing check.

**A pipeline doing nothing is not nominal.** See item 0002.

## The decision
Switching to general mode costs money. Chad sets the ceiling.
