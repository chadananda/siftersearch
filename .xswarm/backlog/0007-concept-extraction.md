---
id: "0007"
title: Concept extraction that keeps progressing
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: L
depends_on: ["0001", "0002"]
acceptance:
  - text: concepts are extracted continuously, and the count rises between daily reports
  - text: a book that completes with zero extraction yield is a failure, not a warning
  - text: extraction yield per book is reported, so "done" means something was found
---

## Problem
Chad, 2026-09-06: concept extraction "is supposed to be extracting concepts but
seems to have stalled."

## The hollow-done signal
`⚠ Hollow-done books: 1 disambiguated books with zero extraction yield —
16551(141¶ m=0 c=0)`. A 141-paragraph book marked done having produced zero
mentions and zero concepts. That is a silent failure wearing a completion
state, and it is currently a warning.

If one book can complete empty, the completion count is not a progress measure.
