---
id: "0028"
title: "Plan exhausted" reports stage completion as project completion
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
acceptance:
  - text: the grounding status names what it did NOT check, not only what passed
  - text: source alignment coverage appears in the daily report
  - text: concept-track state appears in the daily report, separately from the entity pipeline
  - text: a status that recommends an action names the prerequisites it did not verify
---

## Problem
Chad, 2026-09-06: "You can see why a simple 'plan exhausted' statement sounds
like we are not in the plan at all."

He is right, and it is a reporting defect rather than a wording one. The line
reads:

    plan exhausted — no enqueueable work left; switch mode to "general" when
    ready to spend

It is computed from four gates — disamb, reconcile, extract, hype — over the
hardcoded book list. It says nothing about, and cannot see:

* source-text alignment, which he specified on 2026-08-25 (item 0026)
* the concept-search tuning the seeding order existed to enable (0025)
* the concept track at all, which is a separate pipeline (0027)

So a message that recommends spending money is emitted by a check that verified
none of the prerequisites for spending it.

## The general rule worth adopting
A status that recommends an action must state what it did not check. "Ready"
computed from a subset of the requirements is worse than no status, because it
invites the action.
