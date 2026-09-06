---
id: "0020"
title: 95 tests are failing on main
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: L
acceptance:
  - text: the suite passes, or every remaining failure is individually justified in writing
  - text: git commit works without SKIP_CHECKS
  - text: the failing count appears in the daily ops report, so a red suite is visible
---

## Finding, 2026-09-06
`pnpm test` on main:

    Test Files   22 failed | 134 passed | 1 skipped   (157)
    Tests        95 failed | 1814 passed | 110 skipped | 4 todo   (2023)

The pre-commit hook aborts on test failure, so **no commit to this repository
succeeds** without `SKIP_CHECKS=1`. That is why several commits during the
2026-09-06 session appeared to succeed and did not — the hook aborted and the
error was piped away.

## Why this is P1 rather than housekeeping
* It blocks all work here. Every item in this backlog is gated behind it.
* A quality gate that everyone routinely bypasses stops being a gate. The
  documented escape exists for a last resort; with 95 failures it becomes the
  normal path, and the next real regression passes unnoticed.
* The daily ops report says "all critical checks passing" while the suite is
  red. Same defect as item 0002 — monitoring that cannot see the problem.

## Note
Not necessarily 95 separate bugs. 22 files failing suggests a smaller number of
shared causes — a changed fixture, a moved import, a schema drift. Establish the
cause count before estimating the work.
