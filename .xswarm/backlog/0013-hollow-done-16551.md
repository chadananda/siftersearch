---
id: "0013"
title: Book 16551 is marked done with zero extraction yield
state: ready
traces_to: .xswarm/GOAL.md
priority: P2
size: S
acceptance:
  - text: the cause of the zero yield on 16551 is established and written down
  - text: either the book is re-processed with a yield, or it is marked as legitimately empty with a reason
  - text: a completed book with zero mentions and zero concepts fails rather than warns
---

## Finding
`⚠ Hollow-done books: 1 disambiguated books with zero extraction yield —
16551(141¶ m=0 c=0)` — unchanged across at least four days of reports.

141 paragraphs in, zero mentions and zero concepts out, state "done". Either
extraction failed silently or the book genuinely contains nothing — and nobody
can tell which, which is the actual problem.
