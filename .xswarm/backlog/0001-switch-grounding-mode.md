---
id: "0001"
title: The curated history plan is complete — open grounding to the whole library?
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
  CORRECTED 2026-09-06 after Chad questioned the earlier reading, which was
  misleading. "Plan exhausted" does NOT mean extraction is finished.

  There are three grounding modes, from the processor's own comment:
    plan      follow the hardcoded history plan (integration-phases.js) —
              a curated, ordered list of specific doc ids
    override  hand-enrolled queue, for development
    general   "default later, once the whole plan is done" — process ANY
              unprocessed document in the library

  It has been in `plan` mode. The curated roadmap is finished. **The library
  has not been touched.** The plan is ~10 phases beginning with the seed —
  God Passes By and The Dawn-Breakers, "the authority seed... the core cast
  that every later book resolves against" — then the Doctrinal Spine, where
  the file states "ORDER IS LOAD-BEARING: the interpretive lexicon must
  accumulate before the lower texts whose symbols draw on it are extracted".

  So: the deliberately-ordered foundation is laid. Concept extraction across
  the wider library has barely started, exactly as you said, because general
  mode has never run.

  The 7 husks are documents with zero paragraphs. The file records that a
  previous "6 books are structurally blocked" conclusion was wrong — the plan
  pointed at empty duplicates, and two were swapped to good copies. Two have
  no good copy in the corpus at all: 420 The Life of the Báb (Mazandarání)
  and 11498 The Astonishing Events... Nayríz. Those are acquisition problems,
  not processing ones.

  CHOOSE ONE:
    A. Switch to general with a ceiling — grounding opens to the whole
       library. This is the main job, not a resumption. Unknown: cost per
       book and how many remain, so the ceiling matters more than the switch.
    B. Stay in plan, extend the plan — add specific books to
       integration-phases.js instead. Keeps the load-bearing order and the
       spend bounded. Right if sequence still matters more than coverage.
    C. Neither yet — do 0019 first. If encounter claims already exist unused,
       what you would be paying to generate changes.

  What I still cannot tell you: the cost per book, and how many library
  documents are unprocessed. Both are needed to set a sensible ceiling and
  neither is in the reports. Finding them is a small job.
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
