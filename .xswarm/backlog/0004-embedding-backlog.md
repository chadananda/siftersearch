---
id: "0004"
title: Embedding backlog is stalled at 571
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
acceptance:
  - text: the backlog drains, and the count moves between reports
  - text: the cause of the stall is written down, not merely cleared
  - text: a stalled backlog alerts rather than reporting ok
---

## Finding
`✓ Embedding backlog — 571 pending (was 571)`. Unchanged between reports and
reported as passing. Embedding is upstream of every search result, so this
sits underneath the retrieval quality complaints.
