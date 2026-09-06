---
id: "0012"
title: The exhaustion endpoint is unreachable
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: S
acceptance:
  - text: the endpoint answers, or its absence is reported as its own failing check
  - text: the grounding check no longer changes severity based on whether it could reach it
---

## Finding
`(exhaustion endpoint unreachable — cause unverified)` appears in every red
grounding alert. Something the health system depends on is down, and rather
than reporting that, the failure is folded into another check as a caveat.

A monitoring system that cannot reach part of itself should say so plainly.
