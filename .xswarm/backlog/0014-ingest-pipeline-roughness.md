---
id: "0014"
title: The ingest and maintenance pipeline is rough
state: inbox
traces_to: .xswarm/GOAL.md
priority: P1
acceptance:
  - text: needs the specific roughness named before it can be worked
---

## Problem
Chad, 2026-09-06: "our regular ingest and maintain pipeline is very rough still."

## Waiting on specifics
Items 0002, 0012 and 0013 each address one symptom — misleading severity, a
dead diagnostic endpoint, silent zero-yield completion. This item holds the
general complaint until Chad names what else is rough, so the three specific
fixes are not mistaken for the whole answer.

## Observed, unprompted
* the blocking query in `pipeline-snapshot` is getting worse: 8.4s on 2026-09-05,
  9.7s on 2026-09-06, same query
* embedding backlog unchanged at 571 across reports
* answer cache: 522 entries, 15 lifetime hits
