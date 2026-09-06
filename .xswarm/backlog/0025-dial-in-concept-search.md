---
id: "0025"
title: Dial in concept search on the seeded books before spending on the library
state: ready
traces_to: docs/architecture/conceptual-track.md
priority: P1
size: M
acceptance:
  - text: concept retrieval is tested against the six books already run, with results recorded
  - text: a measure exists so "dialled in" is demonstrable rather than asserted
  - text: what changed as a result is written down, or it is stated that nothing needed to
---

## Problem
Chad, 2026-09-06: "we were supposed to test concept search on the first books
and dial it in before proceeding to do the rest of the library."

The doctrinal spine was seeded in a deliberately load-bearing order precisely so
this test could happen on a small, high-authority set. Concept extraction has
run on six books — God Passes By (3,753 claims), World Order (1,229), Citadel of
Faith (1,092), Messages (994), Advent of Divine Justice (469), Promised Day
(1,254). The tuning pass those runs were for has not happened.

## Why this gates the library
Spending on the whole corpus before the extractor is tuned buys volume at
whatever quality it currently has. The seeded books are the cheap place to find
out what needs changing.
